import { Injectable, signal, computed, WritableSignal, inject, effect } from '@angular/core';
import { RealtimeChannel, User } from '@supabase/supabase-js';
import { Hall, Table, Category, Recipe, Order, OrderItem, Ingredient, Station, OrderItemStatus, Transaction, IngredientCategory, Supplier, RecipeIngredient, IngredientUnit, RecipePreparation, CashierClosing, TransactionType } from '../models/db.models';
import { v4 as uuidv4 } from 'uuid';
import { PrintingService } from './printing.service';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client'; // Use the shared client

export type PaymentInfo = { method: string; amount: number };

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private printingService = inject(PrintingService);
  private authService = inject(AuthService);
  
  private currentUser = this.authService.currentUser;

  isDataLoaded = signal(false);

  halls = signal<Hall[]>([]);
  tables = signal<Table[]>([]);
  stations = signal<Station[]>([]);
  categories = signal<Category[]>([]);
  recipes = signal<Recipe[]>([]);
  orders = signal<Order[]>([]);
  
  // Inventory & Suppliers
  ingredients = signal<Ingredient[]>([]);
  ingredientCategories = signal<IngredientCategory[]>([]);
  suppliers = signal<Supplier[]>([]);
  recipeIngredients = signal<RecipeIngredient[]>([]);
  recipePreparations = signal<RecipePreparation[]>([]);

  // Signals for reports & cashier
  completedOrders = signal<Order[]>([]);
  transactions = signal<Transaction[]>([]);
  cashierClosings = signal<CashierClosing[]>([]);
  
  // Signals for dashboard
  dashboardTransactions = signal<Transaction[]>([]);
  dashboardCompletedOrders = signal<Order[]>([]);

  recipesById = computed(() => new Map(this.recipes().map(r => [r.id, r])));

  openOrders = computed(() => this.orders().filter(o => !o.is_completed));
  
  lastCashierClosing = computed(() => {
    const closings = this.cashierClosings();
    return closings.length > 0 ? closings[0] : null;
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
            this.listenForChanges(user.id);
        } else {
            this.clearAllData();
            supabase.removeAllChannels(); // Clean up all realtime subscriptions on logout
        }
    });
  }

  private clearAllData() {
      this.halls.set([]);
      this.tables.set([]);
      this.stations.set([]);
      this.categories.set([]);
      this.recipes.set([]);
      this.orders.set([]);
      this.ingredients.set([]);
      this.ingredientCategories.set([]);
      this.suppliers.set([]);
      this.recipeIngredients.set([]);
      this.recipePreparations.set([]);
      this.completedOrders.set([]);
      this.transactions.set([]);
      this.cashierClosings.set([]);
      this.dashboardTransactions.set([]);
      this.dashboardCompletedOrders.set([]);
      this.isDataLoaded.set(false);
  }

  private async loadInitialData(userId: string) {
    this.isDataLoaded.set(false);
    try {
      await this.fetchRecipes(userId); 
    
      const today = new Date();
      const isoEndDate = today.toISOString();
      today.setHours(0, 0, 0, 0);
      const isoStartDate = today.toISOString();
      
      const lastClosing = this.lastCashierClosing();
      const cashierStartDate = lastClosing ? new Date(lastClosing.closed_at) : new Date(isoStartDate);

      const [
          halls, tables, stations, categories, openOrders, 
          ingredients, ingredientCategories, suppliers, 
          recipeIngredients, recipePreparations, cashierClosings,
          initialCompletedOrders, initialTransactions
      ] = await Promise.all([
        supabase.from('halls').select('*').eq('user_id', userId),
        supabase.from('tables').select('*').eq('user_id', userId),
        supabase.from('stations').select('*').eq('user_id', userId),
        supabase.from('categories').select('*').eq('user_id', userId),
        supabase.from('orders').select('*, order_items(*)').eq('is_completed', false).eq('user_id', userId),
        supabase.from('ingredients').select('*, ingredient_categories(name), suppliers(name)').eq('user_id', userId),
        supabase.from('ingredient_categories').select('*').eq('user_id', userId),
        supabase.from('suppliers').select('*').eq('user_id', userId),
        supabase.from('recipe_ingredients').select('*, ingredients(name, unit, cost)').eq('user_id', userId),
        supabase.from('recipe_preparations').select('*').eq('user_id', userId),
        supabase.from('cashier_closings').select('*').eq('user_id', userId),
        supabase.from('orders').select('*, order_items(*)').eq('is_completed', true).gte('completed_at', cashierStartDate.toISOString()).lte('completed_at', isoEndDate).eq('user_id', userId),
        supabase.from('transactions').select('*').gte('date', cashierStartDate.toISOString()).lte('date', isoEndDate).eq('user_id', userId)
      ]);

      if (halls.error) console.error('Error fetching halls:', halls.error); this.halls.set(halls.data || []);
      if (tables.error) console.error('Error fetching tables:', tables.error); this.tables.set(tables.data || []);
      if (stations.error) console.error('Error fetching stations:', stations.error); this.stations.set(stations.data || []);
      if (categories.error) console.error('Error fetching categories:', categories.error); this.categories.set(categories.data || []);
      if (openOrders.error) console.error('Error fetching orders:', openOrders.error); this.setOrdersWithPrices(openOrders.data || []);
      if (ingredients.error) console.error('Error fetching ingredients:', ingredients.error); this.ingredients.set((ingredients.data as Ingredient[]) || []);
      if (ingredientCategories.error) console.error('Error fetching ingredient categories:', ingredientCategories.error); this.ingredientCategories.set(ingredientCategories.data || []);
      if (suppliers.error) console.error('Error fetching suppliers:', suppliers.error); this.suppliers.set(suppliers.data || []);
      if (recipeIngredients.error) console.error('Error fetching recipe ingredients:', recipeIngredients.error); this.recipeIngredients.set((recipeIngredients.data as RecipeIngredient[]) || []);
      if (recipePreparations.error) console.error('Error fetching recipe preparations:', recipePreparations.error); this.recipePreparations.set(recipePreparations.data || []);
      
      if (cashierClosings.error) {
          console.error('Error fetching cashier closings:', cashierClosings.error);
          this.cashierClosings.set([]);
      } else {
          const sortedData = (cashierClosings.data || []).sort((a: CashierClosing, b: CashierClosing) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime());
          this.cashierClosings.set(sortedData);
      }

      if (initialCompletedOrders.error) console.error('Error fetching completed orders:', initialCompletedOrders.error);
      const ordersToday = (initialCompletedOrders.data || []).filter(o => new Date(o.completed_at || 0) >= today);
      this.setCompletedOrdersWithPrices(initialCompletedOrders.data || []);
      this.setDashboardCompletedOrdersWithPrices(ordersToday);

      if (initialTransactions.error) console.error('Error fetching transactions:', initialTransactions.error);
      const transactionsToday = (initialTransactions.data || []).filter(t => new Date(t.date) >= today);
      this.transactions.set(initialTransactions.data || []);
      this.dashboardTransactions.set(transactionsToday.filter(t => t.type === 'Receita'));
      
      this.isDataLoaded.set(true);
    } catch (error) {
        console.error('Catastrophic error during initial data load:', error);
        this.clearAllData();
    }
  }

  private async fetchRecipes(userId: string) {
    try {
      const { data, error } = await supabase.from('recipes').select('*').eq('user_id', userId);
      if (error) {
        console.error('CRITICAL: Error fetching recipes, app may not function correctly.', error);
        this.recipes.set([]);
        throw new Error('Failed to fetch recipes'); // Throw to be caught by caller
      }
      if (data) this.recipes.set(data);
    } catch(error) {
        console.error("Error in fetchRecipes:", error);
        this.recipes.set([]);
    }
  }

  private setOrdersWithPrices(orders: any[]) {
      const recipesMap = this.recipesById();
      const ordersWithPrices: Order[] = orders.map(o => ({
          ...o,
          order_items: o.order_items.map((item: any) => ({
              ...item,
              price: item.price ?? recipesMap.get(item.recipe_id)?.price ?? 0
          }))
      }));
      this.orders.set(ordersWithPrices);
  }

  private setCompletedOrdersWithPrices(orders: any[]) {
    const recipesMap = this.recipesById();
    const ordersWithPrices: Order[] = orders.map(o => ({
        ...o,
        order_items: o.order_items.map((item: any) => ({
            ...item,
            price: item.price ?? recipesMap.get(item.recipe_id)?.price ?? 0
        }))
    }));
    this.completedOrders.set(ordersWithPrices);
  }
   private setDashboardCompletedOrdersWithPrices(orders: any[]) {
    const recipesMap = this.recipesById();
    const ordersWithPrices: Order[] = orders.map(o => ({
        ...o,
        order_items: o.order_items.map((item: any) => ({
            ...item,
            price: item.price ?? recipesMap.get(item.recipe_id)?.price ?? 0
        }))
    }));
    this.dashboardCompletedOrders.set(ordersWithPrices);
  }
  
  private listenForChanges(userId: string) {
    // A channel for all tables specific to the user
    supabase.channel(`user-db-changes-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'halls', filter: `user_id=eq.${userId}` }, (p) => this.handleGenericChange(this.halls, p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables', filter: `user_id=eq.${userId}` }, (p) => this.handleGenericChange(this.tables, p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stations', filter: `user_id=eq.${userId}` }, (p) => this.handleGenericChange(this.stations, p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes', filter: `user_id=eq.${userId}` }, (p) => this.handleGenericChange(this.recipes, p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients', filter: `user_id=eq.${userId}` }, (payload) => this.handleIngredientChange(payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredient_categories', filter: `user_id=eq.${userId}` }, (p) => this.handleGenericChange(this.ingredientCategories, p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers', filter: `user_id=eq.${userId}` }, (p) => this.handleGenericChange(this.suppliers, p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipe_ingredients', filter: `user_id=eq.${userId}` }, (p) => this.handleRecipeIngredientChange(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipe_preparations', filter: `user_id=eq.${userId}` }, (p) => this.handleGenericChange(this.recipePreparations, p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${userId}` }, (p) => this.handleOrderChange(p as any))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items', filter: `user_id=eq.${userId}` }, (p) => this.handleOrderItemChange(p as any))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions', filter: `user_id=eq.${userId}` }, () => {
          this.fetchDashboardData();
          const lastClosing = this.lastCashierClosing()?.closed_at;
          const startDate = lastClosing ? new Date(lastClosing) : new Date();
          if (!lastClosing) startDate.setHours(0,0,0,0);
          this.fetchSalesDataForPeriod(startDate, new Date());
      }).subscribe();
  }

  private handleGenericChange<T extends { id: string }>(dataSignal: WritableSignal<T[]>, payload: any) {
    if (payload.eventType === 'INSERT') {
      dataSignal.update(items => [...items, payload.new]);
    } else if (payload.eventType === 'UPDATE') {
      dataSignal.update(items => items.map(i => i.id === payload.new.id ? payload.new : i));
    } else if (payload.eventType === 'DELETE') {
      dataSignal.update(items => items.filter(i => i.id !== payload.old.id));
    }
  }

  private async handleIngredientChange(payload: any) {
    const userId = this.currentUser()?.id;
    if (!userId) return;

    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      const { data } = await supabase.from('ingredients').select('*, ingredient_categories(name), suppliers(name)').eq('id', payload.new.id).eq('user_id', userId).single();
      if (data) {
        if (payload.eventType === 'INSERT') this.ingredients.update(i => [...i, data as Ingredient]);
        else this.ingredients.update(i => i.map(item => item.id === data.id ? data as Ingredient : item));
      }
    } else if (payload.eventType === 'DELETE') {
      this.ingredients.update(i => i.filter(item => item.id !== payload.old.id));
    }
  }
  
  private async handleRecipeIngredientChange(payload: any) {
    const userId = this.currentUser()?.id;
    if (!userId) return;
    
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      const { data } = await supabase.from('recipe_ingredients').select('*, ingredients(name, unit, cost)').eq('recipe_id', payload.new.recipe_id).eq('ingredient_id', payload.new.ingredient_id).eq('user_id', userId).single();
      if (data) {
        if (payload.eventType === 'INSERT') {
          this.recipeIngredients.update(ri => [...ri, data as RecipeIngredient]);
        } else {
           this.recipeIngredients.update(ri => ri.map(item => (item.recipe_id === data.recipe_id && item.ingredient_id === data.ingredient_id) ? data as RecipeIngredient : item));
        }
      }
    } else if (payload.eventType === 'DELETE') {
        const old = payload.old;
        this.recipeIngredients.update(ri => ri.filter(item => !(item.recipe_id === old.recipe_id && item.ingredient_id === old.ingredient_id)));
    }
  }
  
  private handleOrderChange(payload: { eventType: string, new: Order, old: { id: string } }) {
     if (payload.eventType === 'INSERT') {
       const newOrder = { ...payload.new, order_items: [] };
       this.orders.update(orders => [...orders, newOrder]);
     } else if (payload.eventType === 'UPDATE') {
       if (payload.new.is_completed) {
         this.orders.update(orders => orders.filter(o => o.id !== payload.new.id));
       } else {
         this.orders.update(orders => orders.map(o => o.id === payload.new.id ? { ...o, ...payload.new } : o));
       }
     } else if (payload.eventType === 'DELETE') {
       this.orders.update(orders => orders.filter(o => o.id !== payload.old.id));
     }
  }

  private handleOrderItemChange(payload: { eventType: string, new: OrderItem, old: { id: string, order_id?: string } }) {
      if (payload.eventType === 'INSERT') {
          const newItem = payload.new;
          this.orders.update(orders => orders.map(o => 
              o.id === newItem.order_id 
              ? { ...o, order_items: [...o.order_items, newItem] } 
              : o
          ));
          // Auto-print logic
          const station = this.stations().find(s => s.id === newItem.station_id);
          if (station?.auto_print_orders) {
              const order = this.openOrders().find(o => o.id === newItem.order_id);
              if(order) {
                  this.printingService.queueForAutoPrinting(order, newItem, station);
              }
          }
      } else if (payload.eventType === 'UPDATE') {
          const updatedItem = payload.new;
          this.orders.update(orders => orders.map(o => 
              o.id === updatedItem.order_id 
              ? { ...o, order_items: o.order_items.map(i => i.id === updatedItem.id ? updatedItem : i) } 
              : o
          ));
      } else if (payload.eventType === 'DELETE') {
          this.orders.update(orders => {
            return orders.map(o => ({
                ...o,
                order_items: o.order_items.filter(i => i.id !== payload.old.id)
            }));
          });
      }
  }

  getOrderByTableNumber(tableNumber: number): Order | undefined {
    return this.openOrders().find(o => o.table_number === tableNumber);
  }

  async createOrderForTable(table: Table): Promise<{ success: boolean; error: any; data?: Order }> {
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const { data: newOrderData, error: orderError } = await supabase.from('orders').insert({ table_number: table.number, order_type: 'Dine-in', user_id: userId }).select().single();
    if (orderError || !newOrderData) { return { success: false, error: { ...orderError, message: `Falha ao criar pedido na tabela 'orders'. ${orderError?.message ?? ''}` } }; }
    const { error: tableError } = await supabase.from('tables').update({ status: 'OCUPADA' }).eq('id', table.id).eq('user_id', userId);
    if (tableError) {
      await supabase.from('orders').delete().eq('id', newOrderData.id);
      return { success: false, error: { ...tableError, message: `Falha ao atualizar status na tabela 'tables'. ${tableError.message}` } };
    }
    return { success: true, error: null, data: { ...newOrderData, order_items: [] } };
  }

  async addItemsToOrder(orderId: string, items: { recipe: Recipe; quantity: number; notes?: string }[]): Promise<{ success: boolean; error: any }> {
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

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
        const recipePreps = prepsByRecipeId.get(item.recipe.id);
        const status_timestamps = { 'PENDENTE': new Date().toISOString() };
        if (recipePreps && recipePreps.length > 0) {
            const groupId = uuidv4();
            recipePreps.forEach((prep, index) => {
                allItemsToInsert.push({
                    order_id: orderId,
                    recipe_id: item.recipe.id,
                    name: `${item.recipe.name} (${prep.name})`,
                    quantity: item.quantity,
                    notes: item.notes,
                    status: 'PENDENTE',
                    station_id: prep.station_id,
                    price: index === 0 ? item.recipe.price : 0,
                    group_id: groupId,
                    status_timestamps,
                    user_id: userId
                });
            });
        } else {
            const fallbackStationId = this.stations()[0]?.id;
            if (fallbackStationId) {
                 allItemsToInsert.push({
                    order_id: orderId,
                    recipe_id: item.recipe.id,
                    name: item.recipe.name,
                    quantity: item.quantity,
                    notes: item.notes,
                    status: 'PENDENTE',
                    station_id: fallbackStationId,
                    price: item.recipe.price,
                    group_id: null,
                    status_timestamps,
                    user_id: userId
                });
            }
        }
    }
    if (allItemsToInsert.length === 0) return { success: true, error: null };
    const { error } = await supabase.from('order_items').insert(allItemsToInsert);
    return { success: !error, error };
  }
  
  async updateOrderItemStatus(itemId: string, newStatus: OrderItemStatus) {
    const userId = this.currentUser()?.id;
    if (!userId) return;

    const { data: currentItem, error: fetchError } = await supabase
      .from('order_items')
      .select('status_timestamps')
      .eq('id', itemId).eq('user_id', userId)
      .single();
    
    if (fetchError) {
      console.error("KDS: Falha ao buscar item do pedido para atualizar status.", fetchError);
      await supabase.from('order_items').update({ status: newStatus }).eq('id', itemId).eq('user_id', userId);
      return;
    }

    const newTimestamps = { ...(currentItem.status_timestamps || {}), [newStatus]: new Date().toISOString() };

    await supabase
      .from('order_items')
      .update({ status: newStatus, status_timestamps: newTimestamps })
      .eq('id', itemId).eq('user_id', userId);
  }

  async upsertTables(tables: Table[]): Promise<{ success: boolean; error: any }> {
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const tablesWithUser = tables.map(t => ({...t, user_id: userId}));
    const newTables = tablesWithUser.filter(t => t.id.startsWith('temp-')).map(({ ...t }) => { delete (t as any).id; return t; });
    const existingTables = tablesWithUser.filter(t => !t.id.startsWith('temp-'));

    if (newTables.length > 0) {
        const { error } = await supabase.from('tables').insert(newTables);
        if (error) return { success: false, error };
    }
    if (existingTables.length > 0) {
        const { error } = await supabase.from('tables').upsert(existingTables);
        if (error) return { success: false, error };
    }
    return { success: true, error: null };
  }

  async deleteTable(tableId: string): Promise<{ success: boolean; error: any }> {
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    if (tableId.startsWith('temp-')) return { success: true, error: null };

    const { error } = await supabase.from('tables').delete().eq('id', tableId).eq('user_id', userId);
    return { success: !error, error };
  }
  
  async deleteTablesByHallId(hallId: string): Promise<{ success: boolean; error: any }> {
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const { error } = await supabase.from('tables').delete().eq('hall_id', hallId).eq('user_id', userId);
    if (!error) this.tables.update(currentTables => currentTables.filter(t => t.hall_id !== hallId));
    return { success: !error, error };
  }

  async moveOrderToTable(order: Order, sourceTable: Table, destinationTable: Table) {
      const userId = this.currentUser()?.id;
      if (!userId) return;
      
      const { error: orderError } = await supabase.from('orders').update({ table_number: destinationTable.number }).eq('id', order.id).eq('user_id', userId);
      if (orderError) return;
      await supabase.from('tables').update({ status: 'LIVRE' }).eq('id', sourceTable.id).eq('user_id', userId);
      await supabase.from('tables').update({ status: 'OCUPADA' }).eq('id', destinationTable.id).eq('user_id', userId);
  }

  // --- Hall Management ---
  async addHall(name: string): Promise<{ success: boolean; error: any }> { 
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase.from('halls').insert({ name, user_id: userId }); 
    return { success: !error, error }; 
  }
  async updateHall(id: string, name: string): Promise<{ success: boolean; error: any }> { 
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase.from('halls').update({ name }).eq('id', id).eq('user_id', userId); 
    return { success: !error, error }; 
  }
  async deleteHall(id: string): Promise<{ success: boolean; error: any }> { 
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase.from('halls').delete().eq('id', id).eq('user_id', userId); 
    if (!error) this.halls.update(h => h.filter(hall => hall.id !== id)); 
    return { success: !error, error }; 
  }

  // --- Station Management ---
  async addStation(name: string): Promise<{ success: boolean; error: any }> {
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase.from('stations').insert({ name, user_id: userId });
    return { success: !error, error };
  }
  async updateStation(id: string, name: string): Promise<{ success: boolean; error: any }> {
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase.from('stations').update({ name }).eq('id', id).eq('user_id', userId);
    return { success: !error, error };
  }
  async updateStationAutoPrint(stationId: string, auto_print: boolean): Promise<{ success: boolean; error: any }> {
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase.from('stations').update({ auto_print_orders: auto_print }).eq('id', stationId).eq('user_id', userId);
    return { success: !error, error };
  }
  async updateStationPrinter(stationId: string, printerName: string | null): Promise<{ success: boolean; error: any }> {
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase.from('stations').update({ printer_name: printerName }).eq('id', stationId).eq('user_id', userId);
    return { success: !error, error };
  }
  async deleteStation(id: string): Promise<{ success: boolean; error: any }> {
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase.from('stations').delete().eq('id', id).eq('user_id', userId);
    return { success: !error, error };
  }

  // --- Ingredient & Category Management ---
  async addIngredient(ingredientData: Omit<Ingredient, 'id' | 'created_at' | 'user_id'>): Promise<{ success: boolean; error: any; data: Ingredient | null }> { 
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' }, data: null };
    const { data, error } = await supabase.from('ingredients').insert({...ingredientData, user_id: userId}).select().single(); 
    return { success: !error, error, data }; 
  }
  async updateIngredient(ingredient: Partial<Ingredient> & { id: string }): Promise<{ success: boolean; error: any }> { 
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { id, ...updateData } = ingredient; 
    const { error } = await supabase.from('ingredients').update(updateData).eq('id', id).eq('user_id', userId); 
    return { success: !error, error }; 
  }
  async deleteIngredient(id: string): Promise<{ success: boolean; error: any }> { 
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase.from('ingredients').delete().eq('id', id).eq('user_id', userId); 
    return { success: !error, error }; 
  }
  async addIngredientCategory(name: string): Promise<{ success: boolean; error: any }> { 
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase.from('ingredient_categories').insert({ name, user_id: userId }); 
    return { success: !error, error }; 
  }
  async updateIngredientCategory(id: string, name: string): Promise<{ success: boolean; error: any }> { 
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase.from('ingredient_categories').update({ name }).eq('id', id).eq('user_id', userId); 
    return { success: !error, error }; 
  }
  async deleteIngredientCategory(id: string): Promise<{ success: boolean; error: any }> { 
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase.from('ingredient_categories').delete().eq('id', id).eq('user_id', userId); 
    return { success: !error, error }; 
  }
  
  // --- Supplier Management ---
  async addSupplier(supplierData: Omit<Supplier, 'id' | 'created_at' | 'user_id'>): Promise<{ success: boolean; error: any }> { 
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase.from('suppliers').insert({...supplierData, user_id: userId}); 
    return { success: !error, error }; 
  }
  async updateSupplier(supplier: Partial<Supplier> & { id: string }): Promise<{ success: boolean; error: any }> { 
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { id, ...updateData } = supplier; 
    const { error } = await supabase.from('suppliers').update(updateData).eq('id', id).eq('user_id', userId); 
    return { success: !error, error }; 
  }
  async deleteSupplier(id: string): Promise<{ success: boolean; error: any }> { 
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase.from('suppliers').delete().eq('id', id).eq('user_id', userId); 
    return { success: !error, error }; 
  }

  // --- Inventory Movement ---
  async adjustIngredientStock(ingredientId: string, quantityChange: number, reason: string): Promise<{ success: boolean; error: any }> {
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    
    // RPCs need to be secured with user_id inside the function definition in Supabase SQL Editor
    const { error } = await supabase.rpc('adjust_stock', {
        p_ingredient_id: ingredientId,
        p_quantity_change: quantityChange,
        p_reason: reason
    });
    return { success: !error, error };
  }

  // --- Recipe & Technical Sheet Management ---
  async addRecipe(recipeData: Omit<Recipe, 'id' | 'created_at' | 'is_available' | 'price' | 'hasStock' | 'user_id'>): Promise<{ success: boolean; error: any, data: Recipe | null }> {
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' }, data: null };

    const { data, error } = await supabase
        .from('recipes')
        .insert({ ...recipeData, price: 0, is_available: false, user_id: userId })
        .select()
        .single();
    return { success: !error, error, data };
  }

  async updateRecipeAvailability(recipeId: string, is_available: boolean): Promise<{ success: boolean; error: any }> {
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase.from('recipes').update({ is_available }).eq('id', recipeId).eq('user_id', userId);
    return { success: !error, error };
  }

  async updateRecipe(recipeId: string, updates: { operational_cost?: number; price?: number, prep_time_in_minutes?: number }): Promise<{ success: boolean; error: any }> {
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase.from('recipes').update(updates).eq('id', recipeId).eq('user_id', userId);
    return { success: !error, error };
  }

  async saveTechnicalSheet(
      recipeId: string,
      recipeUpdates: { operational_cost?: number; price?: number; prep_time_in_minutes?: number },
      preparationsFromClient: (Partial<RecipePreparation> & { recipe_ingredients: Partial<RecipeIngredient>[] })[]
  ): Promise<{ success: boolean; error: any }> {
      const userId = this.currentUser()?.id;
      if (!userId) return { success: false, error: { message: 'User not authenticated' } };

      const { error: recipeError } = await this.updateRecipe(recipeId, recipeUpdates);
      if (recipeError) return { success: false, error: recipeError };

      const finalPrepIds: string[] = [];
      const tempIdToDbIdMap = new Map<string, string>();

      for (const clientPrep of preparationsFromClient) {
          const prepData = {
              recipe_id: recipeId,
              name: clientPrep.name,
              station_id: clientPrep.station_id,
              prep_instructions: clientPrep.prep_instructions,
              display_order: clientPrep.display_order,
              user_id: userId
          };

          if (clientPrep.id && clientPrep.id.startsWith('temp-')) {
              const { data: inserted, error } = await supabase.from('recipe_preparations').insert(prepData).select('id').single();
              if (error) return { success: false, error };
              finalPrepIds.push(inserted.id);
              tempIdToDbIdMap.set(clientPrep.id, inserted.id);
          } else if (clientPrep.id) {
              const { error } = await supabase.from('recipe_preparations').update(prepData).eq('id', clientPrep.id).eq('user_id', userId);
              if (error) return { success: false, error };
              finalPrepIds.push(clientPrep.id);
          }
      }

      const { data: currentDbPreps, error: fetchError } = await supabase.from('recipe_preparations').select('id').eq('recipe_id', recipeId).eq('user_id', userId);
      if (fetchError) return { success: false, error: fetchError };

      const dbPrepIdsToDelete = currentDbPreps.filter(p => !finalPrepIds.includes(p.id)).map(p => p.id);
      if (dbPrepIdsToDelete.length > 0) {
          const { error: deleteError } = await supabase.from('recipe_preparations').delete().in('id', dbPrepIdsToDelete).eq('user_id', userId);
          if (deleteError) return { success: false, error: deleteError };
      }

      const { error: deleteIngredientsError } = await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId).eq('user_id', userId);
      if (deleteIngredientsError) return { success: false, error: deleteIngredientsError };

      const allIngredientsToInsert = preparationsFromClient.flatMap(clientPrep => {
          const dbPrepId = clientPrep.id?.startsWith('temp-') ? tempIdToDbIdMap.get(clientPrep.id) : clientPrep.id;
          if (!dbPrepId) return [];

          return clientPrep.recipe_ingredients
              .filter(ri => ri.quantity && ri.quantity > 0)
              .map(ri => ({
                  recipe_id: recipeId,
                  preparation_id: dbPrepId,
                  ingredient_id: ri.ingredient_id,
                  quantity: ri.quantity,
                  user_id: userId
              }));
      });

      if (allIngredientsToInsert.length > 0) {
          const { error: insertIngredientsError } = await supabase.from('recipe_ingredients').insert(allIngredientsToInsert);
          if (insertIngredientsError) return { success: false, error: insertIngredientsError };
      }

      return { success: true, error: null };
  }

  getRecipeIngredients(recipeId: string): RecipeIngredient[] { return this.recipeIngredients().filter(ri => ri.recipe_id === recipeId); }
  getRecipePreparations(recipeId: string): RecipePreparation[] { return this.recipePreparations().filter(rp => rp.recipe_id === recipeId); }
 
  // --- Checkout and Payment ---
  async updateTableStatus(tableId: string, status: Table['status']): Promise<{ success: boolean; error: any }> { 
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase.from('tables').update({ status }).eq('id', tableId).eq('user_id', userId); 
    return { success: !error, error }; 
  }

  async fetchDashboardData() {
    const userId = this.currentUser()?.id;
    if (!userId) return;

    try {
        const today = new Date(); today.setHours(0, 0, 0, 0); const isoStartDate = today.toISOString();
        const [transactions, orders] = await Promise.all([
            supabase.from('transactions').select('*').eq('type', 'Receita').gte('date', isoStartDate).eq('user_id', userId),
            supabase.from('orders').select('*, order_items(*)').eq('is_completed', true).gte('completed_at', isoStartDate).eq('user_id', userId)
        ]);
        
        if (transactions.error) console.error('Dashboard Error fetching transactions:', transactions.error);
        this.dashboardTransactions.set(transactions.data || []);

        if (orders.error) console.error('Dashboard Error fetching orders:', orders.error);
        this.setDashboardCompletedOrdersWithPrices(orders.data || []);

    } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
        this.dashboardTransactions.set([]);
        this.dashboardCompletedOrders.set([]);
    }
  }

  async fetchSalesDataForPeriod(startDate: Date, endDate: Date) {
    const userId = this.currentUser()?.id;
    if (!userId) return;

    try {
        const isoStartDate = startDate.toISOString(), isoEndDate = endDate.toISOString();
        const [orders, transactions] = await Promise.all([
            supabase.from('orders').select('*, order_items(*)').eq('is_completed', true).gte('completed_at', isoStartDate).lte('completed_at', isoEndDate).eq('user_id', userId),
            supabase.from('transactions').select('*').gte('date', isoStartDate).lte('date', isoEndDate).eq('user_id', userId)
        ]);
        
        if (orders.error) console.error('Reports Error fetching orders:', orders.error);
        this.setCompletedOrdersWithPrices(orders.data || []);

        if (transactions.error) console.error('Reports Error fetching transactions:', transactions.error);
        this.transactions.set(transactions.data || []);

    } catch(error) {
        console.error('Failed to fetch sales data for period:', error);
        this.completedOrders.set([]);
        this.transactions.set([]);
    }
  }

  async finalizeOrderPayment(orderId: string, tableId: string, totalAmount: number, payments: PaymentInfo[], tip: number): Promise<{ success: boolean; error: any }> {
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const { error: orderError } = await supabase.from('orders').update({ is_completed: true, completed_at: new Date().toISOString() }).eq('id', orderId).eq('user_id', userId);
    if (orderError) return { success: false, error: { ...orderError, message: `Falha ao atualizar pedido. ${orderError.message}` } };
    
    const { error: tableError } = await supabase.from('tables').update({ status: 'LIVRE' }).eq('id', tableId).eq('user_id', userId);
    if (tableError) {
      await supabase.from('orders').update({ is_completed: false, completed_at: null }).eq('id', orderId).eq('user_id', userId);
      return { success: false, error: { ...tableError, message: `Falha ao atualizar mesa. ${tableError.message}` } };
    }
    
    const { error: stockError } = await supabase.rpc('decrement_stock_for_order', { p_order_id: orderId });
    if (stockError) console.error('CRITICAL: Payment processed but failed to decrement stock:', JSON.stringify(stockError, null, 2));

    const transactionsToInsert: { description: string, type: TransactionType, amount: number, date: string, user_id: string }[] = payments.map(p => ({
      description: `Venda Pedido #${orderId.slice(0, 8)} (${p.method})`,
      type: 'Receita',
      amount: p.amount,
      date: new Date().toISOString(),
      user_id: userId
    }));

    if (tip > 0) {
        transactionsToInsert.push({
          description: `Gorjeta Pedido #${orderId.slice(0, 8)}`,
          type: 'Gorjeta',
          amount: tip,
          date: new Date().toISOString(),
          user_id: userId
        });
    }

    if (transactionsToInsert.length > 0) {
      const { error: transactionError } = await supabase.from('transactions').insert(transactionsToInsert);
      if (transactionError) console.error('CRITICAL: Payment processed but failed to create transaction records:', JSON.stringify(transactionError, null, 2));
    }
    
    return { success: true, error: null };
  }

  async finalizeQuickSalePayment(cart: { recipe: Recipe; quantity: number }[], payments: PaymentInfo[]): Promise<{ success: boolean; error: any }> {
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

    const orderItems = cart.map(item => ({
        order_id: order.id,
        recipe_id: item.recipe.id,
        name: item.recipe.name,
        quantity: item.quantity,
        price: item.recipe.price,
        status: 'PRONTO' as OrderItemStatus,
        station_id: this.stations()[0]?.id,
        user_id: userId
    }));
    
    const validOrderItems = orderItems.filter(item => !!item.station_id);

    if (validOrderItems.length > 0) {
      const { error: itemsError } = await supabase.from('order_items').insert(validOrderItems);
      if (itemsError) {
        await supabase.from('orders').delete().eq('id', order.id);
        return { success: false, error: itemsError };
      }
    }

    const { error: stockError } = await supabase.rpc('decrement_stock_for_order', { p_order_id: order.id });
    if (stockError) console.error('CRITICAL: Quick sale processed but failed to decrement stock:', stockError);

    const transactionsToInsert = payments.map(p => ({
        description: `Venda Balcão - Pedido #${order.id.slice(0, 8)} (${p.method})`,
        type: 'Receita' as const,
        amount: p.amount,
        date: new Date().toISOString(),
        user_id: userId
    }));

    if (transactionsToInsert.length > 0) {
        const { error: transactionError } = await supabase.from('transactions').insert(transactionsToInsert);
        if (transactionError) console.error('CRITICAL: Quick sale processed but failed to create transactions:', transactionError);
    }
    
    return { success: true, error: null };
  }
  
  async logTransaction(description: string, amount: number, type: TransactionType): Promise<{ success: boolean; error: any }> {
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    
    if (!description || !amount || amount <= 0) {
        return { success: false, error: { message: 'Descrição e valor são obrigatórios.' } };
    }
    const { error } = await supabase.from('transactions').insert({ description, amount, type, date: new Date().toISOString(), user_id: userId });
    return { success: !error, error };
  }

  async closeCashier(closingData: Omit<CashierClosing, 'id' | 'closed_at' | 'user_id'>): Promise<{ success: boolean; error: any, data: CashierClosing | null }> {
    const userId = this.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' }, data: null };

    const { data, error } = await supabase
        .from('cashier_closings')
        .insert({ ...closingData, closed_at: new Date().toISOString(), user_id: userId })
        .select()
        .single();
    
    if (error) {
        return { success: false, error, data: null };
    }

    if (data.counted_cash > 0) {
        await this.logTransaction('Saldo de Abertura', data.counted_cash, 'Abertura de Caixa');
    }

    this.cashierClosings.update(closings => [data, ...closings]);

    return { success: true, error: null, data };
  }
}