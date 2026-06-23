import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CdkDragDrop, moveItemInArray, transferArrayItem, CdkDrag, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { Order } from '../../models/db.models';
import { PosStateService } from '../../services/pos-state.service';
import { DeliveryDataService } from '../../services/delivery-data.service';
import { NotificationService } from '../../services/notification.service';
import { DeliveryDriversModalComponent } from './delivery-drivers-modal/delivery-drivers-modal.component';
import { DeliveryOrderModalComponent } from './delivery-order-modal/delivery-order-modal.component';
import { AssignDriverModalComponent } from './assign-driver-modal/assign-driver-modal.component';
import { DeliveryStateService } from '../../services/delivery-state.service';
import { DeliveryDetailsModalComponent } from './delivery-details-modal/delivery-details-modal.component';
import { CashierStateService } from '../../services/cashier-state.service';
import { DeliveryTrackingComponent } from './delivery-tracking/delivery-tracking.component';
import { WebhookService } from '../../services/webhook.service';

type DeliveryStatus = 'AWAITING_PREP' | 'IN_PREPARATION' | 'READY_FOR_DISPATCH' | 'OUT_FOR_DELIVERY' | 'DELIVERED';
type DeliveryView = 'kanban' | 'tracking';

interface OrderWithDriver extends Order {
  driverName?: string;
}

