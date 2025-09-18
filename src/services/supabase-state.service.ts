import { Injectable, signal, computed, WritableSignal, inject, effect } from '@angular/core';
// FIX: The Realtime types are not directly exported in some versions of the Supabase client. Using 'any' for compatibility.
// FIX: Add Customer to the model imports
import { Hall, Table, Category, Recipe, Order, OrderItem, Ingredient, Station, Transaction, IngredientCategory, Supplier, RecipeIngredient, RecipePreparation, CashierClosing, Employee, Promotion, PromotionRecipe, RecipeSubRecipe, PurchaseOrder, ProductionPlan, Reservation, ReservationSettings, TimeClockEntry, Schedule, LeaveRequest, CompanyProfile, Role, RolePermission, Customer, LoyaltySettings, LoyaltyReward, InventoryLot, IfoodWebhookLog, IfoodMenuSync, Subscription, Plan } from '../models/db.models';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';
import { PricingService } from './pricing.service';

@Injectable({
  providedIn: 'root',
})
export class SupabaseStateService {
  private authService = inject(AuthService);
  private pricingService = inject(PricingService);
  
  private currentUser = this.authService.currentUser;
  private realtimeChannel: any | null = null;

  isDataLoaded = signal(false);

  halls = signal<Hall[]>([]);
  tables = signal<Table[]>([]);
  stations = signal<Station[]>([]);
  categories = signal<Category[]>([]);
  recipes = signal<Recipe[]>([]);
  orders = signal<Order[]>([]);
  employees = signal<Employee[]>([]);
  // FIX: Add a signal for customers
  customers = signal<Customer[]>([]);
  // FIX: Add signals for roles and permissions to be available application-wide.
  roles = signal<Role[]>([]);
  rolePermissions = signal<RolePermission[]>([]);
  
  ingredients = signal<Ingredient[]>([]);
  inventoryLots = signal<InventoryLot[]>([]);
  ingredientCategories = signal<IngredientCategory[]>([]);
  suppliers = signal<Supplier[]>([]);
  recipeIngredients = signal<RecipeIngredient[]>([]);
  recipePreparations = signal<RecipePreparation[]>([]);
  recipeSubRecipes = signal<RecipeSubRecipe[]>([]);

  promotions = signal<Promotion[]>([]);
  promotionRecipes = signal<PromotionRecipe[]>([]);

  purchaseOrders = signal<PurchaseOrder[]>([]);
  productionPlans = signal<ProductionPlan[]>([]);

  reservations = signal<Reservation[]>([]);
  reservationSettings = signal<ReservationSettings | null>(null);

  schedules = signal<Schedule[]>([]);
  leaveRequests = signal<LeaveRequest[]>([]);
  
  companyProfile = signal<CompanyProfile | null>(null);

  loyaltySettings = signal<LoyaltySettings | null>(null);
  loyaltyRewards = signal<LoyaltyReward[]>([]);

  ifoodWebhookLogs = signal<IfoodWebhookLog[]>([]);
  ifoodMenuSync = signal<IfoodMenuSync[]>([]);

  // Subscription plan signals
  plans = signal<Plan[]>([]);
  subscriptions = signal<Subscription[]>([]);
  activeUserPermissions = signal<Set<string>>(new Set());

  completedOrders = signal<Order[]>([]);
  transactions = signal<Transaction[]>([]);
  cashierClosings = signal<CashierClosing[]>([]);
  
  dashboardTransactions = signal<Transaction[]>([]);
  dashboardCompletedOrders = signal<Order[]>([]);

  performanceTransactions = signal<Transaction[]>([]);
  performanceProductionPlans = signal<ProductionPlan[]>([]);
  performanceCompletedOrders = signal<Order[]>([]);

  recipesById = computed(() => new Map(this.recipes().map(r => [r.id, r])));
  openOrders = computed(() => this.orders().filter(o => o.status === 'OPEN'));
  
  hasActiveSubscription = computed(() => {
    const subs = this.subscriptions();
    if (subs.length === 0) return false; 
    return subs.some(s => s.status === 'active' || s.status === 'trialing');
  });

  subscription = computed(() => this.subscriptions()[0] ?? null);
  
  currentPlan = computed(() => {
    const sub = this.subscription();
    const plans = this.plans();
    if (!sub) return null;
    return plans.find(p => p.id === sub.plan_id) ?? null;
  });

