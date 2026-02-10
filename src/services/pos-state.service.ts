
import { Injectable, signal, computed } from '@angular/core';
import { Hall, Table, Station, Order, Customer } from '../models/db.models';

@Injectable({ providedIn: 'root' })
export class PosStateService {
  halls = signal<Hall[]>([]);
  tables = signal<Table[]>([]);
  stations = signal<Station[]>([]);
  orders = signal<Order[]>([]);
  customers = signal<Customer[]>([]);

  // Computed for tables that have open orders
  openOrders = computed(() => this.orders().filter(o => o.status === 'OPEN'));
  
  // Computed specifically for Tabs/Commands
  openTabs = computed(() => this.orders().filter(o => o.status === 'OPEN' && o.order_type === 'Tab'));

  clearData() {
    this.halls.set([]);
    this.tables.set([]);
    this.stations.set([]);
    this.orders.set([]);
    this.customers.set([]);
  }
}
