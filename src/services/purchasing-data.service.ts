
import { Injectable, inject } from '@angular/core';
import { PurchaseOrder, PurchaseOrderStatus, PurchaseOrderItem } from '../models/db.models';
import { AuthService } from './auth.service';
import { InventoryDataService } from './inventory-data.service';
import { supabase } from './supabase-client';

type FormItem = {
    ingredient_id: string;
    quantity: number;
    cost: number;
};

@Injectable({
  providedIn: 'root',
})
export class PurchasingDataService {
  private authService = inject(AuthService);
  private inventoryDataService = inject(InventoryDataService);

  async createPurchaseOrder(
    orderData: { supplier_id: string | null; status: PurchaseOrderStatus; notes: string },
    items: FormItem[]
  ): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const { data: order, error: orderError } = await supabase
      .from('purchase_orders')
      .insert({ ...orderData, user_id: userId })
      .select('id')
      .single();

    if (orderError) return { success: false, error: orderError };

    const itemsToInsert = items.map(item => ({
      purchase_order_id: order.id,
      ingredient_id: item.ingredient_id,
      quantity: item.quantity,
      cost: item.cost,
      user_id: userId,
    }));

    const { error: itemsError } = await supabase.from('purchase_order_items').insert(itemsToInsert);
    if (itemsError) {
      await supabase.from('purchase_orders').delete().eq('id', order.id);
      return { success: false, error: itemsError };
    }

    return { success: true, error: null };
  }
  
  async updatePurchaseOrder(
    orderId: string,
    orderData: { supplier_id: string | null; status: PurchaseOrderStatus; notes: string },
    items: FormItem[]
  ): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    
    const { error: orderError } = await supabase.from('purchase_orders').update(orderData).eq('id', orderId);
    if (orderError) return { success: false, error: orderError };

    await supabase.from('purchase_order_items').delete().eq('purchase_order_id', orderId);

    const itemsToInsert = items.map(item => ({
      purchase_order_id: orderId,
      ingredient_id: item.ingredient_id,
      quantity: item.quantity,
      cost: item.cost,
      user_id: userId,
    }));

    const { error: itemsError } = await supabase.from('purchase_order_items').insert(itemsToInsert);
    if (itemsError) return { success: false, error: itemsError };
    
    return { success: true, error: null };
  }

  async receivePurchaseOrder(order: PurchaseOrder): Promise<{ success: boolean; error: any }> {
    if (!order.purchase_order_items || order.purchase_order_items.length === 0) {
      return { success: false, error: { message: 'Ordem de compra não contém itens.' } };
    }

    const supplierName = order.suppliers?.name;

    for (const item of order.purchase_order_items) {
      const reason = `Compra de Fornecedor${supplierName ? ` - ${supplierName}` : ''}`;
      const result = await this.inventoryDataService.adjustIngredientStock(item.ingredient_id, item.quantity, reason, null);
      if (!result.success) {
        return { success: false, error: { message: `Falha ao atualizar o estoque para o item ID ${item.ingredient_id}: ${result.error?.message}` } };
      }
    }
    
    const { error: updateError } = await supabase.from('purchase_orders').update({ status: 'Recebida' }).eq('id', order.id);
    if (updateError) return { success: false, error: updateError };

    return { success: true, error: null };
  }
  
  async deletePurchaseOrder(orderId: string): Promise<{ success: boolean; error: any }> {
    await supabase.from('purchase_order_items').delete().eq('purchase_order_id', orderId);
    const { error } = await supabase.from('purchase_orders').delete().eq('id', orderId);
    return { success: !error, error };
  }
}