  isTrialing = computed(() => {
    const subs = this.subscriptions();
    if (subs.length === 0) return false;

    const userSub = subs[0];
    if (!userSub) return false;

    // Standard check, which is probably what Supabase/Stripe sets.
    if (userSub.status === 'trialing') {
      return true;
    }
    
    // User's custom logic.
    const plansMap = new Map(this.plans().map(p => [p.id, p]));
    const subPlan = plansMap.get(userSub.plan_id);
    
    if (subPlan && subPlan.trial_period_days && subPlan.trial_period_days > 0 && userSub.recurrent === false) {
      const createdAt = new Date(userSub.created_at);
      const trialEndDate = new Date(createdAt);
      trialEndDate.setDate(trialEndDate.getDate() + subPlan.trial_period_days);
      
      return new Date() < trialEndDate;
    }
    
    return false;
  });

  trialDaysRemaining = computed(() => {
    const sub = this.subscription();
    if (!this.isTrialing() || !sub) {
        return null;
    }

    // Standard trial logic
    if (sub.status === 'trialing' && sub.current_period_end) {
        const endDate = new Date(sub.current_period_end);
        const now = new Date();
        const diffTime = endDate.getTime() - now.getTime();
        if (diffTime < 0) return 0;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    }
    
    // User's custom logic for trial
    const plansMap = new Map(this.plans().map(p => [p.id, p]));
    const subPlan = plansMap.get(sub.plan_id);

    if (subPlan && subPlan.trial_period_days && sub.recurrent === false) {
      const createdAt = new Date(sub.created_at);
      const trialEndDate = new Date(createdAt);
      trialEndDate.setDate(trialEndDate.getDate() + subPlan.trial_period_days);
      
      const now = new Date();
      const diffTime = trialEndDate.getTime() - now.getTime();
      if (diffTime < 0) return 0;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    }

    return 0; // Fallback
  });

  recipeCosts = computed(() => {
    const ingredientsMap = new Map(this.ingredients().map(i => [i.id, i]));
    const recipeIngredients = this.recipeIngredients();
    const recipeSubRecipes = this.recipeSubRecipes();
    const recipes = this.recipes();
    const memo = new Map<string, { totalCost: number; ingredientCount: number; rawIngredients: Map<string, number> }>();

    const calculateCost = (recipeId: string): { totalCost: number; ingredientCount: number; rawIngredients: Map<string, number> } => {
        if (memo.has(recipeId)) {
            return memo.get(recipeId)!;
        }

        let totalCost = 0;
        const rawIngredients = new Map<string, number>();
        
        const directIngredients = recipeIngredients.filter(ri => ri.recipe_id === recipeId);
        for (const ri of directIngredients) {
            const ingredient = ingredientsMap.get(ri.ingredient_id);
            if (ingredient) {
                totalCost += (ingredient.cost || 0) * ri.quantity;
                rawIngredients.set(ri.ingredient_id, (rawIngredients.get(ri.ingredient_id) || 0) + ri.quantity);
            }
        }

        const subRecipes = recipeSubRecipes.filter(rsr => rsr.parent_recipe_id === recipeId);
        for (const sr of subRecipes) {
            const subRecipeCost = calculateCost(sr.child_recipe_id);
            totalCost += subRecipeCost.totalCost * sr.quantity;
            for (const [ingId, qty] of subRecipeCost.rawIngredients.entries()) {
              rawIngredients.set(ingId, (rawIngredients.get(ingId) || 0) + (qty * sr.quantity));
            }
        }
        
        const result = {
            totalCost,
            ingredientCount: directIngredients.length + subRecipes.length,
            rawIngredients,
        };
        memo.set(recipeId, result);
        return result;
    };

    for (const recipe of recipes) {
        if (!memo.has(recipe.id)) {
            calculateCost(recipe.id);
        }
    }
    
    return memo;
  });

  recipeDirectComposition = computed(() => {
    const recipes = this.recipes();
    const recipeIngredients = this.recipeIngredients();
    const recipeSubRecipes = this.recipeSubRecipes();
    const recipesMap = new Map(recipes.map(r => [r.id, r]));

    const compositionMap = new Map<string, { directIngredients: { ingredientId: string, quantity: number }[], subRecipeIngredients: { ingredientId: string, quantity: number }[] }>();

    for (const recipe of recipes) {
        const directIngredients = recipeIngredients
            .filter(ri => ri.recipe_id === recipe.id)
            .map(ri => ({ ingredientId: ri.ingredient_id, quantity: ri.quantity }));

        const subRecipeIngredients = recipeSubRecipes
            .filter(rsr => rsr.parent_recipe_id === recipe.id)
            .map(rsr => {
                const childRecipe = recipesMap.get(rsr.child_recipe_id);
                // The ingredient to deduct is the one linked to the sub-recipe via source_ingredient_id
                return childRecipe?.source_ingredient_id 
                    ? { ingredientId: childRecipe.source_ingredient_id, quantity: rsr.quantity }
                    : null;
            })
            .filter((item): item is { ingredientId: string, quantity: number } => item !== null);

        compositionMap.set(recipe.id, { directIngredients, subRecipeIngredients });
    }
    return compositionMap;
  });

