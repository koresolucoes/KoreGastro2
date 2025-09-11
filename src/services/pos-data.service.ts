
import { Injectable, inject } from '@angular/core';
import { Order, OrderItem, Recipe, Table, TableStatus, OrderItemStatus, Transaction, TransactionType, DiscountType, Customer } from '../models/db.models';
import { AuthService } from './auth.service';
import { SupabaseStateService } from './supabase-state.service';
import { PrintingService } from './printing.service';
import { PricingService } from './pricing.service';
import { supabase } from './supabase-client';
import { v4 as uuidv4 } from 'uuid';
import { InventoryDataService } from './inventory-data.service';

export type PaymentInfo = { method: string; amount: number };

@Injectable({
  providedIn: 'root',
})
export class PosDataService {
  private authService = inject(AuthService);
  private stateService = inject(SupabaseStateService);
  private printingService = inject(PrintingService);
  private pricingService = inject(PricingService);
  private inventoryDataService = inject(InventoryDataService);

  getOrderByTableNumber(tableNumber: number): Order | undefined {
    return this.stateService.openOrders().find(o => o.table_number === tableNumber);
  }

  async createOrderForTable(table: Table): Promise<{ success: boolean; error: any; data?: Order }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { data, error } = await supabase.from('orders').insert({ table_number: table.number, order_type: 'Dine-in', user_id: userId }).select('*, customers(*)').single();
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
                status: 'PENDENTE' as OrderItemStatus, station_id: prep.station_id, status_timestamps, 
                price: effectivePrice / recipePreps.length, 
                original_price: effectivePrice / recipePreps.length,
                group_id: groupId, user_id: userId,
                discount_type: null, discount_value: null
            }));
        }
        return [{
            order_id: orderId, recipe_id: item.recipe.id, name: item.recipe.name, quantity: item.quantity, notes: item.notes,
            status: 'PENDENTE' as OrderItemStatus, station_id: fallbackStationId, status_timestamps,
            price: effectivePrice, 
            original_price: effectivePrice,
            group_id: null, user_id: userId,
            discount_type: null, discount_value: null
        }];
    });

    if (allItemsToInsert.length === 0) return { success: true, error: null };

    const { data: inserted, error } = await supabase.from('order_items').insert(allItemsToInsert).select();
    if (error) return { success: false, error };

    await supabase.from('tables').update({ status: 'OCUPADA' as TableStatus, employee_id: employeeId }).eq('id', tableId);

    return { success: true, error: null };
  }
  
  async updateOrderItemStatus(itemId: string, status: OrderItemStatus): Promise<{ success: boolean; error: any }> {
    const { data: currentItem, error: fetchError } = await supabase
      .from('order_items')
      .select('status_timestamps')
      .eq('id', itemId)
      .single();

    if (fetchError) {
      return { success: false, error: fetchError };
    }

    const newTimestamps = {
      ...currentItem.status_timestamps,
      [status.toUpperCase()]: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('order_items')
      .update({ status, status_timestamps: newTimestamps })
      .eq('id', itemId);

    return { success: !error, error };
  }

  async acknowledgeOrderItemAttention(itemId: string): Promise<{ success: boolean; error: any }> {
    const { data: currentItem, error: fetchError } = await supabase
      .from('order_items')
      .select('status_timestamps')
      .eq('id', itemId)
      .single();

    if (fetchError) {
      return { success: false, error: fetchError };
    }

    const newTimestamps = {
      ...currentItem.status_timestamps,
      'ATTENTION_ACKNOWLEDGED': new Date().toISOString(),
    };

    const { error } = await supabase
      .from('order_items')
      .update({ status_timestamps: newTimestamps })
      .eq('id', itemId);

    return { success: !error, error };
  }
  
  async markOrderAsServed(orderId: string): Promise<{ success: boolean; error: any }> {
    const { data: items, error: fetchError } = await supabase
      .from('order_items')
      .select('*') // Fetches all columns to ensure all NOT NULL fields are present.
      .eq('order_id', orderId);

    if (fetchError) return { success: false, error: fetchError };
    
    const now = new Date().toISOString();

    const updates = (items || []).map(item => {
      const newTimestamps = {
        ...(item.status_timestamps || {}),
        'SERVIDO': now,
      };
      // Spreads the full item object to preserve all fields, then overwrites status and timestamps.
      // This prevents 'violates not-null constraint' errors during upsert.
      return {
        ...item,
        status: 'SERVIDO' as OrderItemStatus,
        status_timestamps: newTimestamps,
      };
    });

    if (updates.length === 0) {
      return { success: true, error: null };
    }

    const { error } = await supabase.from('order_items').upsert(updates);

    return { success: !error, error };
  }

  async moveOrderToTable(order: Order, sourceTable: Table, destinationTable: Table): Promise<{ success: boolean; error: any }> {
    const { error: orderUpdateError } = await supabase
      .from('orders')
      .update({ table_number: destinationTable.number })
      .eq('id', order.id);

    if (orderUpdateError) return { success: false, error: orderUpdateError };

    const { error: tablesUpdateError } = await supabase
      .from('tables')
      .upsert([
        { ...sourceTable, status: 'LIVRE', employee_id: null, customer_count: 0 },
        { ...destinationTable, status: 'OCUPADA', employee_id: sourceTable.employee_id, customer_count: sourceTable.customer_count }
      ]);
    
    return { success: !tablesUpdateError, error: tablesUpdateError };
  }
  
  async deleteEmptyOrder(orderId: string): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('orders').delete().eq('id', orderId);
    return { success: !error, error };
  }

  async releaseTable(tableId: string, orderId: string): Promise<{ success: boolean; error: any }> {
    await supabase.from('tables').update({ status: 'LIVRE', employee_id: null, customer_count: 0 }).eq('id', tableId);
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

  async applyDiscountToOrderItems(
    itemIds: string[],
    discountType: DiscountType | null,
    discountValue: number | null
  ): Promise<{ success: boolean; error: any }> {
    if (itemIds.length === 0) return { success: true, error: null };
    
    const { data: items, error: fetchError } = await supabase
      .from('order_items')
      .select('*') // FIX: Select all columns to get full object context
      .in('id', itemIds);

    if (fetchError) return { success: false, error: fetchError };
    if (!items) return { success: false, error: { message: 'Items not found' } };

    let updates: Partial<OrderItem>[];

    // Handle discount removal
    if (discountType === null || discountValue === null || discountValue < 0) {
      updates = items.map(item => ({
        ...item, // FIX: Spread existing item to preserve all fields
        price: item.original_price,
        discount_type: null,
        discount_value: null,
      }));
    } else if (discountType === 'percentage') {
      updates = items.map(item => ({
        ...item, // FIX: Spread existing item to preserve all fields
        price: item.original_price * (1 - discountValue / 100),
        discount_type: discountType,
        discount_value: discountValue,
      }));
    } else { // fixed_value
      // For fixed_value on a group, distribute the discount proportionally.
      const totalOriginalPrice = items.reduce((sum, i) => sum + i.original_price, 0);

      if (totalOriginalPrice > 0) {
        updates = items.map(item => {
          const proportion = item.original_price / totalOriginalPrice;
          const itemDiscount = discountValue * proportion;
          return {
            ...item, // FIX: Spread existing item to preserve all fields
            price: Math.max(0, item.original_price - itemDiscount),
            discount_type: discountType,
            discount_value: discountValue, // Store the total discount value on all items for consistency
          };
        });
      } else {
        // Cannot apply proportional discount. Just set price to 0.
        updates = items.map(item => ({
          ...item, // FIX: Spread existing item to preserve all fields
          price: 0,
          discount_type: discountType,
          discount_value: discountValue,
        }));
      }
    }

    const { error } = await supabase.from('order_items').upsert(updates);
    return { success: !error, error };
  }

  async finalizeOrderPayment(
    orderId: string, 
    tableId: string,
    total: number, 
    payments: PaymentInfo[], 
    tipAmount: number
  ): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    
    const { error: orderError } = await supabase
      .from('orders')
      .update({ is_completed: true, completed_at: new Date().toISOString() })
      .eq('id', orderId);
    if (orderError) return { success: false, error: orderError };

    const { error: tableError } = await supabase
      .from('tables')
      .update({ status: 'LIVRE', employee_id: null, customer_count: 0 })
      .eq('id', tableId);
    if (tableError) return { success: false, error: tableError };

    const tableEmployeeId = this.stateService.tables().find(t => t.id === tableId)?.employee_id;

    const transactionsToInsert: Partial<Transaction>[] = payments.map(p => ({
      description: `Receita Pedido #${orderId.slice(0, 8)} (${p.method})`,
      type: 'Receita' as TransactionType,
      amount: p.amount,
      user_id: userId,
      employee_id: tableEmployeeId
    }));

    if (tipAmount > 0) {
      transactionsToInsert.push({
        description: `Gorjeta Pedido #${orderId.slice(0, 8)}`,
        type: 'Gorjeta' as TransactionType,
        amount: tipAmount,
        user_id: userId,
        employee_id: tableEmployeeId
      });
    }

    if (transactionsToInsert.length > 0) {
      const { error: transactionError } = await supabase.from('transactions').insert(transactionsToInsert);
      if (transactionError) return { success: false, error: transactionError };
    }

    // Deduct stock after successful payment
    const { data: orderItems, error: itemsError } = await supabase.from('order_items').select('*').eq('order_id', orderId);
    
    if (itemsError) {
        console.error('Could not fetch items for stock deduction, but payment was processed.', itemsError);
    } else if (orderItems) {
        const { success: deductionSuccess, error: deductionError } = await this.inventoryDataService.deductStockForOrderItems(orderItems, orderId);
        if (!deductionSuccess) {
            console.error('Stock deduction failed after payment was processed. Manual adjustment needed.', deductionError);
        }
    }
    
    // Manually trigger a refresh for cashier data after successful payment.
    await this.stateService.refreshDashboardAndCashierData();

    return { success: true, error: null };
  }

  async associateCustomerToOrder(orderId: string, customerId: string | null): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase
      .from('orders')
      .update({ customer_id: customerId })
      .eq('id', orderId);
      
    return { success: !error, error };
  }

  async redeemReward(customerId: string, rewardId: string, orderId: string): Promise<{ success: boolean; error: any; message?: string }> {
    const { data, error } = await supabase.rpc('redeem_reward', {
      p_customer_id: customerId,
      p_reward_id: rewardId,
      p_order_id: orderId,
    });

    if (error) {
      return { success: false, error };
    }
    
    const response = data as { success: boolean, message: string };
    return { success: response.success, error: response.success ? null : { message: response.message }, message: response.message };
  }
}
