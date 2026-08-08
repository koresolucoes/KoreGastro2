
import { Injectable, inject } from '@angular/core';
import { PurchaseOrder, PurchaseOrderStatus, PurchaseOrderItem } from '../models/db.models';
import { AuthService } from './auth.service';
import { InventoryDataService } from './inventory-data.service';
import { ApiClientService } from './api-client.service';
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
    const { error } = await this.apiClient.post(`/api/v2/purchase-orders/receive`, { 
        orderId: order.id,
        employeeId
    });
        
    return { success: !error, error };
  }
  
  async deletePurchaseOrder(orderId: string): Promise<{ success: boolean; error: any }> {
    const { error } = await this.apiClient.delete(`/api/v2/purchase-orders?id=${orderId}`);
    return { success: !error, error };
  }
}
