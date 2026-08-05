import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { ToastService } from './toast.service';
import { SoundNotificationService } from './sound-notification.service';
import { UnitContextService } from './unit-context.service';
import { supabase } from './supabase-client';

export interface NotificationState {
  isOpen: boolean;
  message: string;
  title: string;
  type: 'alert' | 'confirm' | 'prompt';
  confirmText: string;
  cancelText: string;
  inputType?: 'text' | 'textarea';
  placeholder?: string;
}

export type NotificationType = 'ifood' | 'kds' | 'inventory' | 'waiter' | 'payment' | 'rh' | 'whatsapp' | 'system';
export type NotificationSeverity = 'info' | 'warning' | 'error' | 'success';
export type NotificationFilter = 'all' | 'unread' | 'waiter' | 'ifood' | 'inventory' | 'rh' | 'whatsapp' | 'kds' | 'payment';

export interface SystemNotification {
  id: string;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  type: NotificationType;
  severity: NotificationSeverity;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: any;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private toastService = inject(ToastService);
  private soundService = inject(SoundNotificationService);
  private unitContext = inject(UnitContextService);

  notificationState = signal<NotificationState>({
    isOpen: false,
    message: '',
    title: '',
    type: 'alert',
    confirmText: 'OK',
    cancelText: 'Cancelar',
  });

  promptInputValue = signal('');
  private resolvePromise!: (value: any) => void;

  systemNotifications = signal<SystemNotification[]>([]);
  activeFilter = signal<NotificationFilter>('all');
  soundEnabled = signal<boolean>(true);

  unreadCount = computed(() => this.systemNotifications().filter(n => !n.read).length);

  filteredNotifications = computed(() => {
    const list = this.systemNotifications();
    const filter = this.activeFilter();

    if (filter === 'unread') {
      return list.filter(n => !n.read);
    }
    if (filter === 'all') {
      return list;
    }
    return list.filter(n => n.type === filter);
  });

  private pollingInterval: any;

  constructor() {
    effect(() => {
      const storeId = this.unitContext.activeUnitId();
      if (storeId) {
        this.loadNotifications(storeId);
        this.subscribeToNotifications(storeId);
        this.startPolling(storeId);
      } else {
        this.stopPolling();
      }
    });
  }

  private startPolling(storeId: string) {
    this.stopPolling();
    this.pollingInterval = setInterval(() => {
      this.pollNewNotifications(storeId);
    }, 10000);
  }

  private stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private async pollNewNotifications(storeId: string) {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error || !data) return;

      const currentIds = new Set(this.systemNotifications().map(n => n.id));
      const newModels = data.map(this.mapDbToModel);
      const addedNotifications = newModels.filter(n => !currentIds.has(n.id));