  lastCashierClosing = computed(() => {
    const closings = this.cashierClosings();
    if (closings.length === 0) return null;
    return closings.sort((a,b) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime())[0];
  });

  recipesWithStockStatus = computed(() => {
    const ingredientsStockMap = new Map(this.ingredients().map(i => [i.id, i.stock]));
    const recipeCosts = this.recipeCosts(); // This has the flattened raw ingredients

    return this.recipes().map(recipe => {
      const recipeComposition = recipeCosts.get(recipe.id);
      
      let hasStock = true;
      if (recipeComposition && recipeComposition.rawIngredients.size > 0) {
        for (const ingredientId of recipeComposition.rawIngredients.keys()) {
          const availableStock = ingredientsStockMap.get(ingredientId);
          if (availableStock === undefined || availableStock <= 0) {
            hasStock = false;
            break;
          }
        }
      }
      return { ...recipe, hasStock };
    });
  });

  constructor() {
    effect(() => {
        const user = this.currentUser();
        if (user) {
            this.loadInitialData(user.id);
            this.subscribeToChanges(user.id);
        } else {
            this.unsubscribeFromChanges();
            this.clearAllData();
        }
    });

    effect(() => {
      this.pricingService.promotions.set(this.promotions());
      this.pricingService.promotionRecipes.set(this.promotionRecipes());
    });
  }

