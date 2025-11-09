import { Injectable, signal } from '@angular/core';
import { Order, Transaction, ProductionPlan } from '../models/db.models';

@Injectable({ providedIn: 'root' })
export class DashboardStateService {
  dashboardTransactions = signal<Transaction[]>([]);
  dashboardCompletedOrders = signal<Order[]>([]);
  performanceTransactions = signal<Transaction[]>([]);
  performanceProductionPlans = signal<ProductionPlan[]>([]);
  performanceCompletedOrders = signal<Order[]>([]);

  clearData() {
    this.dashboardTransactions.set([]);
    this.dashboardCompletedOrders.set([]);
    this.performanceTransactions.set([]);
    this.performanceProductionPlans.set([]);
    this.performanceCompletedOrders.set([]);
  }
}