      if (addedNotifications.length > 0) {
        this.systemNotifications.set(newModels);
        
        // Play sound and show toast for the most recent new notification
        const latest = addedNotifications[0];
        if (this.soundEnabled()) {
           this.playSound(latest.type, latest.severity);
        }
        this.show(`${latest.title}: ${latest.message}`, latest.severity === 'error' ? 'error' : latest.severity === 'warning' ? 'warning' : 'info', 4500);
      } else {
        // Just update state in case read status changed
        this.systemNotifications.set(newModels);
      }
    } catch (e) {
      console.error('Failed to poll notifications', e);
    }
  }

  private async loadNotifications(storeId: string) {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching notifications:', error);
        return;
      }

      if (data) {
        this.systemNotifications.set(data.map(this.mapDbToModel));
      }
    } catch (e) {
      console.error('Failed to load notifications', e);
    }
  }

  private subscribeToNotifications(storeId: string) {
    supabase.channel(`notifications:store_id=eq.${storeId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `store_id=eq.${storeId}`
        },
        (payload) => {
          const newNotif = this.mapDbToModel(payload.new);
          // Check for duplicate to avoid showing toast twice if optimistic update or polling already added it
          const exists = this.systemNotifications().some(n => n.id === newNotif.id);
          if (exists) return;

          this.systemNotifications.update(current => [newNotif, ...current]);
          
          if (this.soundEnabled()) {
             this.playSound(newNotif.type, newNotif.severity);
          }
          
          this.show(`${newNotif.title}: ${newNotif.message}`, newNotif.severity === 'error' ? 'error' : newNotif.severity === 'warning' ? 'warning' : 'info', 4500);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `store_id=eq.${storeId}`
        },
        (payload) => {
          const updated = this.mapDbToModel(payload.new);
          this.systemNotifications.update(list => list.map(n => n.id === updated.id ? updated : n));
        }
      )
      .on(
         'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `store_id=eq.${storeId}`
        },
        (payload) => {
           this.systemNotifications.update(list => list.filter(n => n.id !== payload.old.id));
        }
      )
      .subscribe();
  }

  private mapDbToModel(dbRecord: any): SystemNotification {
    return {
      id: dbRecord.id,
      title: dbRecord.title,
      message: dbRecord.message,
      timestamp: new Date(dbRecord.created_at),
      read: dbRecord.is_read,
      type: dbRecord.type as NotificationType,
      severity: dbRecord.severity as NotificationSeverity,
      actionUrl: dbRecord.action_url,
      actionLabel: dbRecord.action_label,
      metadata: dbRecord.metadata,
    };
  }
  
  private playSound(type: string, severity: string) {
      if (type === 'waiter' || type === 'ifood') {
        this.soundService.playNewOrderSound();
      } else if (severity === 'error' || type === 'kds') {
        this.soundService.playDelayedOrderSound();
      } else if (severity === 'warning') {
        this.soundService.playAllergyAlertSound();
      } else {
        this.soundService.playConfirmationSound();
      }
  }

  async addSystemNotification(
    data: Omit<SystemNotification, 'id' | 'timestamp' | 'read'> & { showToast?: boolean }
  ): Promise<SystemNotification | null> {
    const storeId = this.unitContext.activeUnitId();
    if (!storeId) return null;

    const { data: inserted, error } = await supabase
      .from('notifications')
      .insert({
        store_id: storeId,
        title: data.title,
        message: data.message,
        type: data.type,
        severity: data.severity,
        action_url: data.actionUrl,
        action_label: data.actionLabel,
        metadata: data.metadata,
        is_read: false
      })
      .select()
      .single();

    if (error) {
      console.warn('Fallback to local memory for notification due to DB error (table might not exist yet):', error);
      const fallbackNotif: SystemNotification = {
        id: `local-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        title: data.title,
        message: data.message,
        timestamp: new Date(),
        read: false,
        type: data.type,
        severity: data.severity,
        actionUrl: data.actionUrl,
        actionLabel: data.actionLabel,
        metadata: data.metadata,
      };
      
      this.systemNotifications.update(current => [fallbackNotif, ...current]);
      
      if (this.soundEnabled()) {
         this.playSound(fallbackNotif.type, fallbackNotif.severity);
      }
      if (data.showToast !== false) {
         this.show(`${fallbackNotif.title}: ${fallbackNotif.message}`, fallbackNotif.severity === 'error' ? 'error' : fallbackNotif.severity === 'warning' ? 'warning' : 'info', 4500);
      }
      return fallbackNotif;
    }
    
    const dbModel = this.mapDbToModel(inserted);
    const exists = this.systemNotifications().some(n => n.id === dbModel.id);
    if (!exists) {
      this.systemNotifications.update(current => [dbModel, ...current]);
      
      if (this.soundEnabled()) {
         this.playSound(dbModel.type, dbModel.severity);
      }
      if (data.showToast !== false) {
         this.show(`${dbModel.title}: ${dbModel.message}`, dbModel.severity === 'error' ? 'error' : dbModel.severity === 'warning' ? 'warning' : 'info', 4500);
      }
    }
    
    return dbModel;
  }

  async markAsRead(id: string): Promise<void> {
    // Optimistic update
    this.systemNotifications.update(list =>
      list.map(n => (n.id === id ? { ...n, read: true } : n))
    );
    
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  }

  async markAllAsRead(): Promise<void> {
    const storeId = this.unitContext.activeUnitId();
    if (!storeId) return;

    this.systemNotifications.update(list =>
      list.map(n => ({ ...n, read: true }))
    );
    this.show('Todas as notificações foram marcadas como lidas.', 'success', 2500);
    
    await supabase.from('notifications').update({ is_read: true }).eq('store_id', storeId).eq('is_read', false);
  }

  async removeNotification(id: string): Promise<void> {
    this.systemNotifications.update(list => list.filter(n => n.id !== id));
    await supabase.from('notifications').delete().eq('id', id);
  }

  async clearAll(): Promise<void> {
    const storeId = this.unitContext.activeUnitId();
    if (!storeId) return;

    this.systemNotifications.set([]);
    this.show('Central de Notificações limpa com sucesso.', 'info', 2500);
    await supabase.from('notifications').delete().eq('store_id', storeId);
  }

  setFilter(filter: NotificationFilter): void {
    this.activeFilter.set(filter);
  }

  toggleSound(): boolean {
    this.soundEnabled.update(v => !v);
    this.soundService.toggleMute();
    this.show(`Sons de notificação ${this.soundEnabled() ? 'ativados' : 'desativados'}`, 'info', 2000);
    return this.soundEnabled();
  }

  simulateNotification(category?: NotificationType): void {
    const types: NotificationType[] = category ? [category] : ['waiter', 'ifood', 'inventory', 'kds', 'rh', 'whatsapp', 'payment'];
    const chosenType = types[Math.floor(Math.random() * types.length)];

    const tableNum = Math.floor(Math.random() * 20) + 1;
    const orderNum = Math.floor(Math.random() * 9000) + 1000;

    switch (chosenType) {
      case 'waiter':
        this.addSystemNotification({
          title: `Chamar Garçom - Mesa ${tableNum < 10 ? '0' + tableNum : tableNum}`,
          message: `Cliente da Mesa ${tableNum} solicitou atendimento urgente no Salão.`,
          type: 'waiter',
          severity: 'warning',
          actionUrl: '/pos',
          actionLabel: 'Ir para o PDV'
        });
        break;
      case 'ifood':
        this.addSystemNotification({
          title: `Novo Pedido iFood #${orderNum}`,
          message: `Pedido iFood recebido: 1x Combo Família + 2x Sucos Naturais.`,
          type: 'ifood',
          severity: 'info',
          actionUrl: '/ifood-kds',
          actionLabel: 'Ver no KDS iFood'
        });
        break;
      case 'inventory':
        this.addSystemNotification({
          title: 'Estoque Mínimo Atingido',
          message: 'Qeijo Mussarela fatiado atingiu 800g (Mínimo: 2.0 kg).',
          type: 'inventory',
          severity: 'warning',
          actionUrl: '/inventory',
          actionLabel: 'Conferir Estoque'
        });
        break;
      case 'kds':
        this.addSystemNotification({
          title: 'Atraso na Cozinha (KDS)',
          message: `Pedido #${orderNum} excedeu o tempo limite de 20 min na Praça Forno.`,
          type: 'kds',
          severity: 'error',
          actionUrl: '/kds',
          actionLabel: 'Abrir KDS'
        });
        break;
      case 'rh':
        this.addSystemNotification({
          title: 'Registro de Ponto em Aberto',
          message: 'Colaborador Carlos Mendes registrou entrada com divergência de horário.',
          type: 'rh',
          severity: 'info',
          actionUrl: '/time-clock',
          actionLabel: 'Ver Ponto Eletrônico'
        });
        break;
      case 'whatsapp':
        this.addSystemNotification({
          title: 'Nova Mensagem no WhatsApp',
          message: 'Mensagem recebida: "Qual o horário de funcionamento no feriado?"',
          type: 'whatsapp',
          severity: 'info',
          actionUrl: '/whatsapp-chats',
          actionLabel: 'Atender WhatsApp'
        });
        break;
      default:
        this.addSystemNotification({
          title: `Solicitação de Fechamento - Mesa ${tableNum}`,
          message: `Mesa ${tableNum} solicitou a conta parcial (R$ ${(Math.random() * 200 + 50).toFixed(2)}).`,
          type: 'payment',
          severity: 'info',
          actionUrl: '/pos',
          actionLabel: 'Ver Conta'
        });
        break;
    }
  }

  getTimeAgo(date: Date): string {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - new Date(date).getTime()) / 1000);

    if (diffInSeconds < 60) return 'Agora mesmo';
    if (diffInSeconds < 3600) return `Há ${Math.floor(diffInSeconds / 60)} min`;
    if (diffInSeconds < 86400) return `Há ${Math.floor(diffInSeconds / 3600)}h`;
    
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${day}/${month} às ${hours}:${minutes}`;
  }

  show(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', duration = 4000) {
    this.toastService.show(message, type, duration);
  }

  alert(message: string, title: string = 'Aviso'): Promise<void> {
    this.notificationState.set({
      isOpen: true,
      message,
      title,
      type: 'alert',
      confirmText: 'OK',
      cancelText: '',
    });
    return new Promise(resolve => {
      this.resolvePromise = () => resolve();
    });
  }

  confirm(message: string, title: string = 'Confirmação'): Promise<boolean> {
    this.notificationState.set({
      isOpen: true,
      message,
      title,
      type: 'confirm',
      confirmText: 'OK',
      cancelText: 'Cancelar',
    });
    return new Promise(resolve => {
      this.resolvePromise = resolve;
    });
  }
  
  prompt(
    message: string, 
    title: string, 
    options: { 
      inputType?: 'text' | 'textarea', 
      placeholder?: string, 
      initialValue?: string, 
      confirmText?: string 
    } = {}
  ): Promise<{ confirmed: boolean, value: string | null }> {
    this.promptInputValue.set(options.initialValue || '');
    this.notificationState.set({
      isOpen: true,
      message,
      title,
      type: 'prompt',
      confirmText: options.confirmText || 'Salvar',
      cancelText: 'Cancelar',
      inputType: options.inputType || 'textarea',
      placeholder: options.placeholder || '',
    });
    return new Promise(resolve => {
      this.resolvePromise = (confirmed: boolean) => {
        resolve({ confirmed, value: confirmed ? this.promptInputValue() : null });
      };
    });
  }

  private close(): void {
    this.notificationState.update(state => ({ ...state, isOpen: false }));
  }

  onConfirm(): void {
    this.close();
    if (this.resolvePromise) {
      if (this.notificationState().type === 'alert') {
        (this.resolvePromise as () => void)();
      } else {
        this.resolvePromise(true);
      }
    }
  }

  onCancel(): void {
    this.close();
    if (this.resolvePromise) {
      if (this.notificationState().type !== 'alert') {
        this.resolvePromise(false);
      }
    }
  }
}

