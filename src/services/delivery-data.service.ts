import { Injectable, inject } from '@angular/core';
import { supabase } from './supabase-client';
import { AuthService } from './auth.service';
// FIX: import Order model
import { DeliveryDriver, Order, OrderItem, OrderItemStatus, Recipe } from '../models/db.models';
import { v4 as uuidv4 } from 'uuid';
import { PosStateService } from './pos-state.service';
import { PricingService } from './pricing.service';
// FIX: import InventoryDataService
import { InventoryDataService } from './inventory-data.service';

// Interface for the new order cart item
interface DeliveryCartItem {
  recipe: Recipe;
  quantity: number;
  notes: string;
}


@Injectable({ providedIn: 'root' })
export class DeliveryDataService {
  private authService = inject(AuthService);
  private posState = inject(PosStateService);
  private pricingService = inject(PricingService);
  // FIX: inject InventoryDataService
  private inventoryDataService = inject(InventoryDataService);

  async updateDeliveryStatus(orderId: string, status: string, driverId?: string | null) {
    const updatePayload: { delivery_status: string; delivery_driver_id?: string | null } = {
      delivery_status: status,
    };
    if (driverId !== undefined) {
      updatePayload.delivery_driver_id = driverId;
    }
    const { error } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', orderId);
    return { success: !error, error };
  }
  
  // FIX: Add missing method assignDriverToOrder
  async assignDriverToOrder(orderId: string, driverId: string, distance: number, deliveryCost: number): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase
      .from('orders')
      .update({ 
        delivery_driver_id: driverId, 
        delivery_status: 'OUT_FOR_DELIVERY',
        delivery_distance_km: distance,
        delivery_cost: deliveryCost
      })
      .eq('id', orderId);

