
import { Injectable, signal, computed, WritableSignal, inject, effect, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { ProductionPlan, Order, OrderItem } from '../models/db.models';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';
import { PricingService } from './pricing.service';
import { UnitContextService } from './unit-context.service';
import { OperationalAuthService } from './operational-auth.service';

// Import all new state services
import { PosStateService } from './pos-state.service';
import { InventoryStateService } from './inventory-state.service';
import { RecipeStateService } from './recipe-state.service';
import { HrStateService } from './hr-state.service';
import { CashierStateService } from './cashier-state.service';
import { SettingsStateService } from './settings-state.service';
import { IfoodStateService } from './ifood-state.service';
import { SubscriptionStateService } from './subscription-state.service';
import { DashboardStateService } from './dashboard-state.service';
import { DemoService } from './demo.service';
import * as mockData from '../data/mock-data';
import { ALL_PERMISSION_KEYS } from '../config/permissions';
import { DeliveryStateService } from './delivery-state.service';

@Injectable({
  providedIn: 'root',
})
export class SupabaseStateService {
  private authService = inject(AuthService);
  private pricingService = inject(PricingService);
  private unitContextService = inject(UnitContextService);
  private operationalAuthService = inject(OperationalAuthService);
  private router = inject(Router);
  
  // Inject all modular state services
  private posState = inject(PosStateService);
  private inventoryState = inject(InventoryStateService);
  private recipeState = inject(RecipeStateService);
  private hrState = inject(HrStateService);
  private cashierState = inject(CashierStateService);
  private settingsState = inject(SettingsStateService);
  private ifoodState = inject(IfoodStateService);
  private subscriptionState = inject(SubscriptionStateService);
  private dashboardState = inject(DashboardStateService);
  private demoService = inject(DemoService);
  private deliveryState = inject(DeliveryStateService);

  private currentUser = this.authService.currentUser;
  private realtimeChannel: any | null = null;

  // Flag to indicate Core data (permissions, profile) is ready
  isDataLoaded = signal(false);

  constructor() {
    // EFFECT 1: Handle User Authentication State & Demo Mode
    effect(async () => {
        const user = this.currentUser();
        const isDemo = this.demoService.isDemoMode();

        if (isDemo) {
            this.loadMockData();
            this.unsubscribeFromChanges();
        } else if (user) {
            await this.unitContextService.loadContext(user.id);
        } else {
            this.unsubscribeFromChanges();
            this.clearAllData();
            if (this.unitContextService.activeUnitId()) {
                this.unitContextService.activeUnitId.set(null);
            }
        }
    });

    // EFFECT 2: React to Active Unit Changes
    // Handles Data Loading AND Operator Auto-Switch
    effect(async () => {
        const activeUnitId = this.unitContextService.activeUnitId();
        const isDemo = this.demoService.isDemoMode();
        
        if (activeUnitId && !isDemo) {
            console.log(`[SupabaseState] Active Unit changed: ${activeUnitId}. Loading Essentials...`);
            
            // 1. Clear previous operator session immediately to prevent access leak
            this.operationalAuthService.resetSession();
            this.isDataLoaded.set(false);

            try {
                // 2. Load Core Data (Permissions, Settings, Roles) - Critical for Auth
                await this.loadCoreData(activeUnitId);
                
                // 3. Load Catalogs & Active State (Menu, Current Stock, Open Orders) - Critical for Operations
                await this.loadEssentialData(activeUnitId);

                // 4. Start Realtime
                this.subscribeToChanges(activeUnitId);

                // 5. Attempt Auto-Login for Manager
                untracked(() => {
                    const employees = this.hrState.employees();
                    const roles = this.hrState.roles();
                    
                    const loggedIn = this.operationalAuthService.attemptAutoLogin(employees, roles);
                    
                    if (loggedIn) {
                        this.router.navigate(['/dashboard']);
                    } else {
                        this.router.navigate(['/employee-selection']);
                    }
                });
            } catch (err) {
                console.error("Critical error loading unit data:", err);
            } finally {
                this.isDataLoaded.set(true);
            }
        }
    });

    effect(() => {
      this.pricingService.promotions.set(this.recipeState.promotions());
      this.pricingService.promotionRecipes.set(this.recipeState.promotionRecipes());
    });
  }

  // --- 1. CORE DATA (Required for basic app structure) ---
  private async loadCoreData(userId: string) {
    const [
        companyProfile, roles, rolePermissions,
        employees, webhooks
    ] = await Promise.all([
        supabase.from('company_profile').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('roles').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
        supabase.from('role_permissions').select('*').eq('user_id', userId),
        supabase.from('employees').select('*').eq('user_id', userId),
        supabase.from('webhooks').select('*').eq('user_id', userId),
    ]);

    this.settingsState.companyProfile.set(companyProfile.data || null);
    this.hrState.roles.set(roles.data || []);
    this.hrState.rolePermissions.set(rolePermissions.data || []);
    this.hrState.employees.set(employees.data || []);
    this.settingsState.webhooks.set(webhooks.data || []);
  }

  // --- 2. ESSENTIAL DATA (Required for POS/KDS/Inventory to function) ---
  private async loadEssentialData(userId: string) {
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    const [
        // Layout
        halls, tables, stations, 
        // Menu & Stock Definition (Lightweight)
        categories, recipes, promotions, promotionRecipes, 
        recipeIngredients, recipePreparations, recipeSubRecipes,
        ingredients, ingredientCategories, suppliers, stationStocks,
        // Active Operations
        customers, orders, deliveryDrivers
    ] = await Promise.all([
        supabase.from('halls').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
        supabase.from('tables').select('*').eq('user_id', userId),
        supabase.from('stations').select('*, employees(*)').eq('user_id', userId),
        
        supabase.from('categories').select('*').eq('user_id', userId),
        supabase.from('recipes').select('*').eq('user_id', userId),
        supabase.from('promotions').select('*').eq('user_id', userId),
        supabase.from('promotion_recipes').select('*, recipes(name)').eq('user_id', userId),
        
        supabase.from('recipe_ingredients').select('*, ingredients(name, unit, cost)').eq('user_id', userId),
        supabase.from('recipe_preparations').select('*').eq('user_id', userId),
        supabase.from('recipe_sub_recipes').select('*, recipes:recipes!child_recipe_id(name, id)').eq('user_id', userId),

        supabase.from('ingredients').select('*, ingredient_categories(name), suppliers(name)').eq('user_id', userId),
        supabase.from('ingredient_categories').select('*').eq('user_id', userId),
        supabase.from('suppliers').select('*').eq('user_id', userId),
        supabase.from('station_stocks').select('*, stations(name), ingredients(name, unit)').eq('user_id', userId),

        supabase.from('customers').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
        // Only load OPEN orders or recently closed ones to keep memory low
        supabase.from('orders')
          .select('*, order_items(*), customers(*), delivery_drivers(*)')
          .eq('user_id', userId)
          .or(`status.eq.OPEN,and(status.eq.CANCELLED,completed_at.gte.${twelveHoursAgo})`),
        supabase.from('delivery_drivers').select('*').eq('user_id', userId).eq('is_active', true)
    ]);

    // Populate State
    this.posState.halls.set(halls.data || []);
    this.posState.tables.set(tables.data || []);
    this.posState.stations.set(stations.data || []);
    
    this.recipeState.categories.set(categories.data || []);
    this.recipeState.recipes.set(recipes.data || []);
    this.recipeState.promotions.set(promotions.data || []);
    this.recipeState.promotionRecipes.set(promotionRecipes.data || []);
    this.recipeState.recipeIngredients.set(recipeIngredients.data || []);
    this.recipeState.recipePreparations.set(recipePreparations.data || []);
    this.recipeState.recipeSubRecipes.set(recipeSubRecipes.data || []);

    this.inventoryState.ingredients.set(ingredients.data || []);
    this.inventoryState.ingredientCategories.set(ingredientCategories.data || []);
    this.inventoryState.suppliers.set(suppliers.data || []);
    this.inventoryState.stationStocks.set(stationStocks.data || []);

    this.posState.customers.set(customers.data || []);
    this.setOrdersWithPrices(orders.data || []);
    this.deliveryState.deliveryDrivers.set(deliveryDrivers.data || []);
  }

  // --- 3. ON-DEMAND DATA (Heavy/Historical) ---
  // Called by Inventory, Reports, HR components on init
  public async loadBackOfficeData() {
     const userId = this.unitContextService.activeUnitId();
     if (!userId) return;
     console.log('[SupabaseState] Loading BackOffice Data (Lazy)...');

     const [purchaseOrders, inventoryLots, productionPlans, requisitions, schedules, leaveRequests] = await Promise.all([
        supabase.from('purchase_orders').select('*, suppliers(name), purchase_order_items(*, ingredients(name, unit))').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
        supabase.from('inventory_lots').select('*').eq('user_id', userId).gt('quantity', 0).order('created_at', { ascending: true }),
        supabase.from('production_plans').select('*, production_tasks(*, recipes(name, source_ingredient_id), stations(name), employees(name))').eq('user_id', userId).order('plan_date', { ascending: false }).limit(20),
        supabase.from('requisitions').select('*, requisition_items(*, ingredients(name)), stations(name), requester:employees!requested_by(name), processor:employees!processed_by(name)').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
        supabase.from('schedules').select('*, shifts(*, employees(name))').eq('user_id', userId).order('week_start_date', { ascending: false }).limit(10),
        supabase.from('leave_requests').select('*, employees(name, role)').eq('user_id', userId).order('start_date', { ascending: false }).limit(50),
     ]);

     this.inventoryState.purchaseOrders.set(purchaseOrders.data || []);
     this.inventoryState.inventoryLots.set(inventoryLots.data || []); // Lots needed for FIFO
     this.inventoryState.productionPlans.set(productionPlans.data || []);
     this.inventoryState.requisitions.set(requisitions.data || []);
     this.hrState.schedules.set(schedules.data || []);
     this.hrState.leaveRequests.set(leaveRequests.data || []);
  }

  public async refetchIfoodLogs() {
    const userId = this.unitContextService.activeUnitId();
    if (!userId) return;
    await this.refetchSimpleTable('ifood_webhook_logs', '*', this.ifoodState.ifoodWebhookLogs, true, 100);
  }

  // --- REALTIME SUBSCRIPTION ---

  private unsubscribeFromChanges() {
    if (this.realtimeChannel) {
        supabase.removeChannel(this.realtimeChannel);
        this.realtimeChannel = null;
    }
  }

  private subscribeToChanges(userId: string) {
    this.unsubscribeFromChanges();
    
    this.realtimeChannel = supabase.channel(`db-changes:${userId}`)
      .on(
        'postgres_changes', 
        { event: '*', schema: 'public' }, 
        (payload: any) => this.handleChanges(payload)
      )
      .subscribe(status => {
        console.log(`Supabase realtime subscription status: ${status}`);
      });
  }
  
  private handleChanges(payload: any) {
    const userId = this.unitContextService.activeUnitId();
    if (!userId) return;

    // Safety: ignore updates from other units
    const relevantRow = payload.new || payload.old;
    if (relevantRow && relevantRow.user_id && relevantRow.user_id !== userId) return;

    switch (payload.table) {
        case 'orders':
            this.handleOrderChange(payload);
            break;
        case 'order_items':
            this.handleOrderItemChange(payload);
            break;
        case 'tables': 
            this.handleSimpleUpdate(this.posState.tables, payload); 
            break;
        case 'delivery_drivers':
            this.handleSimpleUpdate(this.deliveryState.deliveryDrivers, payload);
            break;
        case 'halls': this.handleSimpleUpdate(this.posState.halls, payload); break;
        case 'stations': this.handleSimpleUpdate(this.posState.stations, payload, '*, employees(*)'); break;
        case 'categories': this.handleSimpleUpdate(this.recipeState.categories, payload); break;
        case 'recipes': this.handleSimpleUpdate(this.recipeState.recipes, payload); break;
        case 'employees': this.handleSimpleUpdate(this.hrState.employees, payload); break;
        case 'ingredients': this.handleSimpleUpdate(this.inventoryState.ingredients, payload, '*, ingredient_categories(name), suppliers(name)'); break;
        case 'station_stocks': this.handleSimpleUpdate(this.inventoryState.stationStocks, payload, '*, stations(name), ingredients(name, unit)'); break;
        case 'requisitions': this.handleSimpleUpdate(this.inventoryState.requisitions, payload, '*, requisition_items(*, ingredients(name)), stations(name), requester:employees!requested_by(name), processor:employees!processed_by(name)'); break;
        
        // Transactional logs - append only if matching date
        case 'transactions':
            this.handleTransactionChange(payload);
            break;
        case 'cashier_closings':
            this.refreshDashboardAndCashierData();
            break;
    }
  }

  // Generic Helper for simple flat lists
  private async handleSimpleUpdate<T extends { id: string }>(
      signal: WritableSignal<T[]>, 
      payload: any, 
      fetchQuery?: string
  ) {
      if (payload.eventType === 'DELETE') {
          signal.update(items => items.filter(i => i.id !== payload.old.id));
      } else if (payload.eventType === 'INSERT') {
          let newItem = payload.new;
          if (fetchQuery) {
             const { data } = await supabase.from(payload.table).select(fetchQuery).eq('id', newItem.id).single();
             if (data) newItem = data;
          }
          signal.update(items => [newItem as T, ...items]); // Prepend new items
      } else if (payload.eventType === 'UPDATE') {
           let updatedItem = payload.new;
           if (fetchQuery) {
              const { data } = await supabase.from(payload.table).select(fetchQuery).eq('id', updatedItem.id).single();
              if (data) updatedItem = data;
           }
           signal.update(items => items.map(i => i.id === updatedItem.id ? updatedItem as T : i));
      }
  }

  // Specific Handler for Orders (Deep Fetch Relations)
  private async handleOrderChange(payload: any) {
    if (payload.eventType === 'DELETE') {
        this.posState.orders.update(orders => orders.filter(o => o.id !== payload.old.id));
        return;
    }

    // Crucial: Fetch full order with relations (items, customer)
    const { data: fullOrder, error } = await supabase
        .from('orders')
        .select('*, order_items(*), customers(*), delivery_drivers(*)')
        .eq('id', payload.new.id)
        .single();
    
    if (error || !fullOrder) return;

    const processedOrder = (this.processOrdersWithPrices([fullOrder]))[0];
    const isRelevantForPos = 
        processedOrder.status === 'OPEN' || 
        (processedOrder.status === 'CANCELLED' && new Date().getTime() - new Date(processedOrder.completed_at || '').getTime() < 12 * 60 * 60 * 1000);

    this.posState.orders.update(orders => {
        const exists = orders.find(o => o.id === processedOrder.id);
        if (isRelevantForPos) {
            return exists ? orders.map(o => o.id === processedOrder.id ? processedOrder : o) : [...orders, processedOrder];
        } else {
            return orders.filter(o => o.id !== processedOrder.id);
        }
    });
    
    // Maintain recently finished list for iFood KDS
    if (processedOrder.order_type.startsWith('iFood') && (processedOrder.status === 'COMPLETED' || processedOrder.status === 'CANCELLED')) {
        this.ifoodState.recentlyFinishedIfoodOrders.update(orders => {
             const exists = orders.find(o => o.id === processedOrder.id);
             const list = exists ? orders.map(o => o.id === processedOrder.id ? processedOrder : o) : [processedOrder, ...orders];
             return list.slice(0, 50);
        });
    }
  }

  // Specific Handler for Order Items
  private async handleOrderItemChange(payload: any) {
     // If an item is deleted, remove from local order
     if (payload.eventType === 'DELETE') {
         this.posState.orders.update(orders => orders.map(order => {
             if (order.id === payload.old.order_id) {
                 return { ...order, order_items: order.order_items.filter(i => i.id !== payload.old.id) };
             }
             return order;
         }));
         return;
     }

     // Use the payload.new directly for speed, but ideally we'd fetch full item if it had complex relations
     const newItem = payload.new;
     
     // Update POS State
     this.posState.orders.update(orders => orders.map(order => {
         if (order.id === newItem.order_id) {
             const existingItemIndex = order.order_items.findIndex(i => i.id === newItem.id);
             let newItems = [...order.order_items];
             
             if (existingItemIndex >= 0) {
                 // Preserve fields that might not be in payload if we didn't fetch relations, 
                 // but typically raw payload has all DB fields. 
                 // Important: Pricing might need re-calculation if not stored on item.
                 const mergedItem = { ...newItems[existingItemIndex], ...newItem };
                 newItems[existingItemIndex] = mergedItem;
             } else {
                 // For new items, we might miss the recipe relation if we don't fetch. 
                 // But typically the Order panel adds it optimistically or refreshes via 'order.updated' event
                 newItems.push(newItem);
             }
             return { ...order, order_items: newItems };
         }
         return order;
     }));
  }

  private async handleTransactionChange(payload: any) {
      if (payload.eventType === 'INSERT') {
          const today = new Date().toISOString().split('T')[0];
          if (payload.new.date.startsWith(today)) {
              this.cashierState.transactions.update(txs => [...txs, payload.new]);
              this.dashboardState.dashboardTransactions.update(txs => [...txs, payload.new]);
          }
      }
  }

  public async refreshDashboardAndCashierData() {
    const userId = this.unitContextService.activeUnitId();
    if (!userId) return;
    
    const { data: closings } = await supabase.from('cashier_closings').select('*').eq('user_id', userId).order('closed_at', { ascending: false }).limit(5);
    this.cashierState.cashierClosings.set(closings || []);
    
    const today = new Date();
    const isoEndDate = today.toISOString();
    today.setHours(0, 0, 0, 0); 
    const isoStartDate = today.toISOString();
    
    const { data: transactions } = await supabase.from('transactions').select('*').gte('date', isoStartDate).lte('date', isoEndDate).eq('user_id', userId);
    this.dashboardState.dashboardTransactions.set(transactions || []);
  }

  private async refetchSimpleTable<T>(tableName: string, selectQuery: string, signal: WritableSignal<T[]>, orderByDesc = false, limit?: number) {
    const userId = this.unitContextService.activeUnitId();
    if (!userId) return;
    let query = supabase.from(tableName).select(selectQuery).eq('user_id', userId);
    
    // Heuristic for created_at or other date field
    const orderColumn = ['purchase_orders', 'production_plans', 'schedules', 'leave_requests', 'ifood_webhook_logs', 'portioning_events', 'requisitions'].includes(tableName) 
        ? (tableName === 'production_plans' ? 'plan_date' : tableName === 'schedules' ? 'week_start_date' : tableName === 'leave_requests' ? 'start_date' : 'created_at')
        : 'created_at';
        
    query = query.order(orderColumn, { ascending: !orderByDesc });
    if (limit) query = query.limit(limit);
    
    const { data, error } = await query;
    if (!error) signal.set(data as T[] || []);
  }

  private setOrdersWithPrices(orders: any[]) { this.posState.orders.set(this.processOrdersWithPrices(orders)); }
  
  private processOrdersWithPrices(orders: any[]): any[] {
    return orders
        .filter(o => !!o)
        .map(o => ({ 
            ...o, 
            order_items: (o.order_items || []).map((item: any) => {
                // If DB price is null (rare), fetch from recipe state
                const effectivePrice = item.price ?? this.pricingService.getEffectivePrice(this.recipeState.recipesById().get(item.recipe_id)!) ?? 0;
                return { ...item, price: effectivePrice };
            }) 
        }));
  }

  private processCompletedOrdersWithPrices(orders: any[]): any[] {
    return orders.map(o => ({ ...o, order_items: (o.order_items || []).map((item: any) => ({ ...item, price: item.price ?? this.recipeState.recipesById().get(item.recipe_id)?.price ?? 0 })) }));
  }

  private clearAllData() {
    this.posState.clearData();
    this.inventoryState.clearData();
    this.recipeState.clearData();
    this.hrState.clearData();
    this.cashierState.clearData();
    this.settingsState.clearData();
    this.ifoodState.clearData();
    this.subscriptionState.clearData();
    this.dashboardState.clearData();
    this.deliveryState.clearData();
    this.isDataLoaded.set(false);
  }
  
  // --- MOCK DATA ---
  private loadMockData() {
    this.isDataLoaded.set(false);
    try {
        this.posState.halls.set(mockData.MOCK_HALLS);
        this.posState.tables.set(mockData.MOCK_TABLES);
        this.posState.stations.set(mockData.MOCK_STATIONS);
        this.posState.orders.set(mockData.MOCK_ORDERS);
        this.posState.customers.set(mockData.MOCK_CUSTOMERS);
        this.inventoryState.ingredients.set(mockData.MOCK_INGREDIENTS);
        this.inventoryState.ingredientCategories.set(mockData.MOCK_INGREDIENT_CATEGORIES);
        this.inventoryState.suppliers.set(mockData.MOCK_SUPPLIERS);
        this.recipeState.categories.set(mockData.MOCK_RECIPE_CATEGORIES);
        this.recipeState.recipes.set(mockData.MOCK_RECIPES);
        this.hrState.employees.set(mockData.MOCK_EMPLOYEES);
        this.hrState.roles.set(mockData.MOCK_ROLES);
        this.hrState.rolePermissions.set(mockData.MOCK_ROLE_PERMISSIONS);
        
        const today = new Date().toISOString().split('T')[0];
        const transactionsToday = mockData.MOCK_TRANSACTIONS.filter(t => t.date.startsWith(today));
        this.dashboardState.performanceTransactions.set(mockData.MOCK_TRANSACTIONS);
        this.dashboardState.dashboardTransactions.set(transactionsToday);
        this.cashierState.transactions.set(mockData.MOCK_TRANSACTIONS);

        this.settingsState.companyProfile.set({ 
            company_name: 'Restaurante Demonstração', 
            cnpj: '00.000.000/0001-00', 
            user_id: 'demo-user', 
            created_at: new Date().toISOString(),
            address: null, phone: null, logo_url: null, ifood_merchant_id: null,
            menu_cover_url: null, menu_header_url: null, external_api_key: null,
            latitude: null, longitude: null, time_clock_radius: null
        });
        
        this.subscriptionState.activeUserPermissions.set(new Set(ALL_PERMISSION_KEYS));
    } catch (e) {
        console.error("Failed to load mock data:", e);
        this.clearAllData();
    } finally {
        this.isDataLoaded.set(true);
    }
  }

  async fetchPerformanceDataForPeriod(startDate: Date, endDate: Date): Promise<{ success: boolean; error: any }> {
    const userId = this.unitContextService.activeUnitId();
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    
    const [transactionsRes, completedOrdersRes] = await Promise.all([
      supabase.from('transactions').select('*').eq('user_id', userId).in('type', ['Gorjeta', 'Receita']).gte('date', startDate.toISOString()).lte('date', endDate.toISOString()),
      supabase.from('orders').select('*, order_items(*), customers(*), delivery_drivers(*)').eq('user_id', userId).eq('status', 'COMPLETED').gte('completed_at', startDate.toISOString()).lte('completed_at', endDate.toISOString())
    ]);
      
    if (transactionsRes.error || completedOrdersRes.error) { 
      return { success: false, error: transactionsRes.error || completedOrdersRes.error };
    }
    
    this.dashboardState.performanceTransactions.set(transactionsRes.data || []);
    this.dashboardState.performanceCompletedOrders.set(this.processCompletedOrdersWithPrices(completedOrdersRes.data || []));
    return { success: true, error: null };
  }
}
