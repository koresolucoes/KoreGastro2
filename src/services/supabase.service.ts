

import { Injectable, signal, computed, WritableSignal, inject, effect } from '@angular/core';
import { User, RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { Hall, Table, Category, Recipe, Order, OrderItem, Ingredient, Station, OrderItemStatus, Transaction, IngredientCategory, Supplier, RecipeIngredient, IngredientUnit, RecipePreparation, CashierClosing, TransactionType, Employee, Promotion, PromotionRecipe, TableStatus } from '../models/db.models';
import { v4 as uuidv4 } from 'uuid';
import { PrintingService } from './printing.service';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client'; // Use the shared client
import { PricingService } from './pricing.service';

export type PaymentInfo = { method: string; amount: number };
interface QuickSaleCartItem { recipe: Recipe; quantity: number; }

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private printingService = inject(PrintingService);
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
  
  // Inventory & Suppliers
  ingredients = signal<Ingredient[]>([]);
  ingredientCategories = signal<IngredientCategory[]>([]);
  suppliers = signal<Supplier[]>([]);
  recipeIngredients = signal<RecipeIngredient[]>([]);
  recipePreparations = signal<RecipePreparation[]>([]);

  // Promotions
  promotions = signal<Promotion[]>([]);
  promotionRecipes = signal<PromotionRecipe[]>([]);

  // Signals for reports & cashier
  completedOrders = signal<Order[]>([]);
  transactions = signal<Transaction[]>([]);
  cashierClosings = signal<CashierClosing[]>([]);
  
  // Signals for dashboard
  dashboardTransactions = signal<Transaction[]>([]);
  dashboardCompletedOrders = signal<Order[]>([]);

  // Signals for performance page
  performanceTipTransactions = signal<Transaction[]>([]);

  recipesById = computed(() => new Map(this.recipes().map(r => [r.id, r])));

  openOrders = computed(() => this.orders().filter(o => !o.is_completed));
  
  lastCashierClosing = computed(() => {
    const closings = this.cashierClosings();
    if (closings.length === 0) return null;
    // Sort to make sure we get the very last one
    return closings.sort((a,b) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime())[0];
  });

  recipesWithStockStatus = computed(() => {
    const recipes = this.recipes();
    const ingredients = this.ingredients();
    const recipeIngredients = this.recipeIngredients();
    const ingredientsStockMap = new Map(ingredients.map(i => [i.id, i.stock]));

    return recipes.map(recipe => {
      const requiredIngredients = recipeIngredients.filter(ri => ri.recipe_id === recipe.id);
      
      if (requiredIngredients.length === 0) {
        return { ...recipe, hasStock: true };
      }

      const hasStock = requiredIngredients.every(ri => {
        const stock = ingredientsStockMap.get(ri.ingredient_id);
        return stock !== undefined && stock > 0;
      });

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

    // Effect to sync promotion data to the PricingService, breaking the circular dependency.
    effect(() => {
      this.pricingService.promotions.set(this.promotions());
      this.pricingService.promotionRecipes.set(this.promotionRecipes());
    });
  }

  private unsubscribeFromChanges() {
    if (this.realtimeChannel) {
        supabase.removeChannel(this.realtimeChannel);
        this.realtimeChannel = null;
        console.log('Unsubscribed from realtime changes.');
    }
  }

  private subscribeToChanges(userId: string) {
    this.unsubscribeFromChanges(); // Ensure no multiple channels are running
    
    // Use a user-specific channel name for better isolation and apply server-side filtering
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'promotion_recipes', filter: `user_id=eq.${userId}` }, (p) => this.refetchTableOnChanges(p, 'promotion_recipes', '*, recipes(name)', this.promotionRecipes))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${userId}` }, (p) => this.handleDashboardDataChange(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cashier_closings', filter: `user_id=eq.${userId}` }, (p) => this.handleDashboardDataChange(p))
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Connected to real-time updates on channel: db-changes:${userId}`);
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Realtime subscription error:', err);
        }
      });
  }

  // Generic handler for simple tables with an 'id' primary key
  private handleSignalChange<T extends { id: string }>(
    signal: WritableSignal<T[]>,
    // FIX: Use Partial<T> to correctly type the payload, especially for DELETE events where `old` may be incomplete.
    payload: RealtimePostgresChangesPayload<Partial<T>>
  ) {
    // user_id check is no longer needed due to server-side filtering
    switch (payload.eventType) {
        case 'INSERT':
            signal.update(current => [...current, payload.new as T]);
            break;
        case 'UPDATE':
            signal.update(current => current.map(item => item.id === (payload.new as T).id ? payload.new as T : item));
            break;
        case 'DELETE':
            // FIX: The `old` property on a payload can be an empty object on non-delete events.
            // Using a type guard (`in`) is safer than direct casting to ensure `id` exists before access.
            if ('id' in payload.old && payload.old.id) {
                const oldId = payload.old.id;
                signal.update(current => current.filter(item => item.id !== oldId));
            }
            break;
    }
  }

  // Handler to refetch an entire table, useful for tables with joins or complex keys
  private async refetchTableOnChanges<T>(
    payload: RealtimePostgresChangesPayload<{ [key: string]: any }>,
    tableName: string,
    selectQuery: string,
    signal: WritableSignal<T[]>
  ) {
    const userId = this.currentUser()?.id;
    // The payload user_id check is removed, but we still need the userId for the fetch query.
    if (!userId) return;

    const { data, error } = await supabase.from(tableName).select(selectQuery).eq('user_id', userId);
    if (error) {
        console.error(`Error refetching ${tableName}:`, error);
    } else {
        signal.set(data as T[] || []);
    }
  }
  
  // Handler for tables that affect dashboard/cashier views
  private async handleDashboardDataChange(payload: RealtimePostgresChangesPayload<{ [key: string]: any }>) {
    // user_id check is no longer needed due to server-side filtering
    await this.refreshDashboardAndCashierData();
  }

  /**
   * Centralized logic to refetch an order and update the local state.
   * Handles inserts, updates, and deletions gracefully.
   */
  private async refetchAndProcessOrder(orderId: string) {
    const { data: order } = await supabase.from('orders').select('*, order_items(*)').eq('id', orderId).single();

    // Case 1: Order was deleted or no longer exists. Remove from local state.
    if (!order) {
        this.orders.update(current => current.filter(o => o.id !== orderId));
        return;
    }

    // Case 2: Order was completed. Remove from open orders and refresh related data.
    if (order.is_completed) {
        this.orders.update(current => current.filter(o => o.id !== orderId));
        this.refreshDashboardAndCashierData();
        return;
    }

    // Case 3: Order is active. Process prices and update/insert into local state.
    const [processedOrder] = this.processOrdersWithPrices([order]);
    const orderExists = this.orders().some(o => o.id === orderId);

    if (orderExists) {
        // Update existing order
        this.orders.update(current => current.map(o => o.id === orderId ? processedOrder : o));
    } else {
        // Add new order
        this.orders.update(current => [...current, processedOrder]);
    }
  }

  private async handleOrderChange(payload: RealtimePostgresChangesPayload<Partial<Order>>) {
    // Safely access properties on `new` and `old` using the `in` operator as a type guard.
    // This prevents build errors when `new` or `old` is an empty object `{}`.
    const newId = 'id' in payload.new ? payload.new.id : undefined;
    const oldId = 'id' in payload.old ? payload.old.id : undefined;
    const orderId = newId ?? oldId;

    if (orderId) {
        await this.refetchAndProcessOrder(orderId);
    }
  }

  private async handleOrderItemChange(payload: RealtimePostgresChangesPayload<Partial<OrderItem>>) {
    // Safely access properties on `new` and `old` using the `in` operator as a type guard.
    // This prevents build errors when `new` or `old` is an empty object `{}`.
    const newOrderId = 'order_id' in payload.new ? payload.new.order_id : undefined;
    const oldOrderId = 'order_id' in payload.old ? payload.old.order_id : undefined;
    const orderId = newOrderId ?? oldOrderId;
      
    if (orderId) {
        await this.refetchAndProcessOrder(orderId);
    }
  }

  private clearAllData() {
      this.halls.set([]);
      this.tables.set([]);
      this.stations.set([]);
      this.categories.set([]);
      this.recipes.set([]);
      this.orders.set([]);
      this.employees.set([]);
      this.ingredients.set([]);
      this.ingredientCategories.set([]);
      this.suppliers.set([]);
      this.recipeIngredients.set([]);
      this.recipePreparations.set([]);
      this.promotions.set([]);
      this.promotionRecipes.set([]);
      this.completedOrders.set([]);
      this.transactions.set([]);
      this.cashierClosings.set([]);
      this.dashboardTransactions.set([]);
      this.dashboardCompletedOrders.set([]);
      this.performanceTipTransactions.set([]);
      this.isDataLoaded.set(false);
  }

  private async loadInitialData(userId: string) {
    this.isDataLoaded.set(false);
    try {
      await this.refreshData(userId);
    } catch (error) {
        console.error('Catastrophic error during initial data load:', error);
        this.clearAllData();
    } finally {
        this.isDataLoaded.set(true);
    }
  }

  private async refreshData(userId: string) {
    try {
      await this.fetchRecipes(userId); 
    
      const [
          halls, tables, stations, categories, openOrders, 
          employees, ingredients, ingredientCategories, suppliers, 
          recipeIngredients, recipePreparations, promotions, promotionRecipes
      ] = await Promise.all([
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
        supabase.from('promotion_recipes').select('*, recipes(name)').eq('user_id', userId)
      ]);

      if (halls.error) console.error('Error fetching halls:', halls.error); else this.halls.set(halls.data || []);
      if (tables.error) console.error('Error fetching tables:', tables.error); else this.tables.set(tables.data || []);
      if (stations.error) console.error('Error fetching stations:', stations.error); else this.stations.set(stations.data || []);
      if (categories.error) console.error('Error fetching categories:', categories.error); else this.categories.set(categories.data || []);
      if (openOrders.error) console.error('Error fetching orders:', openOrders.error); else this.setOrdersWithPrices(openOrders.data || []);
      if (employees.error) console.error('Error fetching employees:', employees.error); else this.employees.set(employees.data || []);
      if (ingredients.error) console.error('Error fetching ingredients:', ingredients.error); else this.ingredients.set((ingredients.data as Ingredient[]) || []);
      if (ingredientCategories.error) console.error('Error fetching ingredient categories:', ingredientCategories.error); else this.ingredientCategories.set(ingredientCategories.data || []);
      if (suppliers.error) console.error('Error fetching suppliers:', suppliers.error); else this.suppliers.set(suppliers.data || []);
      if (recipeIngredients.error) console.error('Error fetching recipe ingredients:', recipeIngredients.error); else this.recipeIngredients.set((recipeIngredients.data as RecipeIngredient[]) || []);
      if (recipePreparations.error) console.error('Error fetching recipe preparations:', recipePreparations.error); else this.recipePreparations.set(recipePreparations.data || []);
      
      if (promotions.error) console.error('Error fetching promotions:', promotions.error.message || promotions.error); else this.promotions.set(promotions.data || []);
      
      if (promotionRecipes.error) console.error('Error fetching promotion recipes:', promotionRecipes.error.message || promotionRecipes.error); else this.promotionRecipes.set((promotionRecipes.data as PromotionRecipe[]) || []);
      
      await this.refreshDashboardAndCashierData();

    } catch (error) {
        console.error('Error during data refresh:', error);
    }
  }
  
  private async refreshDashboardAndCashierData() {
      const userId = this.currentUser()?.id;
      if (!userId) return;

      const { data: latestClosings, error: closingError } = await supabase.from('cashier_closings').select('*').eq('user_id', userId).order('closed_at', { ascending: false });
      if (closingError) console.error('Error fetching cashier closings:', closingError);
      this.cashierClosings.set(latestClosings || []);

      const lastClosing = this.lastCashierClosing();
      const today = new Date();
      const isoEndDate = today.toISOString();
      today.setHours(0, 0, 0, 0);
      const isoStartDate = today.toISOString();

      const cashierStartDate = lastClosing ? new Date(lastClosing.closed_at) : new Date(isoStartDate);

      const [
          completedOrders, transactions, dashboardTransactions, dashboardCompletedOrders
      ] = await Promise.all([
          supabase.from('orders').select('*, order_items(*)').eq('is_completed', true).gte('completed_at', cashierStartDate.toISOString()).lte('completed_at', isoEndDate).eq('user_id', userId),
          supabase.from('transactions').select('*').gte('date', cashierStartDate.toISOString()).lte('date', isoEndDate).eq('user_id', userId),
          supabase.from('transactions').select('*').gte('date', isoStartDate).lte('date', isoEndDate).eq('user_id', userId), // Dashboard is always just for today
          supabase.from('orders').select('*, order_items(*)').eq('is_completed', true).gte('completed_at', isoStartDate).lte('completed_at', isoEndDate).eq('user_id', userId) // Dashboard is always just for today
      ]);

      if (completedOrders.error) console.error('Error fetching completed orders:', completedOrders.error); else this.setCompletedOrdersWithPrices(completedOrders.data || []);
      if (transactions.error) console.error('Error fetching transactions:', transactions.error); else this.transactions.set(transactions.data || []);
      if (dashboardTransactions.error) console.error('Error fetching dashboard transactions:', dashboardTransactions.error); else this.dashboardTransactions.set(dashboardTransactions.data || []);
      if (dashboardCompletedOrders.error) console.error('Error fetching dashboard completed orders:', dashboardCompletedOrders.error); else this.setDashboardCompletedOrdersWithPrices(dashboardCompletedOrders.data || []);
  }

  private async fetchRecipes(userId: string) {
    try {
      const { data, error } = await supabase.from('recipes').select('*').eq('user_id', userId);
      if (error) {
        console.error('CRITICAL: Error fetching recipes, app may not function correctly.', error);
        this.recipes.set([]);
        throw new Error('Failed to fetch recipes');
      }
      if (data) this.recipes.set(data);
    } catch(error) {
        console.error("Error in fetchRecipes:", error);
        this.recipes.set([]);
    }
  }

  private processOrdersWithPrices(orders: any[]): Order[] {
    const recipesMap = this.recipesById();
    return orders.map(o => ({
        ...o,
        order_items: (o.order_items || []).map((item: any) => ({
            ...item,
            price: item.price ?? this.pricingService.getEffectivePrice(recipesMap.get(item.recipe_id)!) ?? 0
        }))
    }));
  }

  private processCompletedOrdersWithPrices(orders: any[]): Order[] {
    const recipesMap = this.recipesById();
    return orders.map(o => ({
        ...o,
        order_items: (o.order_items || []).map((item: any) => ({
            ...item,
            price: item.price ?? recipesMap.get(item.recipe_id)?.price ?? 0
        }))
    }));
  }

  private setOrdersWithPrices(orders: any[]) {
      this.orders.set(this.processOrdersWithPrices(orders));
  }

  private setCompletedOrdersWithPrices(orders: any[]) {
    this.completedOrders.set(this.processCompletedOrdersWithPrices(orders));
  }

   private setDashboardCompletedOrdersWithPrices(orders: any[]) {
    this.dashboardCompletedOrders.set(this.processCompletedOrdersWithPrices(orders));
  }
  
  getOrderByTableNumber(tableNumber: number): Order | undefined {
    return this.openOrders().find(o => o.table_number === tableNumber);
  }

  async createOrderForTable(table: Table): Promise<{ success: boolean; error: any; data?: Order }> {
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const { data: newOrderData, error: orderError } = await supabase
        .from('orders')
        .insert({ table_number: table.number, order_type: 'Dine-in', user_id: userId })
        .select()
        .single();
    
    if (orderError) {
      return { success: false, error: orderError };
    }
    
    // Realtime will handle the state update.
    return { success: true, error: null, data: { ...newOrderData, order_items: [] } };
  }

  async addItemsToOrder(orderId: string, tableId: string, employeeId: string, items: { recipe: Recipe; quantity: number; notes?: string }[]): Promise<{ success: boolean; error: any }> {
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const stations = this.stations();
    if (stations.length === 0) {
        return { success: false, error: { message: 'Nenhuma estação de produção foi configurada. Por favor, adicione uma estação em Configurações antes de enviar um pedido.' } };
    }
    const fallbackStationId = stations[0].id;

    const allItemsToInsert: Omit<OrderItem, 'id' | 'created_at'>[] = [];
    const recipeIds = items.map(item => item.recipe.id);
    const { data: preparations, error: prepError } = await supabase.from('recipe_preparations').select('*').in('recipe_id', recipeIds).eq('user_id', userId);
    if (prepError) return { success: false, error: prepError };

    const prepsByRecipeId = new Map<string, RecipePreparation[]>();
    for (const prep of preparations) {
        if (!prepsByRecipeId.has(prep.recipe_id)) prepsByRecipeId.set(prep.recipe_id, []);
        prepsByRecipeId.get(prep.recipe_id)!.push(prep);
    }
    
    for (const item of items) {
        const effectivePrice = this.pricingService.getEffectivePrice(item.recipe);
        const recipePreps = prepsByRecipeId.get(item.recipe.id);
        const status_timestamps = { 'PENDENTE': new Date().toISOString() };
        if (recipePreps && recipePreps.length > 0) {
            const groupId = uuidv4();
            recipePreps.forEach((prep) => {
                allItemsToInsert.push({
                    order_id: orderId,
                    recipe_id: item.recipe.id,
                    name: `${item.recipe.name} (${prep.name})`,
                    quantity: item.quantity,
                    notes: item.notes,
                    status: 'PENDENTE',
                    station_id: prep.station_id,
                    status_timestamps,
                    price: effectivePrice / recipePreps.length,
                    group_id: groupId,
                    user_id: userId
                });
            });
        } else {
            allItemsToInsert.push({
                order_id: orderId,
                recipe_id: item.recipe.id,
                name: item.recipe.name,
                quantity: item.quantity,
                notes: item.notes,
                status: 'PENDENTE',
                station_id: fallbackStationId,
                status_timestamps,
                price: effectivePrice,
                group_id: null,
                user_id: userId
            });
        }
    }

    if (allItemsToInsert.length > 0) {
        const { data: insertedItems, error } = await supabase.from('order_items').insert(allItemsToInsert).select();
        
        if (error) return { success: false, error };
        
        // After successfully inserting items, update the table status to Occupied.
        // This marks the moment the table is officially in use.
        const { error: tableError } = await supabase
            .from('tables')
            .update({ status: 'OCUPADA', employee_id: employeeId })
            .eq('id', tableId);
        
        if (tableError) {
             console.error(`CRITICAL: Items for order ${orderId} were added, but failed to update table ${tableId} status. Manual correction needed.`, tableError);
             // Don't return error to user as items WERE sent.
        }

        // Auto-print if necessary
        const stationsForPrinting = new Map<string, { station: Station, items: OrderItem[] }>();
        const stationsMap = new Map(this.stations().map(s => [s.id, s]));

        if(insertedItems) {
            insertedItems.forEach(item => {
                const station = stationsMap.get(item.station_id);
                if (station && station.auto_print_orders) {
                    if (!stationsForPrinting.has(station.id)) {
                        stationsForPrinting.set(station.id, { station, items: [] });
                    }
                    stationsForPrinting.get(station.id)!.items.push(item as OrderItem);
                }
            });
        }
        
        const order = this.orders().find(o => o.id === orderId);
        if(order) {
            stationsForPrinting.forEach(({ station, items }) => {
                items.forEach(item => {
                    this.printingService.queueForAutoPrinting(order, item, station);
                });
            });
        }
    }
    return { success: true, error: null };
  }

  async deleteEmptyOrder(orderId: string): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('orders').delete().eq('id', orderId);
    return { success: !error, error };
  }

  async releaseTable(tableId: string, orderId: string): Promise<{ success: boolean; error: any }> {
    const { error: tableError } = await supabase
        .from('tables')
        .update({ status: 'LIVRE', employee_id: null })
        .eq('id', tableId);

    if (tableError) return { success: false, error: tableError };

    // Also delete the associated empty order to keep the database clean
    const { error: orderError } = await supabase.from('orders').delete().eq('id', orderId);
    if (orderError) {
        console.error("Failed to delete empty order while releasing table:", orderError);
        return { success: false, error: orderError };
    }
    
    return { success: true, error: null };
  }


  // --- POS Component Methods ---
  async updateHall(id: string, name: string): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('halls').update({ name }).eq('id', id);
    return { success: !error, error };
  }

  async addHall(name: string): Promise<{ success: boolean; error: any }> {
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase.from('halls').insert({ name, user_id: userId }).select().single();
    return { success: !error, error };
  }

  async deleteTablesByHallId(hallId: string): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('tables').delete().eq('hall_id', hallId);
    return { success: !error, error };
  }

  async deleteHall(id: string): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('halls').delete().eq('id', id);
    return { success: !error, error };
  }

  async deleteTable(id: string): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('tables').delete().eq('id', id);
    return { success: !error, error };
  }

  async upsertTables(tables: Table[]): Promise<{ success: boolean; error: any }> {
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const tablesToUpsert = tables.map(({ id, ...rest }) => {
      const isTemp = id.toString().startsWith('temp-');
      return isTemp ? { ...rest, user_id: userId } : { id, ...rest, user_id: userId };
    });

    const { error } = await supabase.from('tables').upsert(tablesToUpsert);
    return { success: !error, error };
  }

  async updateTableStatus(id: string, status: TableStatus): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('tables').update({ status }).eq('id', id);
    return { success: !error, error };
  }

  async finalizeOrderPayment(orderId: string, tableId: string, total: number, payments: PaymentInfo[], tip: number): Promise<{ success: boolean, error: any }> {
      const userId = this.currentUser()?.id;
      if (!userId) return { success: false, error: { message: 'User not authenticated' } };

      const transactionsToInsert: Omit<Transaction, 'id' | 'date'>[] = [];
      const orderIdShort = orderId.slice(0, 8);

      for (const payment of payments) {
          transactionsToInsert.push({
              description: `Receita Pedido #${orderIdShort} (${payment.method})`,
              type: 'Receita',
              amount: payment.amount,
              user_id: userId
          });
      }
      if (tip > 0) {
          const table = this.tables().find(t => t.id === tableId);
          transactionsToInsert.push({
              description: `Gorjeta Pedido #${orderIdShort}`,
              type: 'Gorjeta',
              amount: tip,
              user_id: userId,
              employee_id: table?.employee_id || null
          });
      }

      if (transactionsToInsert.length > 0) {
        const { error: transactionError } = await supabase.from('transactions').insert(transactionsToInsert);
        if (transactionError) return { success: false, error: transactionError };
      }

      const { error: orderError } = await supabase.from('orders').update({ is_completed: true, completed_at: new Date().toISOString() }).eq('id', orderId);
      if (orderError) return { success: false, error: orderError };

      const { error: tableError } = await supabase.from('tables').update({ status: 'LIVRE', employee_id: null, customer_count: 0 }).eq('id', tableId);
      if (tableError) return { success: false, error: tableError };
      
      // Optimistically update local state to avoid race conditions with real-time events.
      // This ensures the UI reflects the change immediately.
      this.orders.update(current => current.filter(o => o.id !== orderId));
      
      // Refreshing this data ensures the cashier/reports views are updated instantly.
      // The realtime event for transactions will also fire, but this makes the UI feel faster.
      this.refreshDashboardAndCashierData();

      return { success: true, error: null };
  }

    async moveOrderToTable(order: Order, sourceTable: Table, destinationTable: Table): Promise<{ success: boolean, error: any }> {
        const { error: orderError } = await supabase.from('orders').update({ table_number: destinationTable.number }).eq('id', order.id);
        if (orderError) return { success: false, error: orderError };

        const { error: sourceTableError } = await supabase.from('tables').update({ status: 'LIVRE', employee_id: null, customer_count: 0 }).eq('id', sourceTable.id);
        if (sourceTableError) return { success: false, error: sourceTableError };
        
        const { error: destTableError } = await supabase.from('tables').update({ status: 'OCUPADA', employee_id: sourceTable.employee_id, customer_count: sourceTable.customer_count }).eq('id', destinationTable.id);
        if (destTableError) return { success: false, error: destTableError };

        return { success: true, error: null };
    }

  async acknowledgeOrderItemAttention(itemId: string): Promise<{ success: boolean, error: any }> {
      const { error } = await supabase.rpc('acknowledge_attention', { item_id: itemId });
      return { success: !error, error };
  }

  async updateOrderItemStatus(itemId: string, status: OrderItemStatus): Promise<{ success: boolean, error: any }> {
      const { error } = await supabase.rpc('update_item_status', { item_id: itemId, new_status: status });
      return { success: !error, error };
  }

  // FIX: Changed method signature to use Partial<Ingredient> to align with implementation and other service methods.
  async addIngredient(ingredient: Partial<Ingredient>): Promise<{ success: boolean, error: any, data?: Ingredient }> {
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { data, error } = await supabase.from('ingredients').insert({ ...ingredient, user_id: userId }).select().single();
    if (error) return { success: false, error };
    return { success: true, error: null, data: data };
  }
  
  async updateIngredient(ingredient: Partial<Ingredient>): Promise<{ success: boolean; error: any }> {
    const { id, ...updateData } = ingredient;
    const { error } = await supabase.from('ingredients').update(updateData).eq('id', id!).select().single();
    return { success: !error, error };
  }

  async deleteIngredient(id: string): Promise<{ success: boolean, error: any }> {
      const { error } = await supabase.from('ingredients').delete().eq('id', id);
      return { success: !error, error };
  }
  
  async adjustIngredientStock(ingredientId: string, quantityChange: number, reason: string, expirationDate: string | null | undefined): Promise<{ success: boolean, error: any }> {
      const userId = this.currentUser()?.id;
      if (!userId) return { success: false, error: { message: 'User not authenticated' } };
      
      const { error } = await supabase.rpc('adjust_stock', { p_ingredient_id: ingredientId, p_quantity_change: quantityChange, p_reason: reason, p_user_id: userId, p_expiration_date: expirationDate });
      return { success: !error, error };
  }
  
  async fetchSalesDataForPeriod(startDate: Date, endDate: Date): Promise<{ success: boolean, error: any }> {
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const [completedOrders, transactions] = await Promise.all([
      supabase.from('orders').select('*, order_items(*)').eq('is_completed', true).gte('completed_at', startDate.toISOString()).lte('completed_at', endDate.toISOString()).eq('user_id', userId),
      supabase.from('transactions').select('*').gte('date', startDate.toISOString()).lte('date', endDate.toISOString()).eq('user_id', userId)
    ]);
    
    if (completedOrders.error || transactions.error) {
        console.error('Error fetching sales data:', completedOrders.error || transactions.error);
        return { success: false, error: completedOrders.error || transactions.error };
    }

    this.setCompletedOrdersWithPrices(completedOrders.data || []);
    this.transactions.set(transactions.data || []);
    return { success: true, error: null };
  }
  
    async fetchPerformanceDataForPeriod(startDate: Date, endDate: Date): Promise<{ success: boolean, error: any }> {
        const userId = this.currentUser()?.id;
        if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    
        const { data, error } = await supabase
            .from('transactions')
            .select('*')
            .eq('user_id', userId)
            .eq('type', 'Gorjeta')
            .gte('date', startDate.toISOString())
            .lte('date', endDate.toISOString());
    
        if (error) {
            console.error('Error fetching performance data:', error);
            this.performanceTipTransactions.set([]);
            return { success: false, error };
        }
    
        this.performanceTipTransactions.set(data || []);
        return { success: true, error: null };
    }

  async addStation(name: string): Promise<{ success: boolean, error: any }> {
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase.from('stations').insert({ name, auto_print_orders: false, user_id: userId }).select().single();
    return { success: !error, error };
  }

  async updateStation(id: string, name: string): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('stations').update({ name }).eq('id', id);
    return { success: !error, error };
  }

  async deleteStation(id: string): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('stations').delete().eq('id', id);
    return { success: !error, error };
  }

  async updateStationAutoPrint(id: string, auto_print_orders: boolean): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('stations').update({ auto_print_orders }).eq('id', id);
    return { success: !error, error };
  }

  async updateStationPrinter(id: string, printer_name: string | null): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('stations').update({ printer_name }).eq('id', id);
    return { success: !error, error };
  }
  
  async assignEmployeeToStation(stationId: string, employeeId: string | null): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('stations').update({ employee_id: employeeId }).eq('id', stationId);
    return { success: !error, error };
  }

    async addIngredientCategory(name: string): Promise<{ success: boolean, error: any, data?: IngredientCategory }> {
        const userId = this.currentUser()?.id;
        if (!userId) return { success: false, error: { message: 'User not authenticated' } };
        const { data, error } = await supabase.from('ingredient_categories').insert({ name, user_id: userId }).select().single();
        if (error) return { success: false, error };
        return { success: true, error: null, data: data };
    }

    async updateIngredientCategory(id: string, name: string): Promise<{ success: boolean, error: any }> {
        const { error } = await supabase.from('ingredient_categories').update({ name }).eq('id', id);
        return { success: !error, error };
    }

    async deleteIngredientCategory(id: string): Promise<{ success: boolean, error: any }> {
        const { error } = await supabase.from('ingredient_categories').delete().eq('id', id);
        return { success: !error, error };
    }

    async addSupplier(supplier: Partial<Supplier>): Promise<{ success: boolean, error: any, data?: Supplier }> {
        const userId = this.currentUser()?.id;
        if (!userId) return { success: false, error: { message: 'User not authenticated' } };
        const { data, error } = await supabase.from('suppliers').insert({ ...supplier, user_id: userId }).select().single();
        if (error) return { success: false, error };
        return { success: true, error: null, data: data };
    }

    async updateSupplier(supplier: Partial<Supplier>): Promise<{ success: boolean, error: any }> {
        const { id, ...updateData } = supplier;
        const { error } = await supabase.from('suppliers').update(updateData).eq('id', id!);
        return { success: !error, error };
    }

    async deleteSupplier(id: string): Promise<{ success: boolean, error: any }> {
        const { error } = await supabase.from('suppliers').delete().eq('id', id);
        return { success: !error, error };
    }

    async addEmployee(employee: Partial<Employee>): Promise<{ success: boolean, error: any, data?: Employee }> {
        const userId = this.currentUser()?.id;
        if (!userId) return { success: false, error: { message: 'User not authenticated' } };
        const { data, error } = await supabase.from('employees').insert({ ...employee, user_id: userId }).select().single();
        if (error) return { success: false, error };
        return { success: true, error: null, data: data };
    }

    async updateEmployee(employee: Partial<Employee>): Promise<{ success: boolean, error: any }> {
        const { id, ...updateData } = employee;
        const { error } = await supabase.from('employees').update(updateData).eq('id', id!);
        return { success: !error, error };
    }

    async deleteEmployee(id: string): Promise<{ success: boolean, error: any }> {
        const { error } = await supabase.from('employees').delete().eq('id', id);
        return { success: !error, error };
    }

    // --- Technical Sheets Methods ---
    getRecipePreparations(recipeId: string): RecipePreparation[] {
        return this.recipePreparations().filter(p => p.recipe_id === recipeId);
    }

    getRecipeIngredients(recipeId: string): RecipeIngredient[] {
        return this.recipeIngredients().filter(ri => ri.recipe_id === recipeId);
    }
    
    async addRecipe(recipe: Partial<Omit<Recipe, 'id' | 'created_at'>>): Promise<{ success: boolean, error: any, data?: Recipe }> {
        const userId = this.currentUser()?.id;
        if (!userId) return { success: false, error: { message: 'User not authenticated' } };
        const recipeData = { is_available: true, price: 0, ...recipe, user_id: userId };
        const { data, error } = await supabase.from('recipes').insert(recipeData).select().single();
        if (error) return { success: false, error };
        return { success: true, error: null, data };
    }
    
    async addRecipeCategory(name: string): Promise<{ success: boolean, error: any, data?: Category }> {
        const userId = this.currentUser()?.id;
        if (!userId) return { success: false, error: { message: 'User not authenticated' } };
        const { data, error } = await supabase.from('categories').insert({ name, user_id: userId }).select().single();
        if (error) return { success: false, error };
        return { success: true, error: null, data };
    }

    async saveTechnicalSheet(recipeId: string, recipeUpdates: Partial<Recipe>, preparationsToSave: (RecipePreparation & { recipe_ingredients: RecipeIngredient[] })[]): Promise<{ success: boolean, error: any }> {
        const userId = this.currentUser()?.id;
        if (!userId) return { success: false, error: { message: 'User not authenticated' } };

        const { error: recipeUpdateError } = await supabase.from('recipes').update(recipeUpdates).eq('id', recipeId);
        if (recipeUpdateError) return { success: false, error: recipeUpdateError };

        await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
        await supabase.from('recipe_preparations').delete().eq('recipe_id', recipeId);

        const prepInsertions = preparationsToSave.map(({ id, recipe_ingredients, station_name, ...p }) => ({ ...p, user_id: userId }));
        if (prepInsertions.length > 0) {
            const { data: insertedPreps, error: prepError } = await supabase.from('recipe_preparations').insert(prepInsertions).select();
            if (prepError) return { success: false, error: prepError };

            const tempIdToDbId = new Map<string, string>();
            preparationsToSave.forEach((p, i) => tempIdToDbId.set(p.id, insertedPreps[i].id));

            const ingredientInsertions = preparationsToSave.flatMap(p => p.recipe_ingredients.map(ri => ({
                ...ri,
                user_id: userId,
                preparation_id: tempIdToDbId.get(p.id) || ri.preparation_id,
                ingredients: undefined // remove joined data
            })));
            
            if (ingredientInsertions.length > 0) {
                const { error: ingError } = await supabase.from('recipe_ingredients').insert(ingredientInsertions);
                if (ingError) return { success: false, error: ingError };
            }
        }
        
        return { success: true, error: null };
    }

    async updateRecipeAvailability(id: string, is_available: boolean): Promise<{ success: boolean, error: any }> {
        const { error } = await supabase.from('recipes').update({ is_available }).eq('id', id);
        return { success: !error, error };
    }

    async deleteRecipe(id: string): Promise<{ success: boolean, error: any }> {
        await supabase.from('recipe_ingredients').delete().eq('recipe_id', id);
        await supabase.from('recipe_preparations').delete().eq('recipe_id', id);
        const { error } = await supabase.from('recipes').delete().eq('id', id);
        return { success: !error, error };
    }
    
    // --- Cashier Component Methods ---
    async finalizeQuickSalePayment(cart: QuickSaleCartItem[], payments: PaymentInfo[]): Promise<{ success: boolean, error: any }> {
        const userId = this.currentUser()?.id;
        if (!userId) return { success: false, error: { message: 'User not authenticated' } };

        const { data: order, error: orderError } = await supabase.from('orders').insert({
            table_number: 0,
            order_type: 'QuickSale',
            is_completed: true,
            completed_at: new Date().toISOString(),
            user_id: userId
        }).select().single();
        if (orderError) return { success: false, error: orderError };

        const prices = this.recipesById();
        const orderItems = cart.map(item => ({
            order_id: order.id,
            recipe_id: item.recipe.id,
            name: item.recipe.name,
            quantity: item.quantity,
            price: prices.get(item.recipe.id)?.price ?? 0,
            status: 'PRONTO' as OrderItemStatus,
            station_id: this.stations()[0]?.id, // Just assign to the first station, as it's a quick sale
            user_id: userId,
        }));
        
        const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
        if (itemsError) return { success: false, error: itemsError };

        const orderIdShort = order.id.slice(0, 8);
        const transactions = payments.map(p => ({
            description: `Receita Venda Rápida #${orderIdShort} (${p.method})`,
            type: 'Receita' as TransactionType,
            amount: p.amount,
            user_id: userId
        }));

        const { error: transError } = await supabase.from('transactions').insert(transactions);
        if (transError) return { success: false, error: transError };
        
        return { success: true, error: null };
    }

    async logTransaction(description: string, amount: number, type: TransactionType): Promise<{ success: boolean, error: any }> {
        const userId = this.currentUser()?.id;
        if (!userId) return { success: false, error: { message: 'User not authenticated' } };
        const { error } = await supabase.from('transactions').insert({ description, amount, type, user_id: userId }).select().single();
        return { success: !error, error };
    }

    async closeCashier(closingData: Omit<CashierClosing, 'id' | 'closed_at'>): Promise<{ success: boolean, error: any, data?: CashierClosing }> {
        const userId = this.currentUser()?.id;
        if (!userId) return { success: false, error: { message: 'User not authenticated' } };
        
        const { data, error } = await supabase.from('cashier_closings').insert({ ...closingData, user_id: userId }).select().single();
        if (error) return { success: false, error };
        
        await this.logTransaction('Abertura de Caixa', closingData.counted_cash, 'Abertura de Caixa');
        
        return { success: true, error: null, data: data };
    }
}
