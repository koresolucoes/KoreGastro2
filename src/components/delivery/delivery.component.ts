import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
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

type DeliveryStatus = 'AWAITING_PREP' | 'IN_PREPARATION' | 'READY_FOR_DISPATCH' | 'OUT_FOR_DELIVERY' | 'DELIVERED';
interface OrderWithDriver extends Order {
  driverName?: string;
}

@Component({
  selector: 'app-delivery',
  standalone: true,
  imports: [CommonModule, CdkDropList, CdkDrag, CdkDropListGroup, DeliveryDriversModalComponent, DeliveryOrderModalComponent, AssignDriverModalComponent],
  templateUrl: './delivery.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeliveryComponent {
  private posState = inject(PosStateService);
  private deliveryDataService = inject(DeliveryDataService);
  private notificationService = inject(NotificationService);
  private deliveryState = inject(DeliveryStateService);

  isDriversModalOpen = signal(false);
  orderModalState = signal<'new' | Order | null>(null);
  
  isAssignDriverModalOpen = signal(false);
  orderToAssignDriver = signal<OrderWithDriver | null>(null);
  
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
    this.posState.orders()
      .filter(o => o.order_type === 'External-Delivery' && o.delivery_status === 'DELIVERED')
      .map(o => ({...o, driverName: o.delivery_drivers?.name ?? 'Não atribuído' }))
      .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())
  );


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
      
      this.updateOrderStatus(movedOrder.id, newStatus);
    }
  }
  
  async updateOrderStatus(orderId: string, status: DeliveryStatus) {
    const { success, error } = await this.deliveryDataService.updateDeliveryStatus(orderId, status);
    if (!success) {
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
    this.orderToAssignDriver.set(order);
    this.isAssignDriverModalOpen.set(true);
  }

  async handleDriverAssigned(event: { driverId: string }) {
    this.isAssignDriverModalOpen.set(false);
    const order = this.orderToAssignDriver();
    if (!order) return;

    const driver = this.deliveryState.deliveryDrivers().find(d => d.id === event.driverId);
    if (!driver) {
        this.notificationService.show('Entregador não encontrado.', 'error');
        return;
    }

    const distance = order.delivery_distance_km ?? 0;
    const deliveryCost = driver.base_rate + (driver.rate_per_km * distance);
    
    const { success, error } = await this.deliveryDataService.assignDriverToOrder(order.id, event.driverId, distance, deliveryCost);

    if (success) {
      this.notificationService.show('Entregador atribuído e pedido movido para "Em Rota"!', 'success');
    } else {
      this.notificationService.show(`Erro ao atribuir entregador: ${error?.message}`, 'error');
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
    } else {
      this.notificationService.show(`Erro ao finalizar entrega: ${error?.message}`, 'error');
    }
  }
}