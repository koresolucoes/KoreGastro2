
import { Injectable, inject } from '@angular/core';
import { Order, OrderItem, Recipe, Table, TableStatus, OrderItemStatus, Transaction } from '../models/db.models';
import { AuthService } from './auth.service';
import { SupabaseStateService } from './supabase-state.service';
import { PrintingService } from './printing.service';
import { PricingService } from './pricing.service';
import { supabase } from './supabase-client';
import { v4 as uuidv4 } from 'uuid';

export type PaymentInfo = { method: string; amount: number };

@Injectable({
  providedIn: 'root',
})
export class PosDataService {
  private authService = inject(AuthService);
  private stateService = inject(SupabaseStateService);
  private printingService = inject(PrintingService);
  private pricingService = inject(PricingService);

  getOrderByTableNumber(tableNumber: number): Order | undefined {
    return this.stateService.openOrders().find(o => o.table_number === tableNumber);
  }

  async createOrderForTable(table: Table): Promise<{ success: boolean; error: any; data?: Order }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { data, error } = await supabase.from('orders').insert({ table_number: table.number, order_type: 'Dine-in', user_id: userId }).select().single();
    if (error) return { success: false, error };
    return { success: true, error: null, data: { ...data, order_items: [] } };
  }

  async addItemsToOrder(orderId: string, tableId: string, employeeId: string, items: { recipe: Recipe; quantity: number; notes?: string }[]): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const stations = this.stateService.stations();
    if (stations.length === 0) return { success: false, error: { message: 'Nenhuma estação de produção configurada.' } };
    const fallbackStationId = stations[0].id;
    
    const { data: preps } = await supabase.from('recipe_preparations').select('*').in('recipe_id', items.map(i => i.recipe.id)).eq('user_id', userId);
    const prepsByRecipeId = (preps || []).reduce((acc, p) => {
        if (!acc.has(p.recipe_id)) acc.set(p.recipe_id, []);
        acc.get(p.recipe_id)!.push(p);
        return acc;
    }, new Map());
    
    const allItemsToInsert = items.flatMap(item => {
        const recipePreps = prepsByRecipeId.get(item.recipe.id);
        const effectivePrice = this.pricingService.getEffectivePrice(item.recipe);
        const status_timestamps = { 'PENDENTE': new Date().toISOString() };
        if (recipePreps?.length > 0) {
            const groupId = uuidv4();
            return recipePreps.map((prep: any) => ({
                order_id: orderId, recipe_id: item.recipe.id, name: `${item.recipe.name} (${prep.name})`, quantity: item.quantity, notes: item.notes,
                status: 'PENDENTE' as OrderItemStatus, station_id: prep.station_id, status_timestamps, price: effectivePrice / recipePreps.length, group_id: groupId, user_id: userId
            }));
        }
        return [{
            order_id: orderId, recipe_id: item.recipe.id, name: item.recipe.name, quantity: item.quantity, notes: item.notes,
            status: 'PENDENTE' as OrderItemStatus, station_id: fallbackStationId, status_timestamps, price: effectivePrice, group_id: null, user_id: userId
        }];
    });

    if (allItemsToInsert.length === 0) return { success: true, error: null };

    const { data: inserted, error } = await supabase.from('order_items').insert(allItemsToInsert).select();
    if (error) return { success: false, error };

    await supabase.from('tables').update({ status: 'OCUPADA' as TableStatus, employee_id: employeeId }).eq('id', tableId);

    return { success: true, error: null };
  }

  async deleteEmptyOrder(orderId: string): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('orders').delete().eq('id', orderId);
    return { success: !error, error };
  }

  async releaseTable(tableId: string, orderId: string): Promise<{ success: boolean; error: any }> {
    await supabase.from('tables').update({ status: 'LIVRE', employee_id: null }).eq('id', tableId);
    await supabase.from('orders').delete().eq('id', orderId);
    return { success: true, error: null };
  }

  async updateHall(id: string, name: string): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('halls').update({ name }).eq('id', id);
    return { success: !error, error };
  }

  async addHall(name: string): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase.from('halls').insert({ name, user_id: userId });
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
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const tablesToUpsert = tables.map(({ id, ...rest }) => {
      if (id.toString().startsWith('temp-')) {
        // This is a new table. Generate a UUID for it.
        return { ...rest, id: uuidv4(), user_id: userId };
      }
      // This is an existing table.
      return { id, ...rest, user_id: userId };
    });
    const { error } = await supabase.from('tables').upsert(tablesToUpsert);
    return { success: !error, error };
  }

  async updateTableStatus(id: string, status: TableStatus): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('tables').update({ status }).eq('id', id);
    return { success: !error, error };
  }

  async updateTableCustomerCount(tableId: string, customer_count: number): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('tables').update({ customer_count }).eq('id', tableId);
    return { success: !error, error };
  }

  async finalizeOrderPayment(orderId: string, tableId: string, total: number, payments: PaymentInfo[], tip: number): Promise<{ success: boolean, error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    
    const table = this.stateService.tables().find(t => t.id === tableId);
    const employeeId = table?.employee_id || null;
    
    const transactionsToInsert: Partial<Transaction>[] = payments.map(p => ({
      description: `Receita Pedido #${orderId.slice(0, 8)} (${p.method})`,
      type: 'Receita',
      amount: p.amount,
      user_id: userId,
      employee_id: employeeId
    }));
    
    if (tip > 0) {
        transactionsToInsert.push({
          description: `Gorjeta Pedido #${orderId.slice(0, 8)}`,
          type: 'Gorjeta',
          amount: tip,
          user_id: userId,
          employee_id: employeeId
        });
    }
    
    if (transactionsToInsert.length > 0) {
      const { error } = await supabase.from('transactions').insert(transactionsToInsert as any);
      if (error) return { success: false, error };
    }
    
    await supabase.from('orders').update({ is_completed: true, completed_at: new Date().toISOString() }).eq('id', orderId);
    await supabase.from('tables').update({ status: 'LIVRE', employee_id: null, customer_count: 0 }).eq('id', tableId);
    
    this.stateService.orders.update(current => current.filter(o => o.id !== orderId));
    await this.stateService.refreshDashboardAndCashierData();
    return { success: true, error: null };
  }

  async moveOrderToTable(order: Order, sourceTable: Table, destinationTable: Table): Promise<{ success: boolean, error: any }> {
    await supabase.from('orders').update({ table_number: destinationTable.number }).eq('id', order.id);
    await supabase.from('tables').update({ status: 'LIVRE', employee_id: null, customer_count: 0 }).eq('id', sourceTable.id);
    await supabase.from('tables').update({ status: 'OCUPADA', employee_id: sourceTable.employee_id, customer_count: sourceTable.customer_count }).eq('id', destinationTable.id);
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

  async markOrderAsServed(orderId: string): Promise<{ success: boolean, error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const { error } = await supabase
      .from('order_items')
      .update({ status: 'SERVED' as any })
      .eq('order_id', orderId)
      .eq('user_id', userId);
    
    return { success: !error, error };
  }
}