    return { success: !error, error };
  }

  // FIX: Add missing method finalizeDeliveryOrder
  async finalizeDeliveryOrder(order: Order): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    // 1. Update order status
    const { error: orderUpdateError } = await supabase
      .from('orders')
      .update({ 
        status: 'COMPLETED', 
        delivery_status: 'DELIVERED',
        completed_at: new Date().toISOString() 
      })
      .eq('id', order.id);

    if (orderUpdateError) {
      return { success: false, error: orderUpdateError };
    }

    // 2. Insert transactions
    const orderTotal = order.order_items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const paymentMethod = order.notes?.replace('Pagamento: ', '') || 'Desconhecido';

    const transactionsToInsert = [
      {
        description: `Receita Pedido #${order.id.slice(0, 8)} (${paymentMethod})`,
        type: 'Receita' as const,
        amount: orderTotal,
        user_id: userId,
        employee_id: order.delivery_driver_id, // Attribute sale to the driver
      }
    ];
    
    if (order.delivery_cost && order.delivery_cost > 0) {
        transactionsToInsert.push({
            description: `Taxa de Entrega Pedido #${order.id.slice(0, 8)}`,
            type: 'Despesa' as const, // This might be a business decision. Is it an expense or part of revenue? Assuming expense for driver payout.
            amount: order.delivery_cost,
            user_id: userId,
            employee_id: order.delivery_driver_id,
        });
    }

    const { error: transactionError } = await supabase.from('transactions').insert(transactionsToInsert);
    if (transactionError) {
      console.error(`CRITICAL: Order ${order.id} finalized but failed to insert transactions.`, transactionError);
      // Don't rollback, as the order is already marked complete.
    }

    // 3. Deduct stock (fire and forget)
    this.inventoryDataService.deductStockForOrderItems(order.order_items, order.id).catch(stockError => {
        console.error(`[DeliveryDataService] NON-FATAL: Stock deduction failed for order ${order.id}.`, stockError);
    });

    return { success: true, error: null };
  }


  async addDriver(driver: Partial<DeliveryDriver>): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' }};
    const { error } = await supabase.from('delivery_drivers').insert({ ...driver, user_id: userId });
    return { success: !error, error };
  }

  async updateDriver(driverId: string, updates: Partial<DeliveryDriver>): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('delivery_drivers').update(updates).eq('id', driverId);
    return { success: !error, error };
  }

  async deleteDriver(driverId: string): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('delivery_drivers').delete().eq('id', driverId);
    return { success: !error, error };
  }

  async createExternalDeliveryOrder(cart: DeliveryCartItem[], customerId: string | null, paymentMethod: string): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    // 1. Create the order
    const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
            table_number: 0,
            order_type: 'External-Delivery',
            status: 'OPEN',
            delivery_status: 'AWAITING_PREP',
            user_id: userId,
            customer_id: customerId,
            notes: `Pagamento: ${paymentMethod}` 
        })
        .select('id')
        .single();

    if (orderError) return { success: false, error: orderError };
    
    // 2. Create order items from cart
    const { success, error } = await this.createOrderItemsForOrder(order.id, cart, userId);
    if (!success) {
      await supabase.from('orders').delete().eq('id', order.id); // Rollback
      return { success, error };
    }

    return { success: true, error: null };
  }

  async updateExternalDeliveryOrder(orderId: string, cart: DeliveryCartItem[], customerId: string | null, paymentMethod: string): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    // 1. Delete old items
    const { error: deleteError } = await supabase.from('order_items').delete().eq('order_id', orderId);
    if (deleteError) {
      return { success: false, error: deleteError };
    }

    // 2. Create new items from cart
    const { success, error: itemsError } = await this.createOrderItemsForOrder(orderId, cart, userId);
    if (!success) {
      // At this point, old items are deleted but new ones failed. This is a partial failure state.
      // The user will need to re-edit the order.
      return { success: false, error: itemsError };
    }
    
    // 3. Update order details
    const { error: orderUpdateError } = await supabase
      .from('orders')
      .update({ customer_id: customerId, notes: `Pagamento: ${paymentMethod}` })
      .eq('id', orderId);

    if (orderUpdateError) {
        // Items are updated, but order metadata failed.
        return { success: false, error: orderUpdateError };
    }

    return { success: true, error: null };
  }

  private async createOrderItemsForOrder(orderId: string, cart: DeliveryCartItem[], userId: string): Promise<{ success: boolean, error: any }> {
    const stations = this.posState.stations();
    if (stations.length === 0) {
      return { success: false, error: { message: 'Nenhuma estação de produção configurada.' } };
    }
    const fallbackStationId = stations[0].id;
    
    const { data: preps } = await supabase.from('recipe_preparations').select('*').in('recipe_id', cart.map(i => i.recipe.id)).eq('user_id', userId);
    const prepsByRecipeId = (preps || []).reduce((acc, p) => {
        if (!acc.has(p.recipe_id)) acc.set(p.recipe_id, []);
        acc.get(p.recipe_id)!.push(p);
        return acc;
    }, new Map<string, any[]>());
    
    const allItemsToInsert: Partial<OrderItem>[] = cart.flatMap(item => {
        const recipePreps = prepsByRecipeId.get(item.recipe.id);
        const effectivePrice = this.pricingService.getEffectivePrice(item.recipe);
        const status_timestamps = { 'PENDENTE': new Date().toISOString() };

        if (recipePreps && recipePreps.length > 0) {
            const groupId = uuidv4();
            return recipePreps.map((prep: any, prepIndex: number) => ({
                order_id: orderId, recipe_id: item.recipe.id, name: `${item.recipe.name} (${prep.name})`, quantity: item.quantity, 
                notes: prepIndex === 0 ? item.notes : null, // Add notes only to the first item of a group
                status: 'PENDENTE' as OrderItemStatus, station_id: prep.station_id, status_timestamps, 
                price: effectivePrice / recipePreps.length, 
                original_price: item.recipe.price / recipePreps.length,
                group_id: groupId, user_id: userId
            }));
        }
        return [{
            order_id: orderId, recipe_id: item.recipe.id, name: item.recipe.name, quantity: item.quantity, notes: item.notes,
            status: 'PENDENTE' as OrderItemStatus, station_id: fallbackStationId, status_timestamps,
            price: effectivePrice, 
            original_price: item.recipe.price,
            group_id: null, user_id: userId
        }];
    });

    if (allItemsToInsert.length === 0) {
        return { success: true, error: null };
    }

    const { error: itemsError } = await supabase.from('order_items').insert(allItemsToInsert);
    if (itemsError) {
        return { success: false, error: itemsError };
    }
    
    return { success: true, error: null };
  }
}
