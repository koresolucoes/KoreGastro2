
import { Injectable, inject } from '@angular/core';
import { supabase } from './supabase-client';
import { AuthService } from './auth.service';
import { Requisition, RequisitionItem, RequisitionStatus } from '../models/db.models';
import { InventoryDataService } from './inventory-data.service';

@Injectable({
  providedIn: 'root'
})
export class RequisitionService {
  private authService = inject(AuthService);
  private inventoryDataService = inject(InventoryDataService);

  async createRequisition(stationId: string, items: { ingredientId: string; quantity: number; unit: string }[], notes?: string): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    // 1. Create Header
    const { data: requisition, error: reqError } = await supabase
      .from('requisitions')
      .insert({
        user_id: userId,
        requested_by: null, // Ideally we link this to the logged in employee if available
        station_id: stationId,
        status: 'PENDING',
        notes: notes
      })
      .select()
      .single();

    if (reqError) return { success: false, error: reqError };

    // 2. Create Items
    const itemsToInsert = items.map(item => ({
      user_id: userId,
      requisition_id: requisition.id,
      ingredient_id: item.ingredientId,
      quantity_requested: item.quantity,
      unit: item.unit
    }));

    const { error: itemsError } = await supabase.from('requisition_items').insert(itemsToInsert);

    if (itemsError) {
      // Rollback header if items fail (basic cleanup)
      await supabase.from('requisitions').delete().eq('id', requisition.id);
      return { success: false, error: itemsError };
    }

    return { success: true, error: null };
  }

  async updateRequisitionStatus(id: string, status: RequisitionStatus, items?: { id: string, quantity_delivered: number }[]): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    // If we are delivering, we need to process stock movements
    if (status === 'DELIVERED' && items) {
      return this.processDelivery(id, items, userId);
    }

    // Just a status update (e.g. REJECTED or APPROVED without immediate delivery)
    const { error } = await supabase
      .from('requisitions')
      .update({ status, processed_at: new Date().toISOString() })
      .eq('id', id);

    return { success: !error, error };
  }

  private async processDelivery(requisitionId: string, itemsDelivered: { id: string, quantity_delivered: number }[], userId: string): Promise<{ success: boolean; error: any }> {
    // 1. Update Items with delivered quantities
    for (const item of itemsDelivered) {
      await supabase
        .from('requisition_items')
        .update({ quantity_delivered: item.quantity_delivered })
        .eq('id', item.id);
    }

    // 2. Fetch full requisition data to process stock
    const { data: requisition, error: fetchError } = await supabase
      .from('requisitions')
      .select('*, requisition_items(*)')
      .eq('id', requisitionId)
      .single();

    if (fetchError || !requisition) return { success: false, error: fetchError || { message: 'Requisition not found' } };

    // 3. Move Stock (Deduct from Central, Add to Station)
    for (const item of requisition.requisition_items) {
      const qty = item.quantity_delivered || 0;
      if (qty > 0) {
        // A. Deduct from Central (Ingredients)
        // We use the general adjustment logic. 
        // Note: For strict lot control, we might need a UI to select which LOT is being picked. 
        // For now, we use a general FIFO-like deduction via the service if supported, or just simple stock adjustment.
        const deductResult = await this.inventoryDataService.adjustIngredientStock({
            ingredientId: item.ingredient_id,
            quantityChange: -qty,
            reason: `Transferência para Estação (Req #${requisitionId.slice(0,8)})`
        });

        if (!deductResult.success) {
            console.error(`Failed to deduct stock for item ${item.id}`, deductResult.error);
            // Continue or abort? Ideally transactional. We continue for this MVP.
        }

        // B. Add to Station Stock
        // Check if record exists
        const { data: existingStock } = await supabase
            .from('station_stocks')
            .select('*')
            .eq('station_id', requisition.station_id)
            .eq('ingredient_id', item.ingredient_id)
            .single();

        if (existingStock) {
            await supabase.from('station_stocks')
                .update({ 
                    quantity: existingStock.quantity + qty, 
                    last_restock_date: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingStock.id);
        } else {
            await supabase.from('station_stocks').insert({
                user_id: userId,
                station_id: requisition.station_id,
                ingredient_id: item.ingredient_id,
                quantity: qty,
                last_restock_date: new Date().toISOString()
            });
        }
      }
    }

    // 4. Mark Requisition as Delivered
    const { error: updateError } = await supabase
        .from('requisitions')
        .update({ status: 'DELIVERED', processed_at: new Date().toISOString() })
        .eq('id', requisitionId);

    return { success: !updateError, error: updateError };
  }
}
