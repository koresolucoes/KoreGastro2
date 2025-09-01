import { Injectable, signal, computed } from '@angular/core';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { environment } from '../config/environment';
import { Hall, Table, Category, Recipe, Order, OrderItem, Ingredient, Station, OrderItemStatus } from '../models/db.models';

export type PaymentInfo = { method: string; amount: number };

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private supabase: SupabaseClient;

  halls = signal<Hall[]>([]);
  tables = signal<Table[]>([]);
  stations = signal<Station[]>([]);
  categories = signal<Category[]>([]);
  recipes = signal<Recipe[]>([]);
  orders = signal<Order[]>([]);
  ingredients = signal<Ingredient[]>([]);
  
  recipesById = computed(() => new Map(this.recipes().map(r => [r.id, r])));

  openOrders = computed(() => this.orders().filter(o => !o.is_completed));

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseAnonKey);
    this.loadInitialData();
    this.listenForChanges();
  }

  private async loadInitialData() {
    await this.fetchRecipes(); // Must be fetched first for price lookups
    
    const [halls, tables, stations, categories, orders, ingredients] = await Promise.all([
      this.supabase.from('halls').select('*'),
      this.supabase.from('tables').select('*'),
      this.supabase.from('stations').select('*'),
      this.supabase.from('categories').select('*'),
      this.supabase.from('orders').select('*, order_items(*)').eq('is_completed', false),
      this.supabase.from('ingredients').select('*'),
    ]);

    if (halls.data) this.halls.set(halls.data);
    if (tables.data) this.tables.set(tables.data);
    if (stations.data) this.stations.set(stations.data);
    if (categories.data) this.categories.set(categories.data);
    if (ingredients.data) this.ingredients.set(ingredients.data);
    if (orders.data) this.setOrdersWithPrices(orders.data);
  }

  private async fetchRecipes() {
    const { data } = await this.supabase.from('recipes').select('*');
    if (data) this.recipes.set(data);
  }

  private setOrdersWithPrices(orders: any[]) {
      const recipesMap = this.recipesById();
      const ordersWithPrices: Order[] = orders.map(o => ({
          ...o,
          order_items: o.order_items.map((item: any) => ({
              ...item,
              price: recipesMap.get(item.recipe_id)?.price ?? 0
          }))
      }));
      this.orders.set(ordersWithPrices);
  }
  
  private listenForChanges() {
    this.supabase.channel('public:halls')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'halls' },
        (payload) => this.handleHallChange(payload)
      ).subscribe();

    this.supabase.channel('public:tables')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' },
        (payload) => this.handleTableChange(payload)
      ).subscribe();
      
    this.supabase.channel('public:orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' },
        (payload) => this.handleOrderChange(payload as any)
      ).subscribe();

    this.supabase.channel('public:order_items')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' },
        (payload) => this.handleOrderItemChange(payload as any)
      ).subscribe();
  }

  private handleHallChange(payload: any) {
    if (payload.eventType === 'INSERT') {
      this.halls.update(halls => [...halls, payload.new]);
    } else if (payload.eventType === 'UPDATE') {
      this.halls.update(halls => halls.map(h => h.id === payload.new.id ? payload.new : h));
    } else if (payload.eventType === 'DELETE') {
      this.halls.update(halls => halls.filter(h => h.id !== payload.old.id));
    }
  }
  
  private handleTableChange(payload: any) {
    if (payload.eventType === 'INSERT') {
      this.tables.update(tables => [...tables, payload.new]);
    } else if (payload.eventType === 'UPDATE') {
      this.tables.update(tables => tables.map(t => t.id === payload.new.id ? payload.new : t));
    } else if (payload.eventType === 'DELETE') {
      this.tables.update(tables => tables.filter(t => t.id !== payload.old.id));
    }
  }

  private handleOrderChange(payload: { eventType: string, new: Order, old: { id: string } }) {
     if (payload.eventType === 'INSERT') {
       const newOrder = { ...payload.new, order_items: [] };
       this.orders.update(orders => [...orders, newOrder]);
     } else if (payload.eventType === 'UPDATE') {
       // If the order is now completed, filter it out from our active orders list.
       if (payload.new.is_completed) {
         this.orders.update(orders => orders.filter(o => o.id !== payload.new.id));
       } else {
         this.orders.update(orders => orders.map(o => o.id === payload.new.id ? { ...o, ...payload.new } : o));
       }
     } else if (payload.eventType === 'DELETE') {
       this.orders.update(orders => orders.filter(o => o.id !== payload.old.id));
     }
  }

  private handleOrderItemChange(payload: { eventType: string, new: OrderItem, old: { id: string } }) {
      const recipesMap = this.recipesById();
      if (payload.eventType === 'INSERT') {
          const newItem = { ...payload.new, price: recipesMap.get(payload.new.recipe_id)?.price ?? 0 };
          this.orders.update(orders => orders.map(o => o.id === newItem.order_id ? { ...o, order_items: [...o.order_items, newItem] } : o));
      } else if (payload.eventType === 'UPDATE') {
          const updatedItem = { ...payload.new, price: recipesMap.get(payload.new.recipe_id)?.price ?? 0 };
          this.orders.update(orders => orders.map(o => o.id === updatedItem.order_id 
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
    // Step 1: Insert the new order
    const { data: newOrderData, error: orderError } = await this.supabase
      .from('orders')
      .insert({ table_number: table.number, order_type: 'Dine-in' })
      .select()
      .single();
  
    if (orderError || !newOrderData) {
      console.error('Error creating order:', JSON.stringify(orderError, null, 2));
      const errorMessage = `Falha ao criar pedido na tabela 'orders'. ${orderError?.message ?? 'Resposta do banco de dados vazia.'}`;
      return { success: false, error: { ...orderError, message: errorMessage } };
    }
  
    // Step 2: Update the table status
    const { error: tableError } = await this.supabase
      .from('tables')
      .update({ status: 'OCUPADA' })
      .eq('id', table.id);
  
    if (tableError) {
      console.error('Error updating table status:', JSON.stringify(tableError, null, 2));
      // Attempt to revert the order creation
      await this.supabase.from('orders').delete().eq('id', newOrderData.id);
      console.error('Reverted order creation due to table status update failure.');
      const errorMessage = `Falha ao atualizar status na tabela 'tables'. ${tableError.message}`;
      return { success: false, error: { ...tableError, message: errorMessage } };
    }
  
    const newOrder: Order = { ...newOrderData, order_items: [] };
    return { success: true, error: null, data: newOrder };
  }


  async addItemsToOrder(orderId: string, items: { recipe: Recipe; quantity: number, station_id: string }[]): Promise<{ success: boolean; error: any }> {
    const itemsToInsert = items.map(item => ({
      order_id: orderId,
      recipe_id: item.recipe.id,
      name: item.recipe.name, // Denormalize name
      quantity: item.quantity,
      status: 'PENDENTE' as OrderItemStatus,
      station_id: item.station_id,
    }));

    const { error } = await this.supabase.from('order_items').insert(itemsToInsert);
    if (error) {
        console.error('Error adding items to order:', JSON.stringify(error, null, 2));
        return { success: false, error };
    }
    return { success: true, error: null };
  }
  
  async updateOrderItemStatus(itemId: string, newStatus: OrderItemStatus) {
    const { error } = await this.supabase
      .from('order_items')
      .update({ status: newStatus })
      .eq('id', itemId);
      
    if (error) console.error('Error updating item status:', JSON.stringify(error, null, 2));
  }

  async upsertTables(tables: Table[]): Promise<{ success: boolean; error: any }> {
    const newTables = tables.filter(t => t.id.startsWith('temp-')).map(({ ...t }) => {
        delete (t as any).id; // Remove temporary client-side ID before insert.
        return t;
    });
    
    const existingTables = tables.filter(t => !t.id.startsWith('temp-'));

    if (newTables.length > 0) {
        const { error } = await this.supabase.from('tables').insert(newTables);
        if (error) {
            console.error('Error inserting new tables:', JSON.stringify(error, null, 2));
            return { success: false, error };
        }
    }

    if (existingTables.length > 0) {
        const { error } = await this.supabase.from('tables').upsert(existingTables);
        if (error) {
            console.error('Error upserting existing tables:', JSON.stringify(error, null, 2));
            return { success: false, error };
        }
    }
    return { success: true, error: null };
  }

  async deleteTable(tableId: string): Promise<{ success: boolean; error: any }> {
    if (tableId.startsWith('temp-')) return { success: true, error: null };
    const { error } = await this.supabase.from('tables').delete().eq('id', tableId);
    if (error) {
        console.error('Error deleting table:', JSON.stringify(error, null, 2));
        return { success: false, error };
    }
    return { success: true, error: null };
  }
  
  async deleteTablesByHallId(hallId: string): Promise<{ success: boolean; error: any }> {
    const { error } = await this.supabase.from('tables').delete().eq('hall_id', hallId);
    if (error) {
        console.error('Error deleting tables by hall ID:', JSON.stringify(error, null, 2));
        return { success: false, error };
    }
    this.tables.update(currentTables => currentTables.filter(t => t.hall_id !== hallId));
    return { success: true, error: null };
  }

  async moveOrderToTable(order: Order, sourceTable: Table, destinationTable: Table) {
      // 1. Update order with new table number
      const { error: orderError } = await this.supabase
        .from('orders')
        .update({ table_number: destinationTable.number })
        .eq('id', order.id);

      if (orderError) {
          console.error('Error moving order:', JSON.stringify(orderError, null, 2));
          return;
      }

      // 2. Update source table to be LIVRE
      const { error: sourceError } = await this.supabase
        .from('tables')
        .update({ status: 'LIVRE' })
        .eq('id', sourceTable.id);
      if (sourceError) console.error('Error updating source table:', JSON.stringify(sourceError, null, 2));

      // 3. Update destination table to be OCUPADA
      const { error: destError } = await this.supabase
        .from('tables')
        .update({ status: 'OCUPADA' })
        .eq('id', destinationTable.id);
      if (destError) console.error('Error updating destination table:', JSON.stringify(destError, null, 2));
  }

  // --- Hall Management ---
  async addHall(name: string): Promise<{ success: boolean; error: any }> {
    const { error } = await this.supabase.from('halls').insert({ name });
    if (error) {
      console.error('Error adding hall:', JSON.stringify(error, null, 2));
      return { success: false, error };
    }
    return { success: true, error: null };
  }

  async updateHall(id: string, name: string): Promise<{ success: boolean; error: any }> {
      const { error } = await this.supabase.from('halls').update({ name }).eq('id', id);
      if (error) {
        console.error('Error updating hall:', JSON.stringify(error, null, 2));
        return { success: false, error };
      }
      return { success: true, error: null };
  }

  async deleteHall(id: string): Promise<{ success: boolean; error: any }> {
      const { error } = await this.supabase.from('halls').delete().eq('id', id);
      if (error) {
          console.error('Error deleting hall:', JSON.stringify(error, null, 2));
          return { success: false, error };
      }
      this.halls.update(halls => halls.filter(h => h.id !== id));
      return { success: true, error: null };
  }

  // --- Checkout and Payment ---
  async updateTableStatus(tableId: string, status: Table['status']): Promise<{ success: boolean; error: any }> {
    const { error } = await this.supabase.from('tables').update({ status }).eq('id', tableId);
    if (error) {
      console.error('Error updating table status:', JSON.stringify(error, null, 2));
      return { success: false, error };
    }
    return { success: true, error: null };
  }

  async finalizeOrderPayment(orderId: string, tableId: string, totalAmount: number, payments: PaymentInfo[]): Promise<{ success: boolean; error: any }> {
    // Step 1: Mark order as completed
    const { error: orderError } = await this.supabase
      .from('orders')
      .update({ is_completed: true, completed_at: new Date().toISOString() })
      .eq('id', orderId);
  
    if (orderError) {
      console.error('Error completing order:', JSON.stringify(orderError, null, 2));
      const errorMessage = `Falha ao atualizar pedido na tabela 'orders'. ${orderError.message}`;
      return { success: false, error: { ...orderError, message: errorMessage } };
    }
  
    // Step 2: Free up the table
    const { error: tableError } = await this.supabase
      .from('tables')
      .update({ status: 'LIVRE' })
      .eq('id', tableId);
  
    if (tableError) {
      console.error('Error freeing up table:', JSON.stringify(tableError, null, 2));
      // Revert order status if table update fails
      await this.supabase.from('orders').update({ is_completed: false, completed_at: null }).eq('id', orderId);
      console.error('Reverted order completion due to table status update failure.');
      const errorMessage = `Falha ao atualizar status na tabela 'tables'. ${tableError.message}`;
      return { success: false, error: { ...tableError, message: errorMessage } };
    }
  
    // Step 3: Create a financial transaction record
    const paymentMethods = [...new Set(payments.map(p => p.method))].join(', ');
    const description = `Venda Pedido #${orderId.slice(0, 5)} (${paymentMethods})`;

    const { error: transactionError } = await this.supabase
      .from('transactions')
      .insert({
        description: description,
        type: 'Receita',
        amount: totalAmount,
        date: new Date().toISOString()
      });
  
    if (transactionError) {
      // This is considered non-critical. We won't revert the payment for this,
      // but we will log it prominently. It could be an RLS issue on 'transactions'.
      console.error('CRITICAL: Payment processed but failed to create transaction record:', JSON.stringify(transactionError, null, 2));
    }
  
    return { success: true, error: null };
  }
}
