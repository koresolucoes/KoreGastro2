import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, OnDestroy, untracked, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { IfoodDataService } from '../../services/ifood-data.service';
import { PosDataService } from '../../services/pos-data.service';
import { Order, OrderItem, IfoodOrderStatus, OrderItemStatus, OrderStatus, IfoodWebhookLog } from '../../models/db.models';
import { NotificationService } from '../../services/notification.service';
import { SoundNotificationService } from '../../services/sound-notification.service';
import { supabase } from '../../services/supabase-client';

interface ProcessedIfoodOrder extends Order {
  elapsedTime: number;
  isLate: boolean;
  timerColor: string;
  ifoodStatus: IfoodOrderStatus;
}

@Component({
  selector: 'app-ifood-kds',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ifood-kds.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IfoodKdsComponent implements OnInit, OnDestroy {
  stateService = inject(SupabaseStateService);
  ifoodDataService = inject(IfoodDataService);
  posDataService = inject(PosDataService);
  notificationService = inject(NotificationService);
  soundNotificationService = inject(SoundNotificationService);

  private timerInterval: any;
  currentTime = signal(Date.now());
  
  private processedNewOrders = signal<Set<string>>(new Set());
  
  // New state for webhook logs
  isLogVisible = signal(false);
  webhookLogs = computed(() => 
    this.stateService.ifoodWebhookLogs()
      .sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  );
  selectedLogForDetail = signal<IfoodWebhookLog | null>(null);

  constructor() {
    effect(() => {
        const orders = this.processedOrders();
        const currentOrderIds = new Set(orders.map(o => o.id));
        
        untracked(() => {
            const previouslyProcessed = this.processedNewOrders();
            for(const order of orders) {
                if (!previouslyProcessed.has(order.id) && order.ifoodStatus === 'RECEIVED') {
                    this.soundNotificationService.playNewOrderSound();
                }
            }
            this.processedNewOrders.set(currentOrderIds);
        });
    });
  }

  ngOnInit(): void {
    this.timerInterval = setInterval(() => this.currentTime.set(Date.now()), 1000);
  }

  ngOnDestroy(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  private getIfoodStatus(order: Order): IfoodOrderStatus {
    if (order.status === 'CANCELLED') {
      return 'CANCELLED';
    }

    const items = order.order_items || [];
    if (items.length === 0) {
      return 'RECEIVED';
    }

    const allReadyOrServed = items.every(i => i.status === 'PRONTO' || i.status === 'SERVIDO');
    if (allReadyOrServed) {
      return order.order_type === 'iFood-Delivery' ? 'DISPATCHED' : 'READY_FOR_PICKUP';
    }

    const hasPreparing = items.some(i => i.status === 'EM_PREPARO');
    if (hasPreparing) {
      return 'IN_PREPARATION';
    }
    
    // If not preparing and not all ready, it means at least one item is PENDENTE.
    return 'RECEIVED';
  }

  processedOrders = computed<ProcessedIfoodOrder[]>(() => {
    const now = this.currentTime();
    return this.stateService.openOrders()
      .filter(o => o.order_type === 'iFood-Delivery' || o.order_type === 'iFood-Takeout')
      .map(order => {
        const createdAt = new Date(order.created_at).getTime();
        const elapsedTime = Math.floor((now - createdAt) / 1000);
        const isLate = elapsedTime > 600; // Late after 10 minutes

        let timerColor = 'text-green-300';
        if (elapsedTime > 300) timerColor = 'text-yellow-300'; // 5 mins
        if (isLate) timerColor = 'text-red-300';

        return {
          ...order,
          elapsedTime,
          isLate,
          timerColor,
          ifoodStatus: this.getIfoodStatus(order)
        };
      })
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  });

  receivedOrders = computed(() => this.processedOrders().filter(o => o.ifoodStatus === 'RECEIVED'));
  inPreparationOrders = computed(() => this.processedOrders().filter(o => o.ifoodStatus === 'IN_PREPARATION'));
  readyOrders = computed(() => this.processedOrders().filter(o => o.ifoodStatus === 'DISPATCHED' || o.ifoodStatus === 'READY_FOR_PICKUP'));

  async updateStatus(order: Order, status: IfoodOrderStatus) {
    if (!order.ifood_order_id) return;
    
    this.soundNotificationService.playConfirmationSound();
    
    // In a real scenario, this would send CONFIRMED, then DISPATCHED etc.
    // For this flow, we just log the action.
    const { success, error: apiError } = await this.ifoodDataService.sendStatusUpdate(order.ifood_order_id, status);
    if (!success) {
        this.notificationService.show(`Falha ao comunicar com iFood: ${apiError?.message}`, 'error');
        return;
    }

    let targetStatus: OrderItemStatus | null = null;
    let orderStatus: OrderStatus | null = null;
    let itemSelector: ((item: OrderItem) => boolean) | null = null;
    
    switch(status) {
        case 'IN_PREPARATION': 
            targetStatus = 'EM_PREPARO';
            itemSelector = (i) => i.status === 'PENDENTE';
            break;
        case 'DISPATCHED':
        case 'READY_FOR_PICKUP':
            targetStatus = 'PRONTO';
            // Only update items that are not already finished
            itemSelector = (i) => i.status === 'PENDENTE' || i.status === 'EM_PREPARO';
            break;
        case 'CANCELLED': 
            orderStatus = 'CANCELLED';
            break;
    }

    if (targetStatus && itemSelector) {
        const itemIdsToUpdate = (order.order_items || []).filter(itemSelector).map(i => i.id);
        if (itemIdsToUpdate.length > 0) {
            const { error } = await supabase.from('order_items').update({ status: targetStatus }).in('id', itemIdsToUpdate);
            if(error) this.notificationService.show(`Erro ao atualizar itens: ${error.message}`, 'error');
        }
    }
    
    if (orderStatus) {
        const { error } = await supabase.from('orders').update({ status: orderStatus }).eq('id', order.id);
        if(error) this.notificationService.show(`Erro ao atualizar pedido: ${error.message}`, 'error');
    }
  }
  
  formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  
  openLogDetailModal(log: IfoodWebhookLog) {
    this.selectedLogForDetail.set(log);
  }
  
  closeLogDetailModal() {
    this.selectedLogForDetail.set(null);
  }

  getLogStatusClass(status: string | null): string {
    if (!status) return 'bg-gray-600';
    if (status.startsWith('SUCCESS')) return 'bg-green-600';
    if (status.startsWith('ERROR')) return 'bg-red-600';
    return 'bg-blue-600';
  }
}
