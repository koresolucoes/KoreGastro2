import { Component, ChangeDetectionStrategy, inject, signal, computed, input, output, InputSignal, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Order } from '../../../models/db.models';
import { DeliveryStateService } from '../../../services/delivery-state.service';

@Component({
  selector: 'app-assign-driver-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './assign-driver-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssignDriverModalComponent {
  private deliveryState = inject(DeliveryStateService);

  order: InputSignal<Order> = input.required<Order>();
  
  closeModal: OutputEmitterRef<void> = output<void>();
  driverAssigned: OutputEmitterRef<{ orderId: string; driverId: string; }> = output();

  availableDrivers = computed(() => 
    this.deliveryState.deliveryDrivers().filter(d => d.is_active)
  );

  assign(driverId: string) {
    this.driverAssigned.emit({ orderId: this.order().id, driverId });
  }
}
