
import { Injectable, signal } from '@angular/core';
import { Ingredient, InventoryLot, IngredientCategory, Supplier, PurchaseOrder, ProductionPlan, PortioningEvent, StationStock, Requisition, RequisitionTemplate } from '../models/db.models';

@Injectable({ providedIn: 'root' })
export class InventoryStateService {
  ingredients = signal<Ingredient[]>([]);
  inventoryLots = signal<InventoryLot[]>([]);
  ingredientCategories = signal<IngredientCategory[]>([]);
  suppliers = signal<Supplier[]>([]);
  purchaseOrders = signal<PurchaseOrder[]>([]);
  productionPlans = signal<ProductionPlan[]>([]);
  portioningEvents = signal<PortioningEvent[]>([]);

  // New State for Stock Restructuring
  stationStocks = signal<StationStock[]>([]);
  requisitions = signal<Requisition[]>([]);
  
  // New State for Requisition Templates
  requisitionTemplates = signal<RequisitionTemplate[]>([]);

  clearData() {
    this.ingredients.set([]);
    this.inventoryLots.set([]);
    this.ingredientCategories.set([]);
    this.suppliers.set([]);
    this.purchaseOrders.set([]);
    this.productionPlans.set([]);
    this.portioningEvents.set([]);
    
    this.stationStocks.set([]);
    this.requisitions.set([]);
    this.requisitionTemplates.set([]);
  }
}
