import { Injectable, signal } from '@angular/core';
import { Ingredient, InventoryLot, IngredientCategory, Supplier, PurchaseOrder, ProductionPlan } from '../models/db.models';

@Injectable({ providedIn: 'root' })
export class InventoryStateService {
  ingredients = signal<Ingredient[]>([]);
  inventoryLots = signal<InventoryLot[]>([]);
  ingredientCategories = signal<IngredientCategory[]>([]);
  suppliers = signal<Supplier[]>([]);
  purchaseOrders = signal<PurchaseOrder[]>([]);
  productionPlans = signal<ProductionPlan[]>([]);

  clearData() {
    this.ingredients.set([]);
    this.inventoryLots.set([]);
    this.ingredientCategories.set([]);
    this.suppliers.set([]);
    this.purchaseOrders.set([]);
    this.productionPlans.set([]);
  }
}
