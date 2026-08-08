
import { Injectable, inject } from '@angular/core';
import { PurchaseOrder, PurchaseOrderStatus, PurchaseOrderItem } from '../models/db.models';
import { AuthService } from './auth.service';
import { InventoryDataService } from './inventory-data.service';
import { ApiClientService } from './api-client.service';
import { supabase } from './supabase-client';
import { UnitContextService } from './unit-context.service';

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
  private unitContextService = inject(UnitContextService);
  private apiClient = inject(ApiClientService);

  async createPurchaseOrder(
    orderData: { supplier_id: string | null; status: PurchaseOrderStatus; notes: string },
    items: FormItem[],
    employeeId: string | null // AUDIT: Created By
  ): Promise<{ success: boolean; error: any }> {
    const itemsToInsert = items.map(item => ({
      ingredient_id: item.ingredient_id,
      quantity: item.quantity,
      cost: item.cost,
      lot_number: item.lot_number,
      expiration_date: item.expiration_date,
    }));

    const { error } = await this.apiClient.post('/api/v2/purchase-orders', {
        ...orderData,
        created_by_employee_id: employeeId,
        items: itemsToInsert
    });

    return { success: !error, error };
  }
  
  async updatePurchaseOrder(
    orderId: string,
    orderData: { supplier_id: string | null; status: PurchaseOrderStatus; notes: string },
    items: FormItem[]
  ): Promise<{ success: boolean; error: any }> {
    const itemsToInsert = items.map(item => ({
      ingredient_id: item.ingredient_id,
      quantity: item.quantity,
      cost: item.cost,
      lot_number: item.lot_number,
      expiration_date: item.expiration_date,
    }));

    const { error } = await this.apiClient.put(`/api/v2/purchase-orders?id=${orderId}`, {
        ...orderData,
        items: itemsToInsert
    });
    
    return { success: !error, error };
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
          employeeId: employeeId,
          unitCostForEntry: item.cost // Furo 2: Passar custo unitário para o lote
      });
      if (!result.success) {
        return { success: false, error: { message: `Falha ao atualizar o estoque para o item ID ${item.ingredient_id}: ${result.error?.message}` } };
      }
      
      if (item.cost > 0) {
        // Calculate Weighted Average Cost (Custo Médio Ponderado)
        const { data: currentIngredient } = await supabase
            .from('ingredients')
            .select('stock, cost')
            .eq('id', item.ingredient_id)
            .single();
            
        if (currentIngredient) {
            const currentStock = currentIngredient.stock || 0;
            const currentTotalValue = currentStock * (currentIngredient.cost || 0);
            const newPurchaseValue = item.quantity * item.cost;
            const newTotalStock = currentStock + item.quantity;
            
            let newUnitCost = item.cost; // Fallback
            if (newTotalStock > 0) {
                newUnitCost = (currentTotalValue + newPurchaseValue) / newTotalStock;
            }

            const { error: costUpdateError } = await supabase
              .from('ingredients')
              .update({ cost: newUnitCost })
              .eq('id', item.ingredient_id);
            
            if (costUpdateError) {
              console.error(`Failed to update cost for ingredient ${item.ingredient_id}:`, costUpdateError);
            }
        }
      }
    }
    
    // AUDIT: Update status AND received_by_employee_id
    const { error: updateError } = await this.apiClient.put(`/api/v2/purchase-orders?id=${order.id}`, { 
        status: 'Recebida',
        received_by_employee_id: employeeId
    });
        
    if (updateError) return { success: false, error: updateError };

    return { success: true, error: null };
  }
  
  async deletePurchaseOrder(orderId: string): Promise<{ success: boolean; error: any }> {
    const { error } = await this.apiClient.delete(`/api/v2/purchase-orders?id=${orderId}`);
    return { success: !error, error };
  }
}
