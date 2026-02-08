
import { Injectable, signal, computed, WritableSignal, inject, effect, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { ProductionPlan } from '../models/db.models';
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
            console.log(`[SupabaseState] Active Unit changed: ${activeUnitId}. Loading Core Data...`);
            
            // 1. Clear previous operator session immediately to prevent access leak
            this.operationalAuthService.resetSession();

            // 2. Load ONLY Core Data initially (Lazy Loading Strategy)
            await this.loadCoreData(activeUnitId);
            this.subscribeToChanges(activeUnitId);

            // 3. Attempt Auto-Login for Manager
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
        }
    });

    effect(() => {
      this.pricingService.promotions.set(this.recipeState.promotions());
      this.pricingService.promotionRecipes.set(this.recipeState.promotionRecipes());
    });
  }

  // --- LAZY LOADING METHODS ---

  /**
   * Loads essential data required for the app to function (permissions, settings, auth).
   * This is called on login/refresh.
   */
  private async loadCoreData(userId: string) {
    this.isDataLoaded.set(false);
    try {
        const [
            companyProfile, roles, rolePermissions,
            employees, subscription, webhooks
        ] = await Promise.all([
            supabase.from('company_profile').select('*').eq('user_id', userId).maybeSingle(),
            supabase.from('roles').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
            supabase.from('role_permissions').select('*').eq('user_id', userId),
            supabase.from('employees').select('*').eq('user_id', userId), // Needed for login
            // Subscription is handled by SubscriptionStateService, but we trigger permissions load here via context
            supabase.from('webhooks').select('*').eq('user_id', userId),
        ]);

        this.settingsState.companyProfile.set(companyProfile.data || null);
        this.hrState.roles.set(roles.data || []);
        this.hrState.rolePermissions.set(rolePermissions.data || []);
        this.hrState.employees.set(employees.data || []);
        this.settingsState.webhooks.set(webhooks.data || []);
        
    } catch (error) {
        console.error("Core data load failed:", error);
    } finally {
        this.isDataLoaded.set(true);
    }
  }

  /**
   * Loads data required for POS, KDS, and Menu operations.
   * Call this when entering the POS/Sales routes.
   */
  public async loadPosData() {
    const userId = this.unitContextService.activeUnitId();
    if (!userId || this.demoService.isDemoMode()) return;

    console.log('[LazyLoad] Loading POS Data...');
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    const [
        halls, tables, stations, categories, recipes, 
        promotions, promotionRecipes, customers, orders
    ] = await Promise.all([
        supabase.from('halls').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
        supabase.from('tables').select('*').eq('user_id', userId),
        supabase.from('stations').select('*, employees(*)').eq('user_id', userId),
        supabase.from('categories').select('*').eq('user_id', userId),
        supabase.from('recipes').select('*').eq('user_id', userId),
        supabase.from('promotions').select('*').eq('user_id', userId),
        supabase.from('promotion_recipes').select('*, recipes(name)').eq('user_id', userId),
        supabase.from('customers').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
        // Fetch OPEN orders OR CANCELLED orders from the last 12 hours
        supabase.from('orders')
          .select('*, order_items(*), customers(*), delivery_drivers(*)')
          .eq('user_id', userId)
          .or(`status.eq.OPEN,and(status.eq.CANCELLED,completed_at.gte.${twelveHoursAgo})`),
    ]);

    this.posState.halls.set(halls.data || []);
    this.posState.tables.set(tables.data || []);
    this.posState.stations.set(stations.data || []);
    this.recipeState.categories.set(categories.data || []);
    this.recipeState.recipes.set(recipes.data || []);
    this.recipeState.promotions.set(promotions.data || []);
    this.recipeState.promotionRecipes.set(promotionRecipes.data || []);
    this.posState.customers.set(customers.data || []);
    this.setOrdersWithPrices(orders.data || []);

    // Load recipe composition needed for pricing/stock
    await this.loadRecipeComposition(userId);
  }

  /**
   * Loads data required for Inventory, Purchasing, and Production.
   */
  public async loadInventoryData() {
    const userId = this.unitContextService.activeUnitId();
    if (!userId || this.demoService.isDemoMode()) return;
    
    console.log('[LazyLoad] Loading Inventory Data...');
    const [
        ingredients, ingredientCategories, suppliers, inventoryLots, 
        purchaseOrders, productionPlans, stationStocks, requisitions
    ] = await Promise.all([
        supabase.from('ingredients').select('*, ingredient_categories(name), suppliers(name)').eq('user_id', userId),
        supabase.from('ingredient_categories').select('*').eq('user_id', userId),
        supabase.from('suppliers').select('*').eq('user_id', userId),
        supabase.from('inventory_lots').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
        supabase.from('purchase_orders').select('*, suppliers(name), purchase_order_items(*, ingredients(name, unit))').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
        supabase.from('production_plans').select('*, production_tasks(*, recipes(name, source_ingredient_id), stations(name), employees(name))').eq('user_id', userId).order('plan_date', { ascending: false }).limit(20),
        supabase.from('station_stocks').select('*, stations(name), ingredients(name, unit)').eq('user_id', userId),
        supabase.from('requisitions').select('*, requisition_items(*, ingredients(name)), stations(name), requester:employees!requested_by(name), processor:employees!processed_by(name)').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
    ]);

    this.inventoryState.ingredients.set(ingredients.data || []);
    this.inventoryState.ingredientCategories.set(ingredientCategories.data || []);
    this.inventoryState.suppliers.set(suppliers.data || []);
    this.inventoryState.inventoryLots.set(inventoryLots.data || []);
    this.inventoryState.purchaseOrders.set(purchaseOrders.data || []);
    this.inventoryState.productionPlans.set(productionPlans.data || []);
    this.inventoryState.stationStocks.set(stationStocks.data || []);
    this.inventoryState.requisitions.set(requisitions.data || []);
  }

  /**
   * Loads HR specific data (Schedules, Time Clock, Leave).
   */
  public async loadHrData() {
    const userId = this.unitContextService.activeUnitId();
    if (!userId || this.demoService.isDemoMode()) return;

    console.log('[LazyLoad] Loading HR Data...');
    const [schedules, leaveRequests] = await Promise.all([
        supabase.from('schedules').select('*, shifts(*, employees(name))').eq('user_id', userId).order('week_start_date', { ascending: false }).limit(10),
        supabase.from('leave_requests').select('*, employees(name, role)').eq('user_id', userId).order('start_date', { ascending: false }).limit(50),
    ]);

    this.hrState.schedules.set(schedules.data || []);
    this.hrState.leaveRequests.set(leaveRequests.data || []);
  }

  private async loadRecipeComposition(userId: string) {
      const [recipeIngredients, recipePreparations, recipeSubRecipes] = await Promise.all([
        supabase.from('recipe_ingredients').select('*, ingredients(name, unit, cost)').eq('user_id', userId),
        supabase.from('recipe_preparations').select('*').eq('user_id', userId),
        supabase.from('recipe_sub_recipes').select('*, recipes:recipes!child_recipe_id(name, id)').eq('user_id', userId),
      ]);
      
      this.recipeState.recipeIngredients.set(recipeIngredients.data || []);
      this.recipeState.recipePreparations.set(recipePreparations.data || []);
      this.recipeState.recipeSubRecipes.set(recipeSubRecipes.data || []);
  }

  private loadMockData() {
    this.isDataLoaded.set(false);
    try {
        // Load everything for Demo
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
        
        // Populate dashboard stats with mock transactions
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
        console.log("Mock data loaded for demo mode.");
    } catch (e) {
        console.error("Failed to load mock data:", e);
        this.clearAllData();
    } finally {
        this.isDataLoaded.set(true);
    }
  }

  public async refetchIfoodLogs() {
    const userId = this.unitContextService.activeUnitId();
    if (!userId) return;
    await this.refetchSimpleTable('ifood_webhook_logs', '*', this.ifoodState.ifoodWebhookLogs, true, 100);
  }

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
  
  private async refetchOrdersAndFinished() {
    const userId = this.unitContextService.activeUnitId();
    if (!userId) return;
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    const [openOrdersRes, finishedIfoodOrdersRes] = await Promise.all([
        supabase.from('orders')
            .select('*, order_items(*), customers(*), delivery_drivers(*)')
            .eq('user_id', userId)
            .or(`status.eq.OPEN,and(status.eq.CANCELLED,completed_at.gte.${twelveHoursAgo})`),
        
        supabase.from('orders')
            .select('*, order_items(*), customers(*), delivery_drivers(*)')
            .in('order_type', ['iFood-Delivery', 'iFood-Takeout'])
            .in('status', ['COMPLETED', 'CANCELLED'])
            .gte('completed_at', threeHoursAgo)
            .eq('user_id', userId)
    ]);

    if (!openOrdersRes.error) this.setOrdersWithPrices(openOrdersRes.data || []);
    if (!finishedIfoodOrdersRes.error) this.ifoodState.recentlyFinishedIfoodOrders.set(this.processOrdersWithPrices(finishedIfoodOrdersRes.data || []));
  }

  // Handle Realtime Updates
  // NOTE: This now blindly refreshes the specific table if modified. 
  // Optimization: In a huge app, we'd check if the signal is actually populated before refetching.
  private handleChanges(payload: any) {
     const userId = this.unitContextService.activeUnitId();
    if (!userId) return;

    const relevantRow = payload.new || payload.old;
    if (relevantRow && relevantRow.user_id && relevantRow.user_id !== userId) return;

    switch (payload.table) {
        case 'orders':
        case 'order_items':
            this.refetchOrdersAndFinished();
            break;
        case 'delivery_drivers':
            this.refetchSimpleTable('delivery_drivers', '*', this.deliveryState.deliveryDrivers);
            break;
        case 'tables': this.refetchSimpleTable('tables', '*', this.posState.tables); break;
        case 'halls': this.refetchSimpleTable('halls', '*', this.posState.halls); break;
        case 'stations': this.refetchSimpleTable('stations', '*, employees(*)', this.posState.stations); break;
        case 'categories': this.refetchSimpleTable('categories', '*', this.recipeState.categories); break;
        case 'recipes': this.refetchSimpleTable('recipes', '*', this.recipeState.recipes); break;
        case 'employees': this.refetchSimpleTable('employees', '*', this.hrState.employees); break;
        case 'ingredients': this.refetchSimpleTable('ingredients', '*, ingredient_categories(name), suppliers(name)', this.inventoryState.ingredients); break;
        case 'station_stocks': this.refetchSimpleTable('station_stocks', '*, stations(name), ingredients(name, unit)', this.inventoryState.stationStocks); break;
        case 'requisitions': this.refetchSimpleTable('requisitions', '*, requisition_items(*, ingredients(name)), stations(name), requester:employees!requested_by(name), processor:employees!processed_by(name)', this.inventoryState.requisitions, true); break;
        case 'transactions':
        case 'cashier_closings':
            this.refreshDashboardAndCashierData();
            break;
        // ... (Other tables mapped similarly if needed for realtime)
    }
  }

  public async refreshDashboardAndCashierData() {
    const userId = this.unitContextService.activeUnitId();
    if (!userId) return;
    // ... same implementation as before ...
    const { data: closings } = await supabase.from('cashier_closings').select('*').eq('user_id', userId).order('closed_at', { ascending: false });
    this.cashierState.cashierClosings.set(closings || []);
    
    // Refreshing recent transactions for dashboard
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
    return orders.map(o => ({ ...o, order_items: (o.order_items || []).map((item: any) => ({ ...item, price: item.price ?? this.pricingService.getEffectivePrice(this.recipeState.recipesById().get(item.recipe_id)!) ?? 0 })) }));
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
  
  async fetchPerformanceDataForPeriod(startDate: Date, endDate: Date): Promise<{ success: boolean; error: any }> {
    const userId = this.unitContextService.activeUnitId();
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    
    // Optimized fetch for dashboard only
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
