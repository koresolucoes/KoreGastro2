import { Component, ChangeDetectionStrategy, inject, signal, computed, input, output, InputSignal, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Order } from '../../../models/db.models';
import { DeliveryStateService } from '../../../services/delivery-state.service';

@Component({
  selector: 'app-assign-driver-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './assign-driver-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssignDriverModalComponent {
  private deliveryState = inject(DeliveryStateService);

  order: InputSignal<Order> = input.required<Order>();
  
  closeModal: OutputEmitterRef<void> = output<void>();
  driverAssigned: OutputEmitterRef<{ driverId: string }> = output();

  availableDrivers = computed(() => 
    this.deliveryState.deliveryDrivers().filter(d => d.is_active)
  );
  
  costForDriver = computed(() => {
    const drivers = this.availableDrivers();
    const order = this.order();
    const distance = order.delivery_distance_km ?? 0;
    
    const costMap = new Map<string, number>();
    drivers.forEach(driver => {
        const cost = (driver.base_rate ?? 0) + ((driver.rate_per_km ?? 0) * distance);
        costMap.set(driver.id, cost);
    });
    return costMap;
  });

  assign(driverId: string) {
    this.driverAssigned.emit({ driverId });
  }
}