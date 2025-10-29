import { Injectable, signal, computed, WritableSignal, inject, effect } from '@angular/core';
import { ProductionPlan } from '../models/db.models';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';
import { PricingService } from './pricing.service';

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

@Injectable({
  providedIn: 'root',
})
export class SupabaseStateService {
  private authService = inject(AuthService);
  private pricingService = inject(PricingService);
  
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

  private currentUser = this.authService.currentUser;
  private realtimeChannel: any | null = null;

  isDataLoaded = signal(false);

  constructor() {
    effect(() => {
        const user = this.currentUser();
        const isDemo = this.demoService.isDemoMode();

        if (isDemo) {
            this.loadMockData();
            this.unsubscribeFromChanges(); // Ensure no realtime listeners in demo
        } else if (user) {
            this.loadInitialData(user.id);
            this.subscribeToChanges(user.id);
        } else {
            this.unsubscribeFromChanges();
            this.clearAllData();
        }
    });

    effect(() => {
      // Keep pricing service updated with the latest promotions from the recipe state
      this.pricingService.promotions.set(this.recipeState.promotions());
      this.pricingService.promotionRecipes.set(this.recipeState.promotionRecipes());
    });
  }

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
        this.inventoryState.inventoryLots.set([]);
        this.inventoryState.purchaseOrders.set([]);
        this.inventoryState.productionPlans.set([]);

        this.recipeState.categories.set(mockData.MOCK_RECIPE_CATEGORIES);
        this.recipeState.recipes.set(mockData.MOCK_RECIPES);
        this.recipeState.recipeIngredients.set([]);
        this.recipeState.recipePreparations.set([]);
        this.recipeState.recipeSubRecipes.set([]);
        this.recipeState.promotions.set([]);
        this.recipeState.promotionRecipes.set([]);

        this.hrState.employees.set(mockData.MOCK_EMPLOYEES);
        this.hrState.roles.set(mockData.MOCK_ROLES);
        this.hrState.rolePermissions.set(mockData.MOCK_ROLE_PERMISSIONS);
        this.hrState.schedules.set([]);
        this.hrState.leaveRequests.set([]);
        
        const today = new Date().toISOString().split('T')[0];
        const transactionsToday = mockData.MOCK_TRANSACTIONS.filter(t => t.date.startsWith(today));
        this.dashboardState.dashboardTransactions.set(transactionsToday);
        this.dashboardState.dashboardCompletedOrders.set([]);
        this.dashboardState.performanceTransactions.set([]);
        this.dashboardState.performanceProductionPlans.set([]);
        this.dashboardState.performanceCompletedOrders.set([]);

        this.cashierState.transactions.set(mockData.MOCK_TRANSACTIONS);
        this.cashierState.completedOrders.set([]);
        this.cashierState.cashierClosings.set([]);

        // Mock settings
        // FIX: Added missing properties to the mock CompanyProfile object to match the interface.
        this.settingsState.companyProfile.set({ 
            company_name: 'Restaurante Demonstração', 
            cnpj: '00.000.000/0001-00', 
            user_id: 'demo-user', 
            created_at: new Date().toISOString(),
            address: null,
            phone: null,
            logo_url: null,
            ifood_merchant_id: null,
            menu_cover_url: null,
            menu_header_url: null,
            external_api_key: null,
        });
        this.settingsState.reservations.set([]);
        this.settingsState.reservationSettings.set(null);
        this.settingsState.loyaltySettings.set(null);
        this.settingsState.loyaltyRewards.set([]);

        // Mock subscription as fully active
        this.subscriptionState.activeUserPermissions.set(new Set(ALL_PERMISSION_KEYS));
        this.subscriptionState.subscriptions.set([]);
        this.subscriptionState.plans.set([]);

        // No iFood data in demo
        this.ifoodState.ifoodWebhookLogs.set([]);
        this.ifoodState.ifoodMenuSync.set([]);
        this.ifoodState.ifoodOptionGroups.set([]);
        this.ifoodState.ifoodOptions.set([]);
        this.ifoodState.recipeIfoodOptionGroups.set([]);