@Component({
  selector: 'app-delivery',
  standalone: true,
  imports: [CommonModule, CdkDropList, CdkDrag, CdkDropListGroup, DeliveryDriversModalComponent, DeliveryOrderModalComponent, AssignDriverModalComponent, DeliveryDetailsModalComponent, DeliveryTrackingComponent],
  templateUrl: './delivery.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeliveryComponent implements OnInit {
  private posState = inject(PosStateService);
  private deliveryDataService = inject(DeliveryDataService);
  private notificationService = inject(NotificationService);
  private deliveryState = inject(DeliveryStateService);
  private webhookService = inject(WebhookService);

  view = signal<DeliveryView>('kanban');

  isDriversModalOpen = signal(false);
  orderModalState = signal<'new' | Order | null>(null);
  
  isAssignDriverModalOpen = signal(false);
  ordersToAssignDriver = signal<OrderWithDriver[]>([]);
  
  isDetailsModalOpen = signal(false);
  selectedOrderForDetails = signal<OrderWithDriver | null>(null);
  
  isBatchMode = signal(false);
  selectedOrdersForBatch = signal<Set<string>>(new Set());

  todayDelivered = signal<OrderWithDriver[]>([]);
  
  deliveryOrders = computed<OrderWithDriver[]>(() => 
    this.posState.openOrders()
      .filter(o => o.order_type === 'External-Delivery')
      .map(o => ({...o, driverName: o.delivery_drivers?.name ?? 'Não atribuído' }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  );
  
  // Columns for the Kanban board
  fila = computed(() => this.deliveryOrders().filter(o => !o.delivery_status || o.delivery_status === 'AWAITING_PREP'));
  emPreparo = computed(() => this.deliveryOrders().filter(o => o.delivery_status === 'IN_PREPARATION'));
  prontoParaEnvio = computed(() => this.deliveryOrders().filter(o => o.delivery_status === 'READY_FOR_DISPATCH'));
  emRota = computed(() => this.deliveryOrders().filter(o => o.delivery_status === 'OUT_FOR_DELIVERY'));
  entregues = computed(() => 
    this.todayDelivered()
      .map(o => ({...o, driverName: o.delivery_drivers?.name ?? 'Não atribuído' }))
      .sort((a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime())
  );

  async ngOnInit() {
      await this.loadTodayDeliveredOrders();
  }

  async loadTodayDeliveredOrders() {
      const { data, error } = await this.deliveryDataService.getTodayDeliveredOrders();
      if (!error && data) {
          this.todayDelivered.set(data);
      }
  }

  drop(event: CdkDragDrop<OrderWithDriver[]>) {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      const movedOrder = event.previousContainer.data[event.previousIndex];
      const newStatus = event.container.id as DeliveryStatus;

      if (newStatus === 'OUT_FOR_DELIVERY' && !movedOrder.delivery_driver_id) {
        this.notificationService.show('Atribua um entregador antes de mover para "Em Rota".', 'warning');
        this.openAssignDriverModal(movedOrder);
        return;
      }
      
      if (newStatus === 'DELIVERED') {
        this.finalizeDelivery(movedOrder);
        // Don't do transferArrayItem here, as the order will disappear from openOrders
        // and the state will be updated via realtime, moving it to the 'entregues' list.
        return;
      }

      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex,
      );
      
      this.updateOrderStatus(movedOrder, newStatus);
    }
  }
  
  async updateOrderStatus(order: Order, status: DeliveryStatus) {
    const { success, error } = await this.deliveryDataService.updateDeliveryStatus(order.id, status);
    if (success) {
      this.webhookService.triggerWebhook('delivery.status_updated', {
        orderId: order.id,
        status: status,
        driverId: order.delivery_driver_id,
        timestamp: new Date().toISOString(),
        fullOrder: order
      });
      
      // Notify WhatsApp
      if (order.ifood_order_id?.startsWith('wa-') || order.ifood_order_id?.startsWith('test-ia-')) {
           try {
                console.log("Calling notify-status for WhatsApp:", order.id, status);
                const res = await fetch('/api/whatsapp/notify-status', {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({ orderId: order.id, status })
                });
                console.log("Notify Status Res:", res.status, await res.text());
           } catch(e) {
                console.error("Notify Status Err:", e);
           }
      }
    } else {
      this.notificationService.show(`Erro ao atualizar status do pedido: ${error?.message}`, 'error');
      // Realtime will eventually correct the UI, but an immediate revert could be implemented here if needed.
    }
  }

  openEditModal(order: Order) {
    if (order.delivery_status === 'OUT_FOR_DELIVERY' || order.delivery_status === 'DELIVERED') {
      this.notificationService.show('Não é possível editar um pedido que já está em rota ou foi entregue.', 'info');
      return;
    }
    this.orderModalState.set(order);
  }

  openAssignDriverModal(order: OrderWithDriver) {
    this.ordersToAssignDriver.set([order]);
    this.isAssignDriverModalOpen.set(true);
  }

  toggleBatchMode() {
      this.isBatchMode.update(v => !v);
      if(!this.isBatchMode()) {
          this.selectedOrdersForBatch.set(new Set());
      }
  }

  toggleOrderSelection(orderId: string) {
      this.selectedOrdersForBatch.update(set => {
          const newSet = new Set(set);
          if(newSet.has(orderId)) newSet.delete(orderId);
          else newSet.add(orderId);
          return newSet;
      });
  }

  openBatchAssignModal() {
      if(this.selectedOrdersForBatch().size === 0) return;
      
      const ordersToAssign = this.prontoParaEnvio().filter(o => this.selectedOrdersForBatch().has(o.id));
      this.ordersToAssignDriver.set(ordersToAssign);
      this.isAssignDriverModalOpen.set(true);
  }

  async handleDriverAssigned(event: { driverId: string }) {
    this.isAssignDriverModalOpen.set(false);
    const orders = this.ordersToAssignDriver();
    if (!orders || orders.length === 0) return;

    const driver = this.deliveryState.deliveryDrivers().find(d => d.id === event.driverId);
    if (!driver) {
        this.notificationService.show('Entregador não encontrado.', 'error');
        return;
    }

    // Process all orders in parallel or sequentially
    let successCount = 0;
    let lastError: any = null;
    
    for(const order of orders) {
        const distance = order.delivery_distance_km ?? 0;
        const deliveryCost = (driver.base_rate ?? 0) + ((driver.rate_per_km ?? 0) * distance);
        
        const { success, error } = await this.deliveryDataService.assignDriverToOrder(order.id, event.driverId, distance, deliveryCost);
    
        if (success) {
          successCount++;
          this.webhookService.triggerWebhook('delivery.status_updated', {
            orderId: order.id,
            status: 'OUT_FOR_DELIVERY',
            driverId: event.driverId,
            timestamp: new Date().toISOString(),
            fullOrder: order
          });
        } else {
          lastError = error;
        }
    }
    
    if(successCount > 0) {
        this.notificationService.show(`Atribuído(s) com sucesso e movido(s) para "Em Rota"!`, 'success');
        this.selectedOrdersForBatch.set(new Set()); // clear batch selection
        this.isBatchMode.set(false);
    } else {
        const errMsg = lastError?.message || lastError?.details || 'Erro desconhecido';
        this.notificationService.show(`Erro ao atribuir entregador: ${errMsg}`, 'error');
    }
  }

  async finalizeDelivery(order: OrderWithDriver) {
    const confirmed = await this.notificationService.confirm(
      `Confirmar a finalização da entrega para o pedido #${order.id.slice(0, 8)}?`,
      'Finalizar Entrega'
    );
    if (!confirmed) return;

    const { success, error } = await this.deliveryDataService.finalizeDeliveryOrder(order);
    if (success) {
      this.notificationService.show('Entrega finalizada com sucesso!', 'success');
      
      this.todayDelivered.update(list => [{...order, status: 'COMPLETED', delivery_status: 'DELIVERED', completed_at: new Date().toISOString()}, ...list]);

      this.webhookService.triggerWebhook('delivery.status_updated', {
        orderId: order.id,
        status: 'DELIVERED',
        driverId: order.delivery_driver_id,
        timestamp: new Date().toISOString(),
        fullOrder: order
      });
    } else {
      this.notificationService.show(`Erro ao finalizar entrega: ${error?.message}`, 'error');
    }
  }

  openDetailsModal(order: OrderWithDriver) {
    this.selectedOrderForDetails.set(order);
    this.isDetailsModalOpen.set(true);
  }

  closeDetailsModal() {
    this.isDetailsModalOpen.set(false);
    this.selectedOrderForDetails.set(null);
  }
  
  getOrderTotal(order: Order): number {
    const itemsTotal = order.order_items.filter((i: any) => !(i.notes?.includes('[AUX_PREP_IDX:') && !i.notes?.includes('[AUX_PREP_IDX:0]'))).reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
    const deliveryCost = order.delivery_cost ?? 0;
    return itemsTotal + deliveryCost;
  }
}