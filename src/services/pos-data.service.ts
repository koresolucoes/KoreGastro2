
import { Injectable, inject } from '@angular/core';
import { Order, OrderItem, Recipe, Table, TableStatus, OrderItemStatus, Transaction, TransactionType, DiscountType, Customer } from '../models/db.models';
import { AuthService } from './auth.service';
import { PosStateService } from './pos-state.service';
import { SupabaseStateService } from './supabase-state.service';
import { PrintingService } from './printing.service';
import { PricingService } from './pricing.service';
import { supabase } from './supabase-client';
import { v4 as uuidv4 } from 'uuid';
import { InventoryDataService } from './inventory-data.service';
import { WebhookService } from './webhook.service';
import { DeliveryDataService } from './delivery-data.service';
import { UnitContextService } from './unit-context.service';

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
  private posState = inject(PosStateService);
  private webhookService = inject(WebhookService);
  private deliveryDataService = inject(DeliveryDataService);
  private unitContextService = inject(UnitContextService);

  private getActiveUnitId(): string | null {
      return this.unitContextService.activeUnitId();
  }

  getOrderByTableNumber(tableNumber: number): Order | undefined {
    return this.posState.openOrders().find(o => o.table_number === tableNumber);
  }

  async createOrderForTable(table: Table, employeeId: string): Promise<{ success: boolean; error: any; data?: Order }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Active unit not found' } };
    
    // AUDIT: created_by_employee_id
    const { data, error } = await supabase.from('orders').insert({ 
        table_number: table.number, 
        order_type: 'Dine-in', 
        user_id: userId,
        created_by_employee_id: employeeId 
    }).select('*, customers(*)').single();
    
    if (error) return { success: false, error };
    return { success: true, error: null, data: { ...data, order_items: [] } };
  }

  async addItemsToOrder(orderId: string, tableId: string, employeeId: string, items: { recipe: Recipe; quantity: number; notes?: string }[]): Promise<{ success: boolean; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Active unit not found' } };

    const stations = this.posState.stations();
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
        
        // AUDIT: added_by_employee_id is set here
        if (recipePreps?.length > 0) {
            const groupId = uuidv4();
            return recipePreps.map((prep: any) => ({
                order_id: orderId, recipe_id: item.recipe.id, name: `${item.recipe.name} (${prep.name})`, quantity: item.quantity, notes: item.notes,
                status: 'PENDENTE' as OrderItemStatus, station_id: prep.station_id, status_timestamps, 
                price: effectivePrice / recipePreps.length, 
                original_price: effectivePrice / recipePreps.length,
                group_id: groupId, user_id: userId,
                discount_type: null, discount_value: null,
                added_by_employee_id: employeeId
            }));
        }
        return [{
            order_id: orderId, recipe_id: item.recipe.id, name: item.recipe.name, quantity: item.quantity, notes: item.notes,
            status: 'PENDENTE' as OrderItemStatus, station_id: fallbackStationId, status_timestamps,
            price: effectivePrice, 
            original_price: effectivePrice,
            group_id: null, user_id: userId,
            discount_type: null, discount_value: null,
            added_by_employee_id: employeeId
        }];
    });

    if (allItemsToInsert.length === 0) return { success: true, error: null };

    const { data: inserted, error } = await supabase.from('order_items').insert(allItemsToInsert).select();
    if (error) return { success: false, error };

    await supabase.from('tables').update({ status: 'OCUPADA' as TableStatus, employee_id: employeeId }).eq('id', tableId);

    return { success: true, error: null };
  }
  
  async updateOrderItemStatus(itemId: string, status: OrderItemStatus): Promise<{ success: boolean; error: any }> {
    // This can use standard supabase update, RLS handles security
    const { data: currentItem, error: fetchError } = await supabase
      .from('order_items')
      .select('status_timestamps, order_id')
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

    if (!error && currentItem.order_id) {
      this.checkAndUpdateDeliveryOrderStatus(currentItem.order_id);
    }

    return { success: !error, error };
  }

  async updateMultipleItemStatuses(itemIds: string[], status: OrderItemStatus): Promise<{ success: boolean; error: any }> {
    if (itemIds.length === 0) return { success: true, error: null };

    const { data: items, error: fetchError } = await supabase
      .from('order_items')
      .select('*')
      .in('id', itemIds);

    if (fetchError) return { success: false, error: fetchError };
    
    const now = new Date().toISOString();

    const updates = (items || []).map(item => {
      const newTimestamps = {
        ...(item.status_timestamps || {}),
        [status.toUpperCase()]: now,
      };
      return {
        ...item,
        status: status,
        status_timestamps: newTimestamps,
      };
    });

    const { error } = await supabase.from('order_items').upsert(updates);
    
    if (!error && items && items.length > 0) {
        const orderId = items[0].order_id;
        this.checkAndUpdateDeliveryOrderStatus(orderId);
    }

    return { success: !error, error };
  }

  private async checkAndUpdateDeliveryOrderStatus(orderId: string): Promise<void> {
    try {
        const { data: order, error } = await supabase
            .from('orders')
            .select('id, order_type, delivery_status, order_items(*)')
            .eq('id', orderId)
            .single();

        if (error || !order || order.order_type !== 'External-Delivery') {
            return;
        }

        if (order.delivery_status === 'OUT_FOR_DELIVERY' || order.delivery_status === 'DELIVERED') {
            return;
        }
        
        const items = order.order_items;
        if (!items || items.length === 0) {
            return;
        }

        const allReady = items.every(i => i.status === 'PRONTO' || i.status === 'SERVIDO' || i.status === 'CANCELADO');
        if (allReady) {
            if (order.delivery_status !== 'READY_FOR_DISPATCH') {
                await this.deliveryDataService.updateDeliveryStatus(orderId, 'READY_FOR_DISPATCH');
            }
            return;
        }

        const anyInPreparation = items.some(i => i.status === 'EM_PREPARO');
        if (anyInPreparation) {
            if (order.delivery_status === 'AWAITING_PREP') {
                await this.deliveryDataService.updateDeliveryStatus(orderId, 'IN_PREPARATION');
            }
            return;
        }

    } catch (e) {
        console.error(`[PosDataService] Failed to check and update delivery order status for order ${orderId}:`, e);
    }
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
  
  // NEW: Acknowledge Cancellation (clears item from KDS)
  async acknowledgeCancellation(itemId: string): Promise<{ success: boolean; error: any }> {
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
      'CANCELLATION_ACKNOWLEDGED': new Date().toISOString(),
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
      .select('*')
      .eq('order_id', orderId)
      .neq('status', 'CANCELADO');

    if (fetchError) return { success: false, error: fetchError };
    
    const now = new Date().toISOString();

    const updates = (items || []).map(item => {
      const newTimestamps = {
        ...(item.status_timestamps || {}),
        'SERVIDO': now,
      };
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

  async applyDiscountToOrderItems(
    itemIds: string[],
    discountType: DiscountType | null,
    discountValue: number | null
  ): Promise<{ success: boolean; error: any }> {
    if (itemIds.length === 0) return { success: true, error: null };
    
    const { data: items, error: fetchError } = await supabase.from('order_items').select('*').in('id', itemIds);
    if (fetchError) return { success: false, error: fetchError };
    if (!items) return { success: false, error: { message: 'Items not found' } };

    let updates: Partial<OrderItem>[];

    if (discountType === null || discountValue === null || discountValue < 0) {
      updates = items.map(item => ({ 
          ...item, 
          price: item.original_price, 
          discount_type: null, 
          discount_value: null 
      }));
    } else if (discountType === 'percentage') {
      updates = items.map(item => ({ 
          ...item, 
          price: item.original_price * (1 - discountValue / 100), 
          discount_type: discountType, 
          discount_value: discountValue 
      }));
    } else { 
      const totalOriginalPrice = items.reduce((sum, i) => sum + i.original_price, 0);
      if (totalOriginalPrice > 0) {
        updates = items.map(item => {
          const proportion = item.original_price / totalOriginalPrice;
          const itemDiscount = discountValue * proportion;
          return { 
              ...item, 
              price: Math.max(0, item.original_price - itemDiscount), 
              discount_type: discountType, 
              discount_value: discountValue 
          };
        });
      } else {
        updates = items.map(item => ({ ...item, price: 0, discount_type: discountType, discount_value: discountValue }));
      }
    }

    const { error } = await supabase.from('order_items').upsert(updates);

    if (error) {
         return { success: false, error };
    }

    this.posState.orders.update(currentOrders => {
        return currentOrders.map(order => {
            const orderHasItems = order.order_items.some(i => itemIds.includes(i.id));
            if (!orderHasItems) return order;

            const newItems = order.order_items.map(item => {
                const update = updates.find(u => u.id === item.id);
                if (update) {
                    return { ...item, ...update } as OrderItem;
                }
                return item;
            });

            return { ...order, order_items: newItems };
        });
    });

    return { success: true, error: null };
  }
  
  async applyGlobalOrderDiscount(orderId: string, discountType: DiscountType | null, discountValue: number | null): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase
        .from('orders')
        .update({ discount_type: discountType, discount_value: discountValue })
        .eq('id', orderId);

    if (error) {
        return { success: false, error };
    }
    
    this.posState.orders.update(currentOrders => 
        currentOrders.map(order => 
            order.id === orderId 
                ? { ...order, discount_type: discountType, discount_value: discountValue } 
                : order
        )
    );
    
    return { success: true, error: null };
  }

  async finalizeOrderPayment(
    orderId: string,
    tableId: string,
    total: number,
    payments: PaymentInfo[],
    tipAmount: number,
    closingEmployeeId: string // AUDIT: REQUIRED NOW
  ): Promise<{ success: boolean; error: any; warningMessage?: string }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Active unit not found' } };

    // AUDIT: closed_by_employee_id
    const { data: updatedOrder, error: orderUpdateError } = await supabase
      .from('orders')
      .update({ 
          status: 'COMPLETED', 
          completed_at: new Date().toISOString(),
          closed_by_employee_id: closingEmployeeId 
      })
      .eq('id', orderId)
      .select('*, order_items(*), customers(*)')
      .single();

    if (orderUpdateError) return { success: false, error: orderUpdateError };
    
    let warningMessage: string | undefined;

    try {
      await supabase
        .from('tables')
        .update({ status: 'LIVRE', employee_id: null, customer_count: 0 })
        .eq('id', tableId);

      // Use the closing employee for the transaction record as well (AUDIT)
      const transactionsToInsert: Partial<Transaction>[] = payments.map(p => ({
        description: `Receita Pedido #${orderId.slice(0, 8)} (${p.method})`,
        type: 'Receita' as TransactionType,
        amount: p.amount,
        user_id: userId,
        employee_id: closingEmployeeId, 
      }));

      if (tipAmount > 0) {
        transactionsToInsert.push({ 
            description: `Gorjeta Pedido #${orderId.slice(0, 8)}`, 
            type: 'Gorjeta' as TransactionType, 
            amount: tipAmount, 
            user_id: userId, 
            employee_id: closingEmployeeId, // Tips attributed to closer for now, or table owner logic could be kept if preferred
        });
      }

      if (transactionsToInsert.length > 0) {
        const { error: transactionError } = await supabase.from('transactions').insert(transactionsToInsert);
        if (transactionError) console.error(`CRITICAL: Order ${orderId} finalized but failed to insert transactions.`, transactionError);
      }

      // Filter out CANCELLED items before deducting stock
      const itemsToDeduct = (updatedOrder.order_items || []).filter((i: OrderItem) => i.status !== 'CANCELADO');

      if (itemsToDeduct.length > 0) {
         const deductionResult = await this.inventoryDataService.deductStockForOrderItems(itemsToDeduct, orderId);
         if (!deductionResult.success) {
            console.error(`[POS Data Service] Stock deduction failed for order ${orderId}.`, deductionResult.error);
         } else if (deductionResult.warningMessage) {
            warningMessage = deductionResult.warningMessage;
         }
      }
      
      this.webhookService.triggerWebhook('order.updated', updatedOrder);
      await this.stateService.refreshDashboardAndCashierData();

      return { success: true, error: null, warningMessage };

    } catch (e) {
        console.error(`[POS Data Service] Post-payment processing failed for order ${orderId}.`, e);
        return { success: true, error: null };
    }
  }

  // --- Cancellation Methods (AUDITED) ---

  async cancelOrder(orderId: string, reason: string, employeeId: string | null = null): Promise<{ success: boolean; error: any }> {
    const formattedNotes = `CANCELAMENTO: ${reason}`;
    const userId = this.getActiveUnitId();

    // 1. Fetch the order to get the table number
    const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('table_number')
        .eq('id', orderId)
        .single();
    
    if (fetchError) return { success: false, error: fetchError };

    // 2. Update Order Status - Now recording WHO performed the cancellation
    const { error } = await supabase
        .from('orders')
        .update({ 
            status: 'CANCELLED', 
            completed_at: new Date().toISOString(),
            notes: formattedNotes,
            cancelled_by: employeeId // AUDIT
        })
        .eq('id', orderId);

    if (error) return { success: false, error };

    // 3. Free the table if it's a Dine-in order (table_number > 0)
    if (order && order.table_number > 0 && userId) {
        const { error: tableError } = await supabase
            .from('tables')
            .update({ status: 'LIVRE', employee_id: null, customer_count: 0 })
            .eq('number', order.table_number)
            .eq('user_id', userId);
            
        if (tableError) console.error("Failed to free table after cancellation:", tableError);
    }
        
    return { success: !error, error };
  }
  
  async cancelOrderItems(itemIds: string[], reason: string, employeeId: string | null = null): Promise<{ success: boolean; error: any }> {
      if (itemIds.length === 0) return { success: true, error: null };

      // Update item status and record who did it
      const { error } = await supabase
        .from('order_items')
        .update({ 
            status: 'CANCELADO' as OrderItemStatus, 
            notes: `CANCELADO: ${reason}`,
            price: 0, // Refund price
            cancelled_by: employeeId // AUDIT
        })
        .in('id', itemIds);
      
      if (!error) {
           // Update local state immediately
           this.posState.orders.update(orders => {
               return orders.map(order => {
                   const hasItem = order.order_items.some(i => itemIds.includes(i.id));
                   if (!hasItem) return order;
                   
                   return {
                       ...order,
                       order_items: order.order_items.map(item => {
                           if (itemIds.includes(item.id)) {
                               return { ...item, status: 'CANCELADO', notes: `CANCELADO: ${reason}`, price: 0 };
                           }
                           return item;
                       })
                   };
               });
           });
      }

      return { success: !error, error };
  }

  // --- Hall and Table Management Methods ---

  async addHall(name: string): Promise<{ success: boolean; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Active unit not found' } };
    const { error } = await supabase.from('halls').insert({ name, user_id: userId });
    return { success: !error, error };
  }

  async updateHall(id: string, name: string): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('halls').update({ name }).eq('id', id);
    return { success: !error, error };
  }

  async deleteHall(id: string): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('halls').delete().eq('id', id);
    return { success: !error, error };
  }

  async deleteTablesByHallId(hallId: string): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('tables').delete().eq('hall_id', hallId);
    return { success: !error, error };
  }
  
  async upsertTables(tables: Partial<Table>[]): Promise<{ success: boolean; error: any }> {
      const userId = this.getActiveUnitId();
      if (!userId) return { success: false, error: { message: 'Active unit not found' } };
      
      const tablesToUpsert = tables.map(t => {
          let { id, ...rest } = t;
          // FIX: If ID is temporary (generated by frontend), strip the 'temp-' prefix
          // and use the UUID part as the actual ID. 
          // We MUST ensure an ID is present for all rows when doing an upsert with mixed updates/inserts.
          if (id?.startsWith('temp-')) {
              id = id.replace('temp-', '');
          }
          return { id, ...rest, user_id: userId };
      });

      const { error } = await supabase.from('tables').upsert(tablesToUpsert);
      return { success: !error, error };
  }

  async deleteTable(tableId: string): Promise<{ success: boolean; error: any }> {
      const { error } = await supabase.from('tables').delete().eq('id', tableId);
      return { success: !error, error };
  }

  async updateTableStatus(tableId: string, status: TableStatus): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('tables').update({ status }).eq('id', tableId);
    return { success: !error, error };
  }
  
  async updateTableCustomerCount(tableId: string, count: number): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('tables').update({ customer_count: count }).eq('id', tableId);
    return { success: !error, error };
  }

  async deleteOrderAndItems(orderId: string): Promise<{ success: boolean; error: any }> {
    const { error: itemsError } = await supabase.from('order_items').delete().eq('order_id', orderId);
    if (itemsError) return { success: false, error: itemsError };
    const { error: orderError } = await supabase.from('orders').delete().eq('id', orderId);
    return { success: !orderError, error: orderError };
  }

  async associateCustomerToOrder(orderId: string, customerId: string | null): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('orders').update({ customer_id: customerId }).eq('id', orderId);
    return { success: !error, error };
  }

  async redeemReward(customerId: string, rewardId: string, orderId: string): Promise<{ success: boolean; error: any; message?: string }> {
    const { data, error } = await supabase.rpc('redeem_reward', { p_customer_id: customerId, p_reward_id: rewardId, p_order_id: orderId });
    if (error) return { success: false, error };
    const response = data as { success: boolean, message: string };
    return { success: response.success, error: response.success ? null : { message: response.message }, message: response.message };
  }
}
