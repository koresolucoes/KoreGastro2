import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, OnDestroy, untracked, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { IfoodDataService } from '../../services/ifood-data.service';
import { PosDataService } from '../../services/pos-data.service';
import { Order, OrderItem, IfoodOrderStatus, OrderItemStatus, OrderStatus, IfoodWebhookLog } from '../../models/db.models';
import { NotificationService } from '../../services/notification.service';
import { SoundNotificationService } from '../../services/sound-notification.service';

interface ProcessedIfoodOrder extends Order {
  elapsedTime: number;
  isLate: boolean;
  timerColor: string;
  ifoodStatus: IfoodOrderStatus;
  logisticsStatus: LogisticsStatus | null;
  requiresDeliveryCode: boolean;
}

type LogisticsStatus = 'AWAITING_DRIVER' | 'ASSIGNED' | 'GOING_TO_ORIGIN' | 'ARRIVED_AT_ORIGIN' | 'DISPATCHED_TO_CUSTOMER' | 'ARRIVED_AT_DESTINATION';

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
  
  // State for webhook logs
  isLogVisible = signal(false);
  webhookLogs = computed(() => 
    this.stateService.ifoodWebhookLogs()
      .sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  );
  selectedLogForDetail = signal<IfoodWebhookLog | null>(null);

  // New state for UI interactions
  updatingOrders = signal<Set<string>>(new Set());
  isDetailModalOpen = signal(false);
  selectedOrderForDetail = signal<ProcessedIfoodOrder | null>(null);

  // New state for logistics modals
  isAssignDriverModalOpen = signal(false);
  isVerifyCodeModalOpen = signal(false);
  orderForDriverModal = signal<ProcessedIfoodOrder | null>(null);
  orderForCodeModal = signal<ProcessedIfoodOrder | null>(null);
  driverForm = signal({ name: '', phone: '', vehicle: 'MOTORCYCLE' });
  verificationCode = signal('');


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
  
  private getLogisticsStatus(order: Order, logs: IfoodWebhookLog[]): LogisticsStatus | null {
    if (order.delivery_info?.deliveredBy !== 'IFOOD') {
        return null;
    }

    const relevantLogs = logs
        .filter(log => log.ifood_order_id === order.ifood_order_id && log.event_code)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const latestStatusLog = relevantLogs.find(log => 
        ['ASSIGNED_DRIVER', 'GOING_TO_ORIGIN', 'ARRIVED_AT_ORIGIN', 'DISPATCHED', 'ARRIVED_AT_DESTINATION'].includes(log.event_code!)
    );

    if (latestStatusLog) {
        switch(latestStatusLog.event_code) {
            case 'ASSIGNED_DRIVER': return 'ASSIGNED';
            case 'GOING_TO_ORIGIN': return 'GOING_TO_ORIGIN';
            case 'ARRIVED_AT_ORIGIN': return 'ARRIVED_AT_ORIGIN';
            case 'DISPATCHED': return 'DISPATCHED_TO_CUSTOMER';
            case 'ARRIVED_AT_DESTINATION': return 'ARRIVED_AT_DESTINATION';
        }
    }
    
    const allItemsReady = (order.order_items || []).every(i => i.status === 'PRONTO' || i.status === 'SERVIDO');
    if (allItemsReady) {
        return 'AWAITING_DRIVER';
    }

    return null;
  }

  processedOrders = computed<ProcessedIfoodOrder[]>(() => {
    const now = this.currentTime();
    const allLogs = this.webhookLogs();

    return this.stateService.openOrders()
      .filter(o => o.order_type === 'iFood-Delivery' || o.order_type === 'iFood-Takeout')
      .map(order => {
        const createdAt = new Date(order.created_at).getTime();
        const elapsedTime = Math.floor((now - createdAt) / 1000);
        const isLate = elapsedTime > 600; // Late after 10 minutes

        let timerColor = 'text-green-300';
        if (elapsedTime > 300) timerColor = 'text-yellow-300'; // 5 mins
        if (isLate) timerColor = 'text-red-300';

        const requiresCode = allLogs.some(log => log.ifood_order_id === order.ifood_order_id && log.event_code === 'DELIVERY_DROP_CODE_REQUESTED');

        return {
          ...order,
          elapsedTime,
          isLate,
          timerColor,
          ifoodStatus: this.getIfoodStatus(order),
          logisticsStatus: this.getLogisticsStatus(order, allLogs),
          requiresDeliveryCode: requiresCode,
        };
      })
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  });

  receivedOrders = computed(() => this.processedOrders().filter(o => o.ifoodStatus === 'RECEIVED'));
  inPreparationOrders = computed(() => this.processedOrders().filter(o => o.ifoodStatus === 'IN_PREPARATION'));
  readyOrders = computed(() => this.processedOrders().filter(o => o.ifoodStatus === 'DISPATCHED' || o.ifoodStatus === 'READY_FOR_PICKUP'));

  async confirmOrderAndPrepare(order: ProcessedIfoodOrder) {
    if (!order.ifood_order_id) return;
    
    this.updatingOrders.update(set => new Set(set).add(order.id));
    this.soundNotificationService.playConfirmationSound();

    try {
        // First, confirm with iFood API
        const { success: apiSuccess, error: apiError } = await this.ifoodDataService.sendStatusUpdate(order.ifood_order_id, 'CONFIRMED');
        if (!apiSuccess) throw apiError;
        
        // Then, update our internal status
        const itemIdsToUpdate = (order.order_items || []).filter(i => i.status === 'PENDENTE').map(i => i.id);
        if (itemIdsToUpdate.length > 0) {
            const { success: dbSuccess, error: dbError } = await this.posDataService.updateMultipleItemStatuses(itemIdsToUpdate, 'EM_PREPARO');
            if (!dbSuccess) throw dbError;
        }

    } catch (error: any) {
        this.notificationService.show(`Erro ao confirmar pedido: ${error.message}`, 'error');
    } finally {
        this.updatingOrders.update(set => {
            const newSet = new Set(set);
            newSet.delete(order.id);
            return newSet;
        });
    }
  }

  async markOrderAsReadyForDispatch(order: ProcessedIfoodOrder) {
      if (!order.ifood_order_id) return;
      
      this.updatingOrders.update(set => new Set(set).add(order.id));
      this.soundNotificationService.playConfirmationSound();
      
      const targetStatus: IfoodOrderStatus = order.delivery_info?.deliveredBy === 'IFOOD' ? 'READY_FOR_PICKUP' : 'DISPATCHED';

      try {
          const { success: apiSuccess, error: apiError } = await this.ifoodDataService.sendStatusUpdate(order.ifood_order_id, targetStatus);
          if (!apiSuccess) throw apiError;
          
          const itemIdsToUpdate = (order.order_items || []).filter(i => i.status === 'PENDENTE' || i.status === 'EM_PREPARO').map(i => i.id);
          if (itemIdsToUpdate.length > 0) {
              const { success: dbSuccess, error: dbError } = await this.posDataService.updateMultipleItemStatuses(itemIdsToUpdate, 'PRONTO');
              if (!dbSuccess) throw dbError;
          }

      } catch (error: any) {
          this.notificationService.show(`Erro ao marcar como pronto: ${error.message}`, 'error');
      } finally {
          this.updatingOrders.update(set => {
              const newSet = new Set(set);
              newSet.delete(order.id);
              return newSet;
          });
      }
  }

  async cancelOrder(order: ProcessedIfoodOrder) {
      if (!order.ifood_order_id) return;
      
      const confirmed = await this.notificationService.confirm(`Tem certeza que deseja cancelar o pedido #${order.ifood_display_id}?`, 'Cancelar Pedido');
      if (!confirmed) return;

      this.updatingOrders.update(set => new Set(set).add(order.id));
      this.soundNotificationService.playConfirmationSound();

      try {
          const { success: apiSuccess, error: apiError } = await this.ifoodDataService.sendStatusUpdate(order.ifood_order_id, 'CANCELLED');
          if (!apiSuccess) throw apiError;
          
          const { success: dbSuccess, error: dbError } = await this.posDataService.cancelOrder(order.id);
          if (!dbSuccess) throw dbError;

          this.notificationService.show(`Pedido #${order.ifood_display_id} cancelado.`, 'success');
          this.closeDetailModal();

      } catch (error: any) {
          this.notificationService.show(`Erro ao cancelar pedido: ${error.message}`, 'error');
      } finally {
          this.updatingOrders.update(set => {
              const newSet = new Set(set);
              newSet.delete(order.id);
              return newSet;
          });
      }
  }

  async deleteOrder(order: ProcessedIfoodOrder) {
      const confirmed = await this.notificationService.confirm(`Tem certeza que deseja DELETAR PERMANENTEMENTE o pedido #${order.ifood_display_id}? Esta ação não pode ser desfeita.`, 'Deletar Pedido?');
      if (!confirmed) return;

      this.updatingOrders.update(set => new Set(set).add(order.id));

      try {
          const { success, error } = await this.posDataService.deleteOrderAndItems(order.id);
          if (!success) throw error;
          
          this.notificationService.show(`Pedido #${order.ifood_display_id} deletado com sucesso.`, 'success');
          this.closeDetailModal();

      } catch (error: any) {
          this.notificationService.show(`Erro ao deletar pedido: ${error.message}`, 'error');
      } finally {
          this.updatingOrders.update(set => {
              const newSet = new Set(set);
              newSet.delete(order.id);
              return newSet;
          });
      }
  }
  
  // --- LOGISTICS METHODS ---
  openAssignDriverModal(order: ProcessedIfoodOrder) {
    this.orderForDriverModal.set(order);
    this.driverForm.set({ name: '', phone: '', vehicle: 'MOTORCYCLE' });
    this.isAssignDriverModalOpen.set(true);
  }
  closeAssignDriverModal() { this.isAssignDriverModalOpen.set(false); }

  async assignDriver() {
    const order = this.orderForDriverModal();
    const form = this.driverForm();
    if (!order || !order.ifood_order_id || !form.name || !form.phone) {
      this.notificationService.show('Nome e telefone do entregador são obrigatórios.', 'warning');
      return;
    }
    await this.handleLogisticsAction(order.id, order.ifood_order_id, 'assignDriver', {
      workerName: form.name,
      workerPhone: form.phone,
      workerVehicleType: form.vehicle
    });
    this.closeAssignDriverModal();
  }

  async updateLogisticsStatus(order: ProcessedIfoodOrder, action: 'goingToOrigin' | 'arrivedAtOrigin' | 'dispatch' | 'arrivedAtDestination') {
    if (!order.ifood_order_id) return;
    await this.handleLogisticsAction(order.id, order.ifood_order_id, action);
  }

  openVerifyCodeModal(order: ProcessedIfoodOrder) {
    this.orderForCodeModal.set(order);
    this.verificationCode.set('');
    this.isVerifyCodeModalOpen.set(true);
  }
  closeVerifyCodeModal() { this.isVerifyCodeModalOpen.set(false); }
  
  async submitVerificationCode() {
    const order = this.orderForCodeModal();
    const code = this.verificationCode();
    if (!order || !order.ifood_order_id || !code || code.length !== 4) {
      this.notificationService.show('O código de verificação deve ter 4 dígitos.', 'warning');
      return;
    }
    await this.handleLogisticsAction(order.id, order.ifood_order_id, 'verifyDeliveryCode', { code });
    this.closeVerifyCodeModal();
  }

  private async handleLogisticsAction(orderId: string, ifoodOrderId: string, action: string, details?: any) {
    this.updatingOrders.update(set => new Set(set).add(orderId));
    try {
      const { success, error } = await this.ifoodDataService.sendLogisticsAction(ifoodOrderId, action, details);
      if (!success) throw error;
      // Manually refetch logs to update the UI state
      await this.stateService.refetchIfoodLogs(); 
    } catch (error: any) {
      this.notificationService.show(`Erro na ação de logística: ${error.message}`, 'error');
    } finally {
       this.updatingOrders.update(set => {
            const newSet = new Set(set);
            newSet.delete(orderId);
            return newSet;
        });
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

  openDetailModal(order: ProcessedIfoodOrder) {
    this.selectedOrderForDetail.set(order);
    this.isDetailModalOpen.set(true);
  }

  closeDetailModal() {
    this.isDetailModalOpen.set(false);
    this.selectedOrderForDetail.set(null);
  }

  getLogStatusClass(status: string | null): string {
    if (!status) return 'bg-gray-600';
    if (status.startsWith('SUCCESS')) return 'bg-green-600';
    if (status.startsWith('ERROR')) return 'bg-red-600';
    return 'bg-blue-600';
  }
}