  public async refetchIfoodLogs() {
    await this.refetchSimpleTable('ifood_webhook_logs', '*', this.ifoodWebhookLogs);
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
        if (status === 'CHANNEL_ERROR') {
          console.error('Realtime channel error. Check Supabase RLS policies and network connectivity.');
        }
        if (status === 'TIMED_OUT') {
          console.warn('Realtime subscription timed out.');
        }
      });
  }

  private async refetchSubscriptionPermissions(userId: string) {
    const { data: permissions, error } = await supabase.rpc('get_user_active_permissions', { p_user_id: userId });
    if (!error && permissions) {
        this.activeUserPermissions.set(new Set(permissions.map((p: any) => p.permission_key)));
    } else if (error) {
        console.error('Error refetching subscription permissions:', error);
        this.activeUserPermissions.set(new Set()); // Clear permissions on error
    }
  }

  private handleChanges(payload: any) {
    console.log('Realtime change received:', payload);
    const userId = this.currentUser()?.id;
    if (!userId) return;

    switch (payload.table) {
        case 'orders':
        case 'order_items':
            this.refetchOrders();
            break;
        case 'subscriptions':
        case 'plans':
            this.refetchSubscriptionPermissions(userId);
            this.refetchSimpleTable('subscriptions', '*', this.subscriptions);
            this.refetchSimpleTable('plans', '*', this.plans);
            break;
        case 'ifood_webhook_logs':
            this.refetchIfoodLogs();
            break;
        case 'ifood_menu_sync':
            this.refetchSimpleTable('ifood_menu_sync', '*', this.ifoodMenuSync);
            break;
        case 'tables':
            this.refetchSimpleTable('tables', '*', this.tables);
            break;
        case 'halls':
            this.refetchSimpleTable('halls', '*', this.halls);
            break;
        case 'stations':
            this.refetchSimpleTable('stations', '*, employees(*)', this.stations);
            break;
        case 'categories':
            this.refetchSimpleTable('categories', '*', this.categories);
            break;
        case 'recipes':
            this.refetchSimpleTable('recipes', '*', this.recipes);
            break;
        case 'employees':
            this.refetchSimpleTable('employees', '*', this.employees);
            break;
        case 'ingredient_categories':
            this.refetchSimpleTable('ingredient_categories', '*', this.ingredientCategories);
            break;
        case 'suppliers':
            this.refetchSimpleTable('suppliers', '*', this.suppliers);
            break;
        case 'ingredients':
        case 'inventory_lots':
        case 'inventory_movements':
             this.refetchSimpleTable('ingredients', '*, ingredient_categories(name), suppliers(name)', this.ingredients);
             this.refetchSimpleTable('inventory_lots', '*', this.inventoryLots);
            break;
        case 'recipe_ingredients':
            this.refetchSimpleTable('recipe_ingredients', '*, ingredients(name, unit, cost)', this.recipeIngredients);
            break;
        case 'recipe_sub_recipes':
            this.refetchSimpleTable('recipe_sub_recipes', '*, recipes:recipes!child_recipe_id(name, id)', this.recipeSubRecipes);
            break;
        case 'recipe_preparations':
            this.refetchSimpleTable('recipe_preparations', '*', this.recipePreparations);
            break;
        case 'promotions':
            this.refetchSimpleTable('promotions', '*', this.promotions);
            break;
        case 'promotion_recipes':
            this.refetchSimpleTable('promotion_recipes', '*, recipes(name)', this.promotionRecipes);
            break;
        case 'purchase_orders':
        case 'purchase_order_items':
             this.refetchSimpleTable('purchase_orders', '*, suppliers(name), purchase_order_items(*, ingredients(name, unit))', this.purchaseOrders);
            break;
        case 'production_plans':
        case 'production_tasks':
            this.refetchSimpleTable('production_plans', '*, production_tasks(*, recipes!sub_recipe_id(name), stations(name), employees(name))', this.productionPlans);
            break;
        case 'schedules':
        case 'shifts':
            this.refetchSimpleTable('schedules', '*, shifts(*, employees(name))', this.schedules);
            break;
        case 'leave_requests':
            this.refetchSimpleTable('leave_requests', '*, employees(name, role)', this.leaveRequests);
            break;
        case 'reservations':
            this.refetchSimpleTable('reservations', '*', this.reservations);
            break;
        case 'reservation_settings':
            this.refetchSingleRow('reservation_settings', '*', this.reservationSettings);
            break;
        case 'loyalty_settings':
            this.refetchSingleRow('loyalty_settings', '*', this.loyaltySettings);
            break;
        case 'loyalty_rewards':
            this.refetchSimpleTable('loyalty_rewards', '*', this.loyaltyRewards);
            break;
        case 'company_profile':
            this.refetchSingleRow('company_profile', '*', this.companyProfile);
            break;
        // FIX: Add a case for customers to handle real-time updates.
        case 'customers':
        case 'loyalty_movements': // When movements change, we need to refetch customer to update points
            this.refetchSimpleTable('customers', '*', this.customers);
            break;
        // FIX: Add cases for roles and permissions to handle real-time updates.
        case 'roles':
            this.refetchSimpleTable('roles', '*', this.roles);
            break;
        case 'role_permissions':
            this.refetchSimpleTable('role_permissions', '*', this.rolePermissions);
            break;
        case 'time_clock_entries':
            // Refetch employees to update their clock-in status bubble
            this.refetchSimpleTable('employees', '*', this.employees);
            break;
        case 'transactions':
        case 'cashier_closings':
            this.refreshDashboardAndCashierData();
            break;
    }
  }

  private async refetchSimpleTable<T>(tableName: string, selectQuery: string, signal: WritableSignal<T[]>) {
    const userId = this.currentUser()?.id; if (!userId) return;
    let query = supabase.from(tableName).select(selectQuery);
    if (tableName !== 'plans') { // Plans are not user-specific
      query = query.eq('user_id', userId);
    }
    // FIX: Add customers to the list of tables ordered by creation date.
    if (tableName === 'halls' || tableName === 'reservations' || tableName === 'customers' || tableName === 'loyalty_rewards' || tableName === 'inventory_lots') {
      query = query.order('created_at', { ascending: true });
    }
    if (tableName === 'ifood_webhook_logs') {
      query = query.order('created_at', { ascending: false }).limit(100);
    }
    if (tableName === 'purchase_orders') {
      query = query.order('created_at', { ascending: false });
    }
    if (tableName === 'production_plans') {
      query = query.order('plan_date', { ascending: false });
    }
    if (tableName === 'schedules') {
      query = query.order('week_start_date', { ascending: false });
    }
    if (tableName === 'leave_requests') {
      query = query.order('start_date', { ascending: false });
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

  private clearAllData() {
    this.halls.set([]); this.tables.set([]); this.stations.set([]); this.categories.set([]); this.recipes.set([]);
    this.orders.set([]); this.employees.set([]); this.ingredients.set([]); this.ingredientCategories.set([]);
    this.suppliers.set([]); this.recipeIngredients.set([]); this.recipePreparations.set([]); this.promotions.set([]);
    this.promotionRecipes.set([]); this.completedOrders.set([]); this.transactions.set([]); this.cashierClosings.set([]);
    this.recipeSubRecipes.set([]); this.purchaseOrders.set([]); this.productionPlans.set([]);
    this.reservations.set([]); this.reservationSettings.set(null);
    this.schedules.set([]);
    this.leaveRequests.set([]);
    this.companyProfile.set(null);
    this.loyaltySettings.set(null);
    this.loyaltyRewards.set([]);
    this.inventoryLots.set([]);
    this.ifoodWebhookLogs.set([]);
    this.ifoodMenuSync.set([]);
    this.subscriptions.set([]);
    this.plans.set([]);
    this.activeUserPermissions.set(new Set());
    // FIX: Clear customers data on logout.
    this.customers.set([]);
    // FIX: Clear roles and permissions data on logout.
    this.roles.set([]);
    this.rolePermissions.set([]);
    this.dashboardTransactions.set([]); this.dashboardCompletedOrders.set([]); this.performanceTransactions.set([]);
    this.performanceProductionPlans.set([]);
    this.performanceCompletedOrders.set([]);
    this.isDataLoaded.set(false);
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
    await this.fetchRecipes(userId);
    // FIX: Add roles and role_permissions to the initial data fetch.
    // FIX: Add customers to the initial data fetch.
    const results = await Promise.all([
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
      supabase.from('production_plans').select('*, production_tasks(*, recipes!sub_recipe_id(name), stations(name), employees(name))').eq('user_id', userId).order('plan_date', { ascending: false }),
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
    ]);
    this.halls.set(results[0].data || []); this.tables.set(results[1].data || []); this.stations.set(results[2].data as Station[] || []);
    this.categories.set(results[3].data || []); this.setOrdersWithPrices(results[4].data || []);
    this.employees.set(results[5].data || []); this.ingredients.set(results[6].data as Ingredient[] || []);
    this.ingredientCategories.set(results[7].data || []); this.suppliers.set(results[8].data || []);
    this.recipeIngredients.set(results[9].data as RecipeIngredient[] || []); this.recipePreparations.set(results[10].data || []);
    this.promotions.set(results[11].data || []); this.promotionRecipes.set(results[12].data as PromotionRecipe[] || []);
    this.recipeSubRecipes.set(results[13].data as RecipeSubRecipe[] || []);
    this.purchaseOrders.set(results[14].data as PurchaseOrder[] || []);
    this.productionPlans.set(results[15].data as ProductionPlan[] || []);
    this.reservations.set(results[16].data || []);
    this.reservationSettings.set(results[17].data || null);
    this.schedules.set(results[18].data as Schedule[] || []);
    this.leaveRequests.set(results[19].data as LeaveRequest[] || []);
    this.companyProfile.set(results[20].data || null);
    this.roles.set(results[21].data || []);
    this.rolePermissions.set(results[22].data || []);
    this.customers.set(results[23].data || []);
    this.loyaltySettings.set(results[24].data || null);
    this.loyaltyRewards.set(results[25].data || []);
    this.inventoryLots.set(results[26].data || []);
    this.ifoodWebhookLogs.set(results[27].data as IfoodWebhookLog[] || []);
    this.ifoodMenuSync.set(results[28].data || []);
    this.subscriptions.set(results[29].data as Subscription[] || []);
    this.plans.set(results[30].data as Plan[] || []);
    await this.refreshDashboardAndCashierData();
  }
  
  public async refreshDashboardAndCashierData() {
    const userId = this.currentUser()?.id; if (!userId) return;
    const { data: closings } = await supabase.from('cashier_closings').select('*').eq('user_id', userId).order('closed_at', { ascending: false });
    this.cashierClosings.set(closings || []);
    const today = new Date(); const isoEndDate = today.toISOString(); today.setHours(0, 0, 0, 0); const isoStartDate = today.toISOString();
    const cashierStartDate = this.lastCashierClosing() ? new Date(this.lastCashierClosing()!.closed_at) : new Date(isoStartDate);
    const results = await Promise.all([
        supabase.from('orders').select('*, order_items(*), customers(*)').eq('status', 'COMPLETED').gte('completed_at', cashierStartDate.toISOString()).lte('completed_at', isoEndDate).eq('user_id', userId),
        supabase.from('transactions').select('*').gte('date', cashierStartDate.toISOString()).lte('date', isoEndDate).eq('user_id', userId),
        supabase.from('transactions').select('*').gte('date', isoStartDate).lte('date', isoEndDate).eq('user_id', userId),
        supabase.from('orders').select('*, order_items(*), customers(*)').eq('status', 'COMPLETED').gte('completed_at', isoStartDate).lte('completed_at', isoEndDate).eq('user_id', userId)
    ]);
    this.setCompletedOrdersWithPrices(results[0].data || []);
    this.transactions.set(results[1].data || []);
    this.dashboardTransactions.set(results[2].data || []);
    this.setDashboardCompletedOrdersWithPrices(results[3].data || []);
  }

  private async fetchRecipes(userId: string) {
    const { data } = await supabase.from('recipes').select('*').eq('user_id', userId);
    this.recipes.set(data || []);
  }

  private processOrdersWithPrices(orders: any[]): Order[] {
    return orders.map(o => ({ ...o, order_items: (o.order_items || []).map((item: any) => ({ ...item, price: item.price ?? this.pricingService.getEffectivePrice(this.recipesById().get(item.recipe_id)!) ?? 0 })) }));
  }

  private processCompletedOrdersWithPrices(orders: any[]): Order[] {
    return orders.map(o => ({ ...o, order_items: (o.order_items || []).map((item: any) => ({ ...item, price: item.price ?? this.recipesById().get(item.recipe_id)?.price ?? 0 })) }));
  }

  private setOrdersWithPrices(orders: any[]) { this.orders.set(this.processOrdersWithPrices(orders)); }
  private setCompletedOrdersWithPrices(orders: any[]) { this.completedOrders.set(this.processCompletedOrdersWithPrices(orders)); }
  private setDashboardCompletedOrdersWithPrices(orders: any[]) { this.dashboardCompletedOrders.set(this.processCompletedOrdersWithPrices(orders)); }
  
  async fetchSalesDataForPeriod(startDate: Date, endDate: Date): Promise<{ success: boolean, error: any }> {
    const userId = this.currentUser()?.id; if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const [completedOrders, transactions] = await Promise.all([
      supabase.from('orders').select('*, order_items(*), customers(*)').eq('status', 'COMPLETED').gte('completed_at', startDate.toISOString()).lte('completed_at', endDate.toISOString()).eq('user_id', userId),
      supabase.from('transactions').select('*').gte('date', startDate.toISOString()).lte('date', endDate.toISOString()).eq('user_id', userId).eq('type', 'Receita')
    ]);
    if (completedOrders.error || transactions.error) return { success: false, error: completedOrders.error || transactions.error };
    this.setCompletedOrdersWithPrices(completedOrders.data || []);
    this.transactions.set(transactions.data || []);
    return { success: true, error: null };
  }
  
  async fetchPerformanceDataForPeriod(startDate: Date, endDate: Date): Promise<{ success: boolean; error: any }> {
    const userId = this.currentUser()?.id; if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    
    const [transactionsRes, productionPlansRes, completedOrdersRes] = await Promise.all([
      supabase.from('transactions')
        .select('*')
        .eq('user_id', userId)
        .in('type', ['Gorjeta', 'Receita'])
        .gte('date', startDate.toISOString())
        .lte('date', endDate.toISOString()),
      supabase.from('production_plans')
        .select('*, production_tasks!inner(*, employees(name))')
        .eq('user_id', userId)
        .gte('plan_date', startDate.toISOString().split('T')[0])
        .lte('plan_date', endDate.toISOString().split('T')[0]),
      supabase.from('orders')
        .select('*, order_items(*), customers(*)')
        .eq('user_id', userId)
        .eq('status', 'COMPLETED')
        .gte('completed_at', startDate.toISOString())
        .lte('completed_at', endDate.toISOString())
    ]);
      
    if (transactionsRes.error || productionPlansRes.error || completedOrdersRes.error) { 
      this.performanceTransactions.set([]);
      this.performanceProductionPlans.set([]);
      this.performanceCompletedOrders.set([]);
      return { success: false, error: transactionsRes.error || productionPlansRes.error || completedOrdersRes.error };
    }
    
    this.performanceTransactions.set(transactionsRes.data || []);
    this.performanceProductionPlans.set(productionPlansRes.data as ProductionPlan[] || []);
    this.setPerformanceCompletedOrdersWithPrices(completedOrdersRes.data || []);
    return { success: true, error: null };
  }

  private setPerformanceCompletedOrdersWithPrices(orders: any[]) { this.performanceCompletedOrders.set(this.processCompletedOrdersWithPrices(orders)); }
}