import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CdkDragDrop, moveItemInArray, transferArrayItem, CdkDrag, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { Order } from '../../models/db.models';
import { PosStateService } from '../../services/pos-state.service';
import { DeliveryDataService } from '../../services/delivery-data.service';
import { NotificationService } from '../../services/notification.service';
import { DeliveryDriversModalComponent } from './delivery-drivers-modal/delivery-drivers-modal.component';

type DeliveryStatus = 'AWAITING_PREP' | 'IN_PREPARATION' | 'READY_FOR_DISPATCH' | 'OUT_FOR_DELIVERY' | 'DELIVERED';
interface OrderWithDriver extends Order {
  driverName?: string;
}

@Component({
  selector: 'app-delivery',
  standalone: true,
  imports: [CommonModule, CdkDropList, CdkDrag, CdkDropListGroup, DeliveryDriversModalComponent],
  templateUrl: './delivery.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeliveryComponent {
  private posState = inject(PosStateService);
  private deliveryDataService = inject(DeliveryDataService);
  private notificationService = inject(NotificationService);

  isDriversModalOpen = signal(false);
  isOrderModalOpen = signal(false); // Placeholder for future modal
  
  deliveryOrders = computed<OrderWithDriver[]>(() => 
    this.posState.openOrders()
      .filter(o => o.order_type === 'External-Delivery')
      .map(o => ({...o, driverName: o.delivery_drivers?.name ?? 'Não atribuído' }))
  );
  
  // Columns for the Kanban board
  fila = computed(() => this.deliveryOrders().filter(o => !o.delivery_status || o.delivery_status === 'AWAITING_PREP'));
  emPreparo = computed(() => this.deliveryOrders().filter(o => o.delivery_status === 'IN_PREPARATION'));
  prontoParaEnvio = computed(() => this.deliveryOrders().filter(o => o.delivery_status === 'READY_FOR_DISPATCH'));
  emRota = computed(() => this.deliveryOrders().filter(o => o.delivery_status === 'OUT_FOR_DELIVERY'));

  drop(event: CdkDragDrop<OrderWithDriver[]>) {
    if (event.previousContainer === event.container) {
      // Reordering within the same list (not really necessary for this UI, but good practice)
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      // Moving item to a new list
      const movedOrder = event.previousContainer.data[event.previousIndex];
      const newStatus = event.container.id as DeliveryStatus;

      // Handle special logic, e.g., assigning a driver
      if (newStatus === 'OUT_FOR_DELIVERY' && !movedOrder.delivery_driver_id) {
        this.notificationService.show('Atribua um entregador antes de mover para "Em Rota".', 'warning');
        // TODO: Open driver assignment modal here
        return; // Prevent the move
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
      // Here you might want to add logic to revert the item's position in the UI
    }
  }
}