        console.log("Mock data loaded for demo mode.");
    } catch (e) {
        console.error("Failed to load mock data:", e);
        this.clearAllData();
    } finally {
        this.isDataLoaded.set(true);
    }
  }

  public async refetchIfoodLogs() {
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
        if (status === 'CHANNEL_ERROR') console.error('Realtime channel error. Check RLS policies.');
        if (status === 'TIMED_OUT') console.warn('Realtime subscription timed out.');
      });
  }
  
  private async refetchOrdersAndFinished() {
    const userId = this.currentUser()?.id;
    if (!userId) return;
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

    const [openOrdersRes, finishedIfoodOrdersRes] = await Promise.all([
        supabase.from('orders').select('*, order_items(*), customers(*)').eq('status', 'OPEN').eq('user_id', userId),
        supabase.from('orders').select('*, order_items(*), customers(*)').in('order_type', ['iFood-Delivery', 'iFood-Takeout']).in('status', ['COMPLETED', 'CANCELLED']).gte('completed_at', threeHoursAgo).eq('user_id', userId)
    ]);

    if (!openOrdersRes.error) {
        this.setOrdersWithPrices(openOrdersRes.data || []);
    } else {
        console.error('Error refetching open orders:', openOrdersRes.error);
    }

    if (!finishedIfoodOrdersRes.error) {
        this.ifoodState.recentlyFinishedIfoodOrders.set(this.processOrdersWithPrices(finishedIfoodOrdersRes.data || []));
    } else {
        console.error('Error refetching finished iFood orders:', finishedIfoodOrdersRes.error);
    }
  }


  private handleChanges(payload: any) {
    console.log('Realtime change received:', payload);
    const userId = this.currentUser()?.id;
    if (!userId) return;

    switch (payload.table) {
        case 'orders':
        case 'order_items':
            this.refetchOrdersAndFinished();
            break;
        case 'subscriptions':
        case 'plans':
            this.refetchSubscriptionPermissions(userId);
            this.refetchSimpleTable('subscriptions', '*', this.subscriptionState.subscriptions);
            this.refetchSimpleTable('plans', '*', this.subscriptionState.plans, false);
            break;
        case 'ifood_webhook_logs':
            this.refetchIfoodLogs();
            break;
        case 'ifood_menu_sync':
            this.refetchSimpleTable('ifood_menu_sync', '*', this.ifoodState.ifoodMenuSync);
            break;
        case 'tables': this.refetchSimpleTable('tables', '*', this.posState.tables); break;
        case 'halls': this.refetchSimpleTable('halls', '*', this.posState.halls); break;
        case 'stations': this.refetchSimpleTable('stations', '*, employees(*)', this.posState.stations); break;
        case 'categories': this.refetchSimpleTable('categories', '*', this.recipeState.categories); break;
        case 'recipes': this.refetchSimpleTable('recipes', '*', this.recipeState.recipes); break;
        case 'employees': this.refetchSimpleTable('employees', '*', this.hrState.employees); break;
        case 'ingredient_categories': this.refetchSimpleTable('ingredient_categories', '*', this.inventoryState.ingredientCategories); break;
        case 'suppliers': this.refetchSimpleTable('suppliers', '*', this.inventoryState.suppliers); break;
        case 'ingredients':
        case 'inventory_lots':
        case 'inventory_movements':
             this.refetchSimpleTable('ingredients', '*, ingredient_categories(name), suppliers(name)', this.inventoryState.ingredients);
             this.refetchSimpleTable('inventory_lots', '*', this.inventoryState.inventoryLots);
            break;
        case 'recipe_ingredients': this.refetchSimpleTable('recipe_ingredients', '*, ingredients(name, unit, cost)', this.recipeState.recipeIngredients); break;
        case 'recipe_sub_recipes': this.refetchSimpleTable('recipe_sub_recipes', '*, recipes:recipes!child_recipe_id(name, id)', this.recipeState.recipeSubRecipes); break;
        case 'recipe_preparations': this.refetchSimpleTable('recipe_preparations', '*', this.recipeState.recipePreparations); break;
        case 'promotions': this.refetchSimpleTable('promotions', '*', this.recipeState.promotions); break;
        case 'promotion_recipes': this.refetchSimpleTable('promotion_recipes', '*, recipes(name)', this.recipeState.promotionRecipes); break;
        case 'purchase_orders':
        case 'purchase_order_items':
             this.refetchSimpleTable('purchase_orders', '*, suppliers(name), purchase_order_items(*, ingredients(name, unit))', this.inventoryState.purchaseOrders, true);
            break;
        case 'production_plans':
        case 'production_tasks':
            this.refetchSimpleTable('production_plans', '*, production_tasks(*, recipes(name, source_ingredient_id), stations(name), employees(name))', this.inventoryState.productionPlans, true);
            break;
        case 'schedules':
        case 'shifts':
            this.refetchSimpleTable('schedules', '*, shifts(*, employees(name))', this.hrState.schedules, true);
            break;
        case 'leave_requests':
            this.refetchSimpleTable('leave_requests', '*, employees(name, role)', this.hrState.leaveRequests, true);
            break;
        case 'reservations': this.refetchSimpleTable('reservations', '*', this.settingsState.reservations); break;
        case 'reservation_settings': this.refetchSingleRow('reservation_settings', '*', this.settingsState.reservationSettings); break;
        case 'loyalty_settings': this.refetchSingleRow('loyalty_settings', '*', this.settingsState.loyaltySettings); break;
        case 'loyalty_rewards': this.refetchSimpleTable('loyalty_rewards', '*', this.settingsState.loyaltyRewards); break;
        case 'company_profile': this.refetchSingleRow('company_profile', '*', this.settingsState.companyProfile); break;
        case 'customers':
        case 'loyalty_movements':
            this.refetchSimpleTable('customers', '*', this.posState.customers);
            break;
        case 'roles': this.refetchSimpleTable('roles', '*', this.hrState.roles); break;
        case 'role_permissions': this.refetchSimpleTable('role_permissions', '*', this.hrState.rolePermissions); break;
        case 'time_clock_entries': this.refetchSimpleTable('employees', '*', this.hrState.employees); break;
        case 'transactions':
        case 'cashier_closings':
            this.refreshDashboardAndCashierData();
            break;
    }
  }

  private async loadInitialData(userId: string) {
    this.isDataLoaded.set(false);
    try { 
      await this.refetchSubscriptionPermissions(userId);
      await this.refreshData(userId); 
    } 
    catch (error) { this.clearAllData(); } 
    finally { this.isDataLoaded.set(true); }
  }

  private async refreshData(userId: string) {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const [
      halls, tables, stations, categories, orders, employees, ingredients,
      ingredientCategories, suppliers, recipeIngredients, recipePreparations, promotions,
      promotionRecipes, recipeSubRecipes, purchaseOrders, productionPlans, reservations,
      reservationSettings, schedules, leaveRequests, companyProfile, roles, rolePermissions,
      customers, loyaltySettings, loyaltyRewards, inventoryLots, ifoodWebhookLogs,
      ifoodMenuSync, subscriptions, plans, recipes, finishedIfoodOrders
    ] = await Promise.all([
      supabase.from('halls').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      supabase.from('tables').select('*').eq('user_id', userId),
      supabase.from('stations').select('*, employees(*)').eq('user_id', userId),
      supabase.from('categories').select('*').eq('user_id', userId),
      supabase.from('orders').select('*, order_items(*), customers(*)').eq('status', 'OPEN').eq('user_id', userId),
      supabase.from('employees').select('*').eq('user_id', userId),
      supabase.from('ingredients').select('*, ingredient_categories(name), suppliers(name)').eq('user_id', userId),
      supabase.from('ingredient_categories').select('*').eq('user_id', userId),
      supabase.from('suppliers').select('*').eq('user_id', userId),
      supabase.from('recipe_ingredients').select('*, ingredients(name, unit, cost)').eq('user_id', userId),
      supabase.from('recipe_preparations').select('*').eq('user_id', userId),
      supabase.from('promotions').select('*').eq('user_id', userId),
      supabase.from('promotion_recipes').select('*, recipes(name)').eq('user_id', userId),
      supabase.from('recipe_sub_recipes').select('*, recipes:recipes!child_recipe_id(name, id)').eq('user_id', userId),
      supabase.from('purchase_orders').select('*, suppliers(name), purchase_order_items(*, ingredients(name, unit))').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('production_plans').select('*, production_tasks(*, recipes(name, source_ingredient_id), stations(name), employees(name))').eq('user_id', userId).order('plan_date', { ascending: false }),
      supabase.from('reservations').select('*').eq('user_id', userId).order('reservation_time', { ascending: true }),
      supabase.from('reservation_settings').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('schedules').select('*, shifts(*, employees(name))').eq('user_id', userId).order('week_start_date', { ascending: false }),
      supabase.from('leave_requests').select('*, employees(name, role)').eq('user_id', userId).order('start_date', { ascending: false }),
      supabase.from('company_profile').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('roles').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      supabase.from('role_permissions').select('*').eq('user_id', userId),
      supabase.from('customers').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      supabase.from('loyalty_settings').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('loyalty_rewards').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      supabase.from('inventory_lots').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      supabase.from('ifood_webhook_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
      supabase.from('ifood_menu_sync').select('*').eq('user_id', userId),
      supabase.from('subscriptions').select('*').eq('user_id', userId),
      supabase.from('plans').select('*'),
      supabase.from('recipes').select('*').eq('user_id', userId),
      supabase.from('orders').select('*, order_items(*), customers(*)').in('order_type', ['iFood-Delivery', 'iFood-Takeout']).in('status', ['COMPLETED', 'CANCELLED']).gte('completed_at', threeHoursAgo).eq('user_id', userId),
    ]);

    // Populate all state services
    // FIX: Removed all `as any` casts to allow for proper type inference and fix downstream 'unknown' type errors.
    this.posState.halls.set(halls.data || []);
    this.posState.tables.set(tables.data || []);
    this.posState.stations.set(stations.data || []);
    this.recipeState.categories.set(categories.data || []);
    this.setOrdersWithPrices(orders.data || []);
    this.hrState.employees.set(employees.data || []);
    this.inventoryState.ingredients.set(ingredients.data || []);
    this.inventoryState.ingredientCategories.set(ingredientCategories.data || []);
    this.inventoryState.suppliers.set(suppliers.data || []);
    this.recipeState.recipeIngredients.set(recipeIngredients.data || []);
    this.recipeState.recipePreparations.set(recipePreparations.data || []);
    this.recipeState.promotions.set(promotions.data || []);
    this.recipeState.promotionRecipes.set(promotionRecipes.data || []);
    this.recipeState.recipeSubRecipes.set(recipeSubRecipes.data || []);
    this.inventoryState.purchaseOrders.set(purchaseOrders.data || []);
    this.inventoryState.productionPlans.set(productionPlans.data || []);
    this.settingsState.reservations.set(reservations.data || []);
    this.settingsState.reservationSettings.set(reservationSettings.data || null);
    this.hrState.schedules.set(schedules.data || []);
    this.hrState.leaveRequests.set(leaveRequests.data || []);
    this.settingsState.companyProfile.set(companyProfile.data || null);
    this.hrState.roles.set(roles.data || []);
    this.hrState.rolePermissions.set(rolePermissions.data || []);
    this.posState.customers.set(customers.data || []);
    this.settingsState.loyaltySettings.set(loyaltySettings.data || null);
    this.settingsState.loyaltyRewards.set(loyaltyRewards.data || []);
    this.inventoryState.inventoryLots.set(inventoryLots.data || []);
    this.ifoodState.ifoodWebhookLogs.set(ifoodWebhookLogs.data || []);
    this.ifoodState.ifoodMenuSync.set(ifoodMenuSync.data || []);
    this.subscriptionState.subscriptions.set(subscriptions.data || []);
    this.subscriptionState.plans.set(plans.data || []);
    this.recipeState.recipes.set(recipes.data || []);
    this.ifoodState.recentlyFinishedIfoodOrders.set(this.processOrdersWithPrices(finishedIfoodOrders.data || []));


    await this.refreshDashboardAndCashierData();
  }

  public async refreshDashboardAndCashierData() {
    const userId = this.currentUser()?.id; if (!userId) return;
    const { data: closings } = await supabase.from('cashier_closings').select('*').eq('user_id', userId).order('closed_at', { ascending: false });
    this.cashierState.cashierClosings.set(closings || []);
    const today = new Date(); const isoEndDate = today.toISOString(); today.setHours(0, 0, 0, 0); const isoStartDate = today.toISOString();
    const cashierStartDate = this.cashierState.lastCashierClosing() ? new Date(this.cashierState.lastCashierClosing()!.closed_at) : new Date(isoStartDate);
    const results = await Promise.all([
        supabase.from('orders').select('*, order_items(*), customers(*)').eq('status', 'COMPLETED').gte('completed_at', cashierStartDate.toISOString()).lte('completed_at', isoEndDate).eq('user_id', userId),
        supabase.from('transactions').select('*').gte('date', cashierStartDate.toISOString()).lte('date', isoEndDate).eq('user_id', userId),
        supabase.from('transactions').select('*').gte('date', isoStartDate).lte('date', isoEndDate).eq('user_id', userId),
        supabase.from('orders').select('*, order_items(*), customers(*)').eq('status', 'COMPLETED').gte('completed_at', isoStartDate).lte('completed_at', isoEndDate).eq('user_id', userId)
    ]);
    this.setCompletedOrdersWithPrices(results[0].data || []);
    this.cashierState.transactions.set(results[1].data || []);
    this.dashboardState.dashboardTransactions.set(results[2].data || []);
    this.setDashboardCompletedOrdersWithPrices(results[3].data || []);
  }

  private async refetchSimpleTable<T>(tableName: string, selectQuery: string, signal: WritableSignal<T[]>, orderByDesc = false, limit?: number) {
    const userId = this.currentUser()?.id; if (!userId) return;
    let query = supabase.from(tableName).select(selectQuery);
    if (tableName !== 'plans') {
      query = query.eq('user_id', userId);
    }
    const orderColumn = ['purchase_orders', 'production_plans', 'schedules', 'leave_requests', 'ifood_webhook_logs'].includes(tableName) 
        ? (tableName === 'production_plans' ? 'plan_date' : tableName === 'schedules' ? 'week_start_date' : tableName === 'leave_requests' ? 'start_date' : 'created_at')
        : 'created_at';
        
    query = query.order(orderColumn, { ascending: !orderByDesc });

    if (limit) {
      query = query.limit(limit);
    }
    
    const { data, error } = await query;
    if (!error) signal.set(data as T[] || []);
    else console.error(`Error refetching ${tableName}:`, error);
  }

  private async refetchSingleRow<T>(tableName: string, selectQuery: string, signal: WritableSignal<T | null>) {
    const userId = this.currentUser()?.id; if (!userId) return;
    const { data, error } = await supabase.from(tableName).select(selectQuery).eq('user_id', userId).maybeSingle();
    if (!error) signal.set(data as T || null);
    else console.error(`Error refetching single row from ${tableName}:`, error);
  }

  private async refetchOrders() {
    const userId = this.currentUser()?.id; if (!userId) return;
    const { data, error } = await supabase.from('orders').select('*, order_items(*), customers(*)').eq('status', 'OPEN').eq('user_id', userId);
    if (!error) this.setOrdersWithPrices(data || []);
    else console.error('Error refetching orders:', error);
  }
  
  private async refetchSubscriptionPermissions(userId: string) {
    const { data: permissions, error } = await supabase.rpc('get_user_active_permissions', { p_user_id: userId });
    if (!error && permissions) {
        this.subscriptionState.activeUserPermissions.set(new Set((permissions as { permission_key: string }[]).map(p => p.permission_key)));
    } else if (error) {
        console.error('Error refetching subscription permissions:', error);
        this.subscriptionState.activeUserPermissions.set(new Set());
    }
  }
  
  private setOrdersWithPrices(orders: any[]) { this.posState.orders.set(this.processOrdersWithPrices(orders)); }
  private setCompletedOrdersWithPrices(orders: any[]) { this.cashierState.completedOrders.set(this.processCompletedOrdersWithPrices(orders)); }
  private setDashboardCompletedOrdersWithPrices(orders: any[]) { this.dashboardState.dashboardCompletedOrders.set(this.processCompletedOrdersWithPrices(orders)); }
  private setPerformanceCompletedOrdersWithPrices(orders: any[]) { this.dashboardState.performanceCompletedOrders.set(this.processCompletedOrdersWithPrices(orders)); }

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
    this.isDataLoaded.set(false);
  }
  
  async fetchPerformanceDataForPeriod(startDate: Date, endDate: Date): Promise<{ success: boolean; error: any }> {
    const userId = this.currentUser()?.id; if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    
    const [transactionsRes, productionPlansRes, completedOrdersRes] = await Promise.all([
      supabase.from('transactions').select('*').eq('user_id', userId).in('type', ['Gorjeta', 'Receita']).gte('date', startDate.toISOString()).lte('date', endDate.toISOString()),
      supabase.from('production_plans').select('*, production_tasks(*, employees(name))').eq('user_id', userId).gte('plan_date', startDate.toISOString().split('T')[0]).lte('plan_date', endDate.toISOString().split('T')[0]),
      supabase.from('orders').select('*, order_items(*), customers(*)').eq('user_id', userId).eq('status', 'COMPLETED').gte('completed_at', startDate.toISOString()).lte('completed_at', endDate.toISOString())
    ]);
      
    if (transactionsRes.error || productionPlansRes.error || completedOrdersRes.error) { 
      this.dashboardState.performanceTransactions.set([]);
      this.dashboardState.performanceProductionPlans.set([]);
      this.dashboardState.performanceCompletedOrders.set([]);
      return { success: false, error: transactionsRes.error || productionPlansRes.error || completedOrdersRes.error };
    }
    
    this.dashboardState.performanceTransactions.set(transactionsRes.data || []);
    this.dashboardState.performanceProductionPlans.set(productionPlansRes.data as ProductionPlan[] || []);
    this.setPerformanceCompletedOrdersWithPrices(completedOrdersRes.data || []);
    return { success: true, error: null };
  }
}
