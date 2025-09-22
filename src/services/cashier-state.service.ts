import { Injectable, signal, computed } from '@angular/core';
import { Order, Transaction, CashierClosing } from '../models/db.models';

@Injectable({ providedIn: 'root' })
export class CashierStateService {
  completedOrders = signal<Order[]>([]);
  transactions = signal<Transaction[]>([]);
  cashierClosings = signal<CashierClosing[]>([]);
  
  lastCashierClosing = computed(() => {
    const closings = this.cashierClosings();
    if (closings.length === 0) return null;
    return closings.sort((a,b) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime())[0];
  });

  clearData() {
    this.completedOrders.set([]);
    this.transactions.set([]);
    this.cashierClosings.set([]);
  }
}
