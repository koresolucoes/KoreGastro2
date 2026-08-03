import { Injectable, signal, computed, inject } from '@angular/core';
import { ToastService } from './toast.service';
import { SoundNotificationService } from './sound-notification.service';

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
export type NotificationFilter = 'all' | 'unread' | 'waiter' | 'ifood' | 'inventory' | 'rh' | 'whatsapp';

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

  // System Notifications Central State
  systemNotifications = signal<SystemNotification[]>([
    {
      id: 'notif-1',
      title: 'Chamar Garçom - Mesa 04',
      message: 'Cliente da Mesa 04 (Salão Principal) solicitou atendimento presencial.',
      timestamp: new Date(Date.now() - 3 * 60 * 1000),
      read: false,
      type: 'waiter',
      severity: 'warning',
      actionUrl: '/pos',
      actionLabel: 'Atender Mesa'
    },
    {
      id: 'notif-2',
      title: 'Novo Pedido iFood #4829',
      message: 'Pedido iFood recebido: 2x Burger Artesanal + 2x Batata Rústica + 2x Bebidas.',
      timestamp: new Date(Date.now() - 15 * 60 * 1000),
      read: false,
      type: 'ifood',
      severity: 'info',
      actionUrl: '/ifood-kds',
      actionLabel: 'Ver no KDS iFood'
    },
    {
      id: 'notif-3',
      title: 'Estoque Crítico: Filé Mignon',
      message: 'Insumo Filé Mignon Alcatra atingiu 1,2 kg (Estoque Mínimo: 3,0 kg).',
      timestamp: new Date(Date.now() - 42 * 60 * 1000),
      read: false,
      type: 'inventory',
      severity: 'warning',
      actionUrl: '/inventory',
      actionLabel: 'Ver Estoque'
    },
    {
      id: 'notif-4',
      title: 'Alerta de Atraso na Cozinha',
      message: 'Pedido Delivery #1042 está há 28min na praça Grelha sem ser finalizado.',
      timestamp: new Date(Date.now() - 65 * 60 * 1000),
      read: true,
      type: 'kds',
      severity: 'error',
      actionUrl: '/kds',
      actionLabel: 'Abrir KDS'
    },
    {
      id: 'notif-5',
      title: 'Solicitação de Ausência RH',
      message: 'O colaborador João Silva solicitou abono de falta para o dia 15/08.',
      timestamp: new Date(Date.now() - 120 * 60 * 1000),
      read: true,
      type: 'rh',
      severity: 'info',
      actionUrl: '/leave-management',
      actionLabel: 'Analisar RH'
    },
    {
      id: 'notif-6',
      title: 'Mensagem de Cliente no WhatsApp',
      message: 'Cliente Maria Santos: "Boa tarde, gostaria de agendar uma mesa para 6 pessoas hoje."',
      timestamp: new Date(Date.now() - 180 * 60 * 1000),
      read: true,
      type: 'whatsapp',
      severity: 'info',
      actionUrl: '/whatsapp-chats',
      actionLabel: 'Responder Chat'
    }
  ]);

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

  /**
   * Adds a new system notification and triggers sound / toast feedback.
   */
  addSystemNotification(
    data: Omit<SystemNotification, 'id' | 'timestamp' | 'read'> & { showToast?: boolean }
  ): SystemNotification {
    const newNotif: SystemNotification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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

    this.systemNotifications.update(current => [newNotif, ...current]);

    // Play Sound Notification according to type and severity
    if (this.soundEnabled()) {
      if (data.type === 'waiter' || data.type === 'ifood') {
        this.soundService.playNewOrderSound();
      } else if (data.severity === 'error' || data.type === 'kds') {
        this.soundService.playDelayedOrderSound();
      } else if (data.severity === 'warning') {
        this.soundService.playAllergyAlertSound();
      } else {
        this.soundService.playConfirmationSound();
      }
    }

    // Show a short non-blocking toast
    if (data.showToast !== false) {
      this.show(`${data.title}: ${data.message}`, data.severity === 'error' ? 'error' : data.severity === 'warning' ? 'warning' : 'info', 4500);
    }

    return newNotif;
  }

  markAsRead(id: string): void {
    this.systemNotifications.update(list =>
      list.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  }

  markAllAsRead(): void {
    this.systemNotifications.update(list =>
      list.map(n => ({ ...n, read: true }))
    );
    this.show('Todas as notificações foram marcadas como lidas.', 'success', 2500);
  }

  removeNotification(id: string): void {
    this.systemNotifications.update(list => list.filter(n => n.id !== id));
  }

  clearAll(): void {
    this.systemNotifications.set([]);
    this.show('Central de Notificações limpa com sucesso.', 'info', 2500);
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

  /**
   * Helper simulation triggers for instant demo/testing
   */
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

  /**
   * Helper to format human-readable relative time
   */
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

  /**
   * Shows a short, non-blocking notification message.
   * @param message The message to display.
   * @param type The type of toast ('success', 'error', 'info', 'warning').
   * @param duration The duration in milliseconds.
   */
  show(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', duration = 4000) {
    this.toastService.show(message, type, duration);
  }

  /**
   * Shows a modal dialog that requires user interaction. Use for critical information.
   * For simple success/error messages, prefer `show()`.
   * @param message The message to display.
   * @param title The title of the modal.
   * @deprecated Use `show()` for non-blocking feedback or `confirm()` for user decisions. This is for critical, blocking alerts.
   */
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

