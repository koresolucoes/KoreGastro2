
import { Injectable, signal, computed, WritableSignal, inject, effect } from '@angular/core';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { Hall, Table, Category, Recipe, Order, OrderItem, Ingredient, Station, Transaction, IngredientCategory, Supplier, RecipeIngredient, RecipePreparation, CashierClosing, Employee, Promotion, PromotionRecipe, RecipeSubRecipe, PurchaseOrder } from '../models/db.models';
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
  // FIX: Added recipeSubRecipes signal.
  recipeSubRecipes = signal<RecipeSubRecipe[]>([]);

  promotions = signal<Promotion[]>([]);
  promotionRecipes = signal<PromotionRecipe[]>([]);

  // FIX: Added purchaseOrders signal.
  purchaseOrders = signal<PurchaseOrder[]>([]);

  completedOrders = signal<Order[]>([]);
  transactions = signal<Transaction[]>([]);
  cashierClosings = signal<CashierClosing[]>([]);
  
  dashboardTransactions = signal<Transaction[]>([]);
  dashboardCompletedOrders = signal<Order[]>([]);

  performanceTransactions = signal<Transaction[]>([]);

  recipesById = computed(() => new Map(this.recipes().map(r => [r.id, r])));
  openOrders = computed(() => this.orders().filter(o => !o.is_completed));
  
  // FIX: Added a computed property to recursively calculate the cost of each recipe, including sub-recipes.
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
        // For a recipe to be "in stock", we just check if all its raw ingredients are available (stock > 0)
        // We don't check if there's enough quantity to make one, as this is for general menu availability.
        for (const ingredientId of recipeComposition.rawIngredients.keys()) {
          const availableStock = ingredientsStockMap.get(ingredientId);
          if (availableStock === undefined || availableStock <= 0) {
            hasStock = false;
            break;
          }
        }
      }
      // If a recipe has no ingredients, it's always considered in stock.
      
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${userId}` }, (p) => this.handleOrderChange(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items', filter: `user_id=eq.${userId}` }, (p) => this.handleOrderItemChange(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables', filter: `user_id=eq.${userId}` }, (p) => this.handleSignalChange(this.tables, p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'halls', filter: `user_id=eq.${userId}` }, (p) => this.handleSignalChange(this.halls, p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stations', filter: `user_id=eq.${userId}` }, (p) => this.refetchTableOnChanges(p, 'stations', '*, employees(*)', this.stations))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: `user_id=eq.${userId}` }, (p) => this.handleSignalChange(this.categories, p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes', filter: `user_id=eq.${userId}` }, (p) => this.handleSignalChange(this.recipes, p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees', filter: `user_id=eq.${userId}` }, (p) => this.handleSignalChange(this.employees, p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredient_categories', filter: `user_id=eq.${userId}` }, (p) => this.handleSignalChange(this.ingredientCategories, p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers', filter: `user_id=eq.${userId}` }, (p) => this.handleSignalChange(this.suppliers, p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipe_preparations', filter: `user_id=eq.${userId}` }, (p) => this.handleSignalChange(this.recipePreparations, p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'promotions', filter: `user_id=eq.${userId}` }, (p) => this.handleSignalChange(this.promotions, p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients', filter: `user_id=eq.${userId}` }, (p) => this.refetchTableOnChanges(p, 'ingredients', '*, ingredient_categories(name), suppliers(name)', this.ingredients))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipe_ingredients', filter: `user_id=eq.${userId}` }, (p) => this.refetchTableOnChanges(p, 'recipe_ingredients', '*, ingredients(name, unit, cost)', this.recipeIngredients))
      // FIX: Add subscription for recipe_sub_recipes.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipe_sub_recipes', filter: `user_id=eq.${userId}` }, (p) => this.refetchTableOnChanges(p, 'recipe_sub_recipes', '*, recipes(name, id)', this.recipeSubRecipes))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'promotion_recipes', filter: `user_id=eq.${userId}` }, (p) => this.refetchTableOnChanges(p, 'promotion_recipes', '*, recipes(name)', this.promotionRecipes))
      // FIX: Add subscriptions for purchase_orders and purchase_order_items.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders', filter: `user_id=eq.${userId}` }, (p) => this.refetchTableOnChanges(p, 'purchase_orders', '*, suppliers(name), purchase_order_items(*, ingredients(name, unit))', this.purchaseOrders))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_order_items', filter: `user_id=eq.${userId}` }, (p) => this.refetchTableOnChanges(p, 'purchase_orders', '*, suppliers(name), purchase_order_items(*, ingredients(name, unit))', this.purchaseOrders))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${userId}` }, (p) => this.handleDashboardDataChange(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cashier_closings', filter: `user_id=eq.${userId}` }, (p) => this.handleDashboardDataChange(p))
      .subscribe();
  }

  private handleSignalChange<T extends { id: string }>(signal: WritableSignal<T[]>, payload: RealtimePostgresChangesPayload<Partial<T>>) {
    switch (payload.eventType) {
      case 'INSERT': signal.update(current => [...current, payload.new as T]); break;
      case 'UPDATE': signal.update(current => current.map(item => item.id === (payload.new as T).id ? payload.new as T : item)); break;
      case 'DELETE': if ('id' in payload.old && payload.old.id) signal.update(current => current.filter(item => item.id !== payload.old.id)); break;
    }
  }

  private async refetchTableOnChanges<T>(payload: RealtimePostgresChangesPayload<{ [key: string]: any }>, tableName: string, selectQuery: string, signal: WritableSignal<T[]>) {
    const userId = this.currentUser()?.id; if (!userId) return;
    const { data, error } = await supabase.from(tableName).select(selectQuery).eq('user_id', userId);
    if (!error) signal.set(data as T[] || []);
  }
  
  private async handleDashboardDataChange(payload: RealtimePostgresChangesPayload<{ [key: string]: any }>) {
    await this.refreshDashboardAndCashierData();
  }

  private async refetchAndProcessOrder(orderId: string) {
    const { data: order } = await supabase.from('orders').select('*, order_items(*)').eq('id', orderId).single();
    if (!order || order.is_completed) {
      this.orders.update(current => current.filter(o => o.id !== orderId));
      if (order?.is_completed) this.refreshDashboardAndCashierData();
      return;
    }
    const [processedOrder] = this.processOrdersWithPrices([order]);
    const orderExists = this.orders().some(o => o.id === orderId);
    if (orderExists) this.orders.update(current => current.map(o => o.id === orderId ? processedOrder : o));
    else this.orders.update(current => [...current, processedOrder]);
  }

  private async handleOrderChange(payload: RealtimePostgresChangesPayload<Partial<Order>>) {
    const orderId = ('id' in payload.new ? payload.new.id : undefined) ?? ('id' in payload.old ? payload.old.id : undefined);
    if (orderId) await this.refetchAndProcessOrder(orderId);
  }

  private async handleOrderItemChange(payload: RealtimePostgresChangesPayload<Partial<OrderItem>>) {
    const orderId = ('order_id' in payload.new ? payload.new.order_id : undefined) ?? ('order_id' in payload.old ? payload.old.order_id : undefined);
    if (orderId) await this.refetchAndProcessOrder(orderId);
  }

  private clearAllData() {
    this.halls.set([]); this.tables.set([]); this.stations.set([]); this.categories.set([]); this.recipes.set([]);
    this.orders.set([]); this.employees.set([]); this.ingredients.set([]); this.ingredientCategories.set([]);
    this.suppliers.set([]); this.recipeIngredients.set([]); this.recipePreparations.set([]); this.promotions.set([]);
    this.promotionRecipes.set([]); this.completedOrders.set([]); this.transactions.set([]); this.cashierClosings.set([]);
    this.recipeSubRecipes.set([]); this.purchaseOrders.set([]);
    this.dashboardTransactions.set([]); this.dashboardCompletedOrders.set([]); this.performanceTransactions.set([]);
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
      supabase.from('halls').select('*').eq('user_id', userId),
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
      // FIX: Fetch recipe_sub_recipes.
      supabase.from('recipe_sub_recipes').select('*, recipes(name, id)').eq('user_id', userId),
      // FIX: Fetch purchase_orders.
      supabase.from('purchase_orders').select('*, suppliers(name), purchase_order_items(*, ingredients(name, unit))').eq('user_id', userId).order('created_at', { ascending: false })
    ]);
    this.halls.set(results[0].data || []); this.tables.set(results[1].data || []); this.stations.set(results[2].data || []);
    this.categories.set(results[3].data || []); this.setOrdersWithPrices(results[4].data || []);
    this.employees.set(results[5].data || []); this.ingredients.set(results[6].data as Ingredient[] || []);
    this.ingredientCategories.set(results[7].data || []); this.suppliers.set(results[8].data || []);
    this.recipeIngredients.set(results[9].data as RecipeIngredient[] || []); this.recipePreparations.set(results[10].data || []);
    this.promotions.set(results[11].data || []); this.promotionRecipes.set(results[12].data as PromotionRecipe[] || []);
    // FIX: Set new signals with fetched data.
    this.recipeSubRecipes.set(results[13].data as RecipeSubRecipe[] || []);
    this.purchaseOrders.set(results[14].data as PurchaseOrder[] || []);
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
  
  async fetchPerformanceDataForPeriod(startDate: Date, endDate: Date): Promise<{ success: boolean, error: any }> {
    const userId = this.currentUser()?.id; if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { data, error } = await supabase.from('transactions')
      .select('*')
      .eq('user_id', userId)
      .in('type', ['Gorjeta', 'Receita'])
      .gte('date', startDate.toISOString())
      .lte('date', endDate.toISOString());
      
    if (error) { 
      this.performanceTransactions.set([]);
      return { success: false, error };
    }
    this.performanceTransactions.set(data || []);
    return { success: true, error: null };
  }
}
