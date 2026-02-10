
import { Injectable, inject } from '@angular/core';
import { PurchaseOrder, PurchaseOrderStatus, PurchaseOrderItem } from '../models/db.models';
import { AuthService } from './auth.service';
import { InventoryDataService } from './inventory-data.service';
import { supabase } from './supabase-client';

type FormItem = {
    id: string; // Can be temp id
    ingredient_id: string;
    quantity: number;
    cost: number;
    name: string;
    unit: string;
    lot_number: string | null;
    expiration_date: string | null;
};

@Injectable({
  providedIn: 'root',
})
export class PurchasingDataService {
  private authService = inject(AuthService);
  private inventoryDataService = inject(InventoryDataService);

  async createPurchaseOrder(
    orderData: { supplier_id: string | null; status: PurchaseOrderStatus; notes: string },
    items: FormItem[],
    employeeId: string | null // AUDIT: Created By
  ): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const { data: order, error: orderError } = await supabase
      .from('purchase_orders')
      .insert({ 
          ...orderData, 
          user_id: userId,
          created_by_employee_id: employeeId 
      })
      .select('id')
      .single();

    if (orderError) return { success: false, error: orderError };

    const itemsToInsert = items.map(item => ({
      purchase_order_id: order.id,
      ingredient_id: item.ingredient_id,
      quantity: item.quantity,
      cost: item.cost,
      lot_number: item.lot_number,
      expiration_date: item.expiration_date,
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
      lot_number: item.lot_number,
      expiration_date: item.expiration_date,
      user_id: userId,
    }));

    if (itemsToInsert.length > 0) {
      const { error: itemsError } = await supabase.from('purchase_order_items').insert(itemsToInsert);
      if (itemsError) return { success: false, error: itemsError };
    }
    
    return { success: true, error: null };
  }

  async receivePurchaseOrder(order: PurchaseOrder, employeeId: string | null): Promise<{ success: boolean; error: any }> {
    if (!order.purchase_order_items || order.purchase_order_items.length === 0) {
      return { success: false, error: { message: 'Ordem de compra não contém itens.' } };
    }

    const supplierName = order.suppliers?.name;

    for (const item of order.purchase_order_items) {
      const reason = `Compra de Fornecedor${supplierName ? ` - ${supplierName}` : ''}`;
      // AUDIT: Pass employeeId to stock adjustment
      const result = await this.inventoryDataService.adjustIngredientStock({
          ingredientId: item.ingredient_id,
          quantityChange: item.quantity,
          reason: reason,
          lotNumberForEntry: item.lot_number,
          expirationDateForEntry: item.expiration_date,
          employeeId: employeeId
      });
      if (!result.success) {
        return { success: false, error: { message: `Falha ao atualizar o estoque para o item ID ${item.ingredient_id}: ${result.error?.message}` } };
      }
      
      if (item.cost > 0) {
        const { error: costUpdateError } = await supabase
          .from('ingredients')
          .update({ cost: item.cost })
          .eq('id', item.ingredient_id);
        
        if (costUpdateError) {
          console.error(`Failed to update cost for ingredient ${item.ingredient_id}:`, costUpdateError);
        }
      }
    }
    
    // AUDIT: Update status AND received_by_employee_id
    const { error: updateError } = await supabase
        .from('purchase_orders')
        .update({ 
            status: 'Recebida',
            received_by_employee_id: employeeId
        })
        .eq('id', order.id);
        
    if (updateError) return { success: false, error: updateError };

    return { success: true, error: null };
  }
  
  async deletePurchaseOrder(orderId: string): Promise<{ success: boolean; error: any }> {
    await supabase.from('purchase_order_items').delete().eq('purchase_order_id', orderId);
    const { error } = await supabase.from('purchase_orders').delete().eq('id', orderId);
    return { success: !error, error };
  }
}
