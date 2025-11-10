import { Injectable, inject } from '@angular/core';
import { supabase } from './supabase-client';
import { AuthService } from './auth.service';
import { DeliveryDriver, OrderItem, OrderItemStatus, Recipe } from '../models/db.models';
import { v4 as uuidv4 } from 'uuid';
import { PosStateService } from './pos-state.service';
import { PricingService } from './pricing.service';

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
    
    // 2. Create order items
    const stations = this.posState.stations();
    if (stations.length === 0) {
      await supabase.from('orders').delete().eq('id', order.id); // Rollback
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
            return recipePreps.map((prep: any) => ({
                order_id: order.id, recipe_id: item.recipe.id, name: `${item.recipe.name} (${prep.name})`, quantity: item.quantity, notes: item.notes,
                status: 'PENDENTE' as OrderItemStatus, station_id: prep.station_id, status_timestamps, 
                price: effectivePrice / recipePreps.length, 
                original_price: item.recipe.price / recipePreps.length,
                group_id: groupId, user_id: userId
            }));
        }
        return [{
            order_id: order.id, recipe_id: item.recipe.id, name: item.recipe.name, quantity: item.quantity, notes: item.notes,
            status: 'PENDENTE' as OrderItemStatus, station_id: fallbackStationId, status_timestamps,
            price: effectivePrice, 
            original_price: item.recipe.price,
            group_id: null, user_id: userId
        }];
    });

    if (allItemsToInsert.length === 0) {
        await supabase.from('orders').delete().eq('id', order.id);
        return { success: true, error: null };
    }

    const { error: itemsError } = await supabase.from('order_items').insert(allItemsToInsert);
    if (itemsError) {
        await supabase.from('orders').delete().eq('id', order.id); // Rollback
        return { success: false, error: itemsError };
    }

    return { success: true, error: null };
  }
}