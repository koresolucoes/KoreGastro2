import { Injectable, signal, computed, WritableSignal, inject, effect } from '@angular/core';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { Hall, Table, Category, Recipe, Order, OrderItem, Ingredient, Station, Transaction, IngredientCategory, Supplier, RecipeIngredient, RecipePreparation, CashierClosing, Employee, Promotion, PromotionRecipe, RecipeSubRecipe, PurchaseOrder, ProductionPlan, Reservation, ReservationSettings, TimeClockEntry } from '../models/db.models';
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
  private realtimeChannel: RealtimeChannel | null = null;

  isDataLoaded = signal(false);

  halls = signal<Hall[]>([]);
  tables = signal<Table[]>([]);
  stations = signal<Station[]>([]);
  categories = signal<Category[]>([]);
  recipes = signal<Recipe[]>([]);
  orders = signal<Order[]>([]);
  employees = signal<Employee[]>([]);
  
  ingredients = signal<Ingredient[]>([]);
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

  timeClockEntries = signal<TimeClockEntry[]>([]);

  completedOrders = signal<Order[]>([]);
  transactions = signal<Transaction[]>([]);
  cashierClosings = signal<CashierClosing[]>([]);
  
  dashboardTransactions = signal<Transaction[]>([]);
  dashboardCompletedOrders = signal<Order[]>([]);

  performanceTransactions = signal<Transaction[]>([]);
  performanceProductionPlans = signal<ProductionPlan[]>([]);
  performanceCompletedOrders = signal<Order[]>([]);

  recipesById = computed(() => new Map(this.recipes().map(r => [r.id, r])));
  openOrders = computed(() => this.orders().filter(o => !o.is_completed));
  
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
        (payload) => this.handleChanges(payload)
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

  private handleChanges(payload: RealtimePostgresChangesPayload<any>) {
    console.log('Realtime change received:', payload);
    switch (payload.table) {
        case 'orders':
        case 'order_items':
            this.refetchOrders();
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
        case 'inventory_movements':
             this.refetchSimpleTable('ingredients', '*, ingredient_categories(name), suppliers(name)', this.ingredients);
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
        case 'reservations':
            this.refetchSimpleTable('reservations', '*', this.reservations);
            break;
        case 'reservation_settings':
            this.refetchSingleRow('reservation_settings', '*', this.reservationSettings);
            break;
        case 'time_clock_entries':
            this.refetchSimpleTable('time_clock_entries', '*, employees(name)', this.timeClockEntries);
            this.refetchSimpleTable('employees', '*', this.employees); // Also refetch employees for status
            break;
        case 'transactions':
        case 'cashier_closings':
            this.refreshDashboardAndCashierData();
            break;
    }
  }

  private async refetchSimpleTable<T>(tableName: string, selectQuery: string, signal: WritableSignal<T[]>) {
    const userId = this.currentUser()?.id; if (!userId) return;
    let query = supabase.from(tableName).select(selectQuery).eq('user_id', userId);
    if (tableName === 'halls' || tableName === 'reservations') {
      query = query.order('created_at', { ascending: true });
    }
    if (tableName === 'time_clock_entries') {
      query = query.order('clock_in_time', { ascending: false });
    }
    if (tableName === 'purchase_orders') {
      query = query.order('created_at', { ascending: false });
    }
    if (tableName === 'production_plans') {
      query = query.order('plan_date', { ascending: false });
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
    const { data, error } = await supabase.from('orders').select('*, order_items(*)').eq('is_completed', false).eq('user_id', userId);
    if (!error) this.setOrdersWithPrices(data || []);
    else console.error('Error refetching orders:', error);
  }

  private clearAllData() {
    this.halls.set([]); this.tables.set([]); this.stations.set([]); this.categories.set([]); this.recipes.set([]);
    this.orders.set([]); this.employees.set([]); this.ingredients.set([]); this.ingredientCategories.set([]);
    this.suppliers.set([]); this.recipeIngredients.set([]); this.recipePreparations.set([]); this.promotions.set([]);
    this.promotionRecipes.set([]); this.completedOrders.set([]); this.transactions.set([]); this.cashierClosings.set([]);
    this.recipeSubRecipes.set([]); this.purchaseOrders.set([]); this.productionPlans.set([]);
    this.reservations.set([]); this.reservationSettings.set(null); this.timeClockEntries.set([]);
    this.dashboardTransactions.set([]); this.dashboardCompletedOrders.set([]); this.performanceTransactions.set([]);
    this.performanceProductionPlans.set([]);
    this.performanceCompletedOrders.set([]);
    this.isDataLoaded.set(false);
  }

  private async loadInitialData(userId: string) {
    this.isDataLoaded.set(false);
    try { await this.refreshData(userId); } 
    catch (error) { this.clearAllData(); } 
    finally { this.isDataLoaded.set(true); }
  }

  private async refreshData(userId: string) {
    await this.fetchRecipes(userId);
    const results = await Promise.all([
      supabase.from('halls').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      supabase.from('tables').select('*').eq('user_id', userId),
      supabase.from('stations').select('*, employees(*)').eq('user_id', userId),
      supabase.from('categories').select('*').eq('user_id', userId),
      supabase.from('orders').select('*, order_items(*)').eq('is_completed', false).eq('user_id', userId),
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
      supabase.from('time_clock_entries').select('*, employees(name)').eq('user_id', userId).order('clock_in_time', { ascending: false }),
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
    this.timeClockEntries.set(results[18].data as TimeClockEntry[] || []);
    await this.refreshDashboardAndCashierData();
  }
  
  public async refreshDashboardAndCashierData() {
    const userId = this.currentUser()?.id; if (!userId) return;
    const { data: closings } = await supabase.from('cashier_closings').select('*').eq('user_id', userId).order('closed_at', { ascending: false });
    this.cashierClosings.set(closings || []);
    const today = new Date(); const isoEndDate = today.toISOString(); today.setHours(0, 0, 0, 0); const isoStartDate = today.toISOString();
    const cashierStartDate = this.lastCashierClosing() ? new Date(this.lastCashierClosing()!.closed_at) : new Date(isoStartDate);
    const results = await Promise.all([
        supabase.from('orders').select('*, order_items(*)').eq('is_completed', true).gte('completed_at', cashierStartDate.toISOString()).lte('completed_at', isoEndDate).eq('user_id', userId),
        supabase.from('transactions').select('*').gte('date', cashierStartDate.toISOString()).lte('date', isoEndDate).eq('user_id', userId),
        supabase.from('transactions').select('*').gte('date', isoStartDate).lte('date', isoEndDate).eq('user_id', userId),
        supabase.from('orders').select('*, order_items(*)').eq('is_completed', true).gte('completed_at', isoStartDate).lte('completed_at', isoEndDate).eq('user_id', userId)
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
      supabase.from('orders').select('*, order_items(*)').eq('is_completed', true).gte('completed_at', startDate.toISOString()).lte('completed_at', endDate.toISOString()).eq('user_id', userId),
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
        .select('*, order_items(*)')
        .eq('user_id', userId)
        .eq('is_completed', true)
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
