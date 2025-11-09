import { Injectable, signal } from '@angular/core';
import { DeliveryDriver } from '../models/db.models';

@Injectable({ providedIn: 'root' })
export class DeliveryStateService {
  deliveryDrivers = signal<DeliveryDriver[]>([]);

  clearData() {
    this.deliveryDrivers.set([]);
  }
}
