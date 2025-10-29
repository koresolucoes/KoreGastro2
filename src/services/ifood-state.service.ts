import { Injectable, signal } from '@angular/core';
import { IfoodWebhookLog, IfoodMenuSync, IfoodOptionGroup, IfoodOption, RecipeIfoodOptionGroup, Order } from '../models/db.models';

@Injectable({ providedIn: 'root' })
export class IfoodStateService {
  ifoodWebhookLogs = signal<IfoodWebhookLog[]>([]);
  ifoodMenuSync = signal<IfoodMenuSync[]>([]);
  ifoodOptionGroups = signal<IfoodOptionGroup[]>([]);
  ifoodOptions = signal<IfoodOption[]>([]);
  recipeIfoodOptionGroups = signal<RecipeIfoodOptionGroup[]>([]);
  recentlyFinishedIfoodOrders = signal<Order[]>([]);

  clearData() {
    this.ifoodWebhookLogs.set([]);
    this.ifoodMenuSync.set([]);
    this.ifoodOptionGroups.set([]);
    this.ifoodOptions.set([]);
    this.recipeIfoodOptionGroups.set([]);
    this.recentlyFinishedIfoodOrders.set([]);
  }
}
