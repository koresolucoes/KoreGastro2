
import { Injectable, inject } from '@angular/core';
import { supabase } from './supabase-client';
import { AuthService } from './auth.service';
import { Requisition, RequisitionItem, RequisitionStatus, RequisitionTemplate } from '../models/db.models';
import { InventoryDataService } from './inventory-data.service';
import { InventoryStateService } from './inventory-state.service';
import { UnitContextService } from './unit-context.service';
import { OperationalAuthService } from './operational-auth.service';

export interface StationCostSummary {
    stationName: string;
    totalCost: number;
    requisitionCount: number;
    percentage: number;
}

@Injectable({
  providedIn: 'root'
})
export class RequisitionService {
  private authService = inject(AuthService);
  private operationalAuthService = inject(OperationalAuthService);
  private inventoryDataService = inject(InventoryDataService);
  private inventoryState = inject(InventoryStateService);
  private unitContextService = inject(UnitContextService);

  private getActiveUnitId(): string | null {
      return this.unitContextService.activeUnitId();
  }

  async loadTemplates(): Promise<void> {
      const userId = this.getActiveUnitId();
      if (!userId) return;

      const { data, error } = await supabase
          .from('requisition_templates')
          .select('*, template_items:requisition_template_items(*, ingredients(name, unit, cost))')
          .eq('user_id', userId);
      
      if (!error && data) {
          this.inventoryState.requisitionTemplates.set(data as any);
      }
  }

  async createTemplate(name: string, stationId: string | null, items: { ingredientId: string; quantity: number }[]): Promise<{ success: boolean; error: any }> {
      const userId = this.getActiveUnitId();
      if (!userId) return { success: false, error: { message: 'Active unit not found' } };

      const { data: template, error: tmplError } = await supabase
          .from('requisition_templates')
          .insert({
              user_id: userId,
              station_id: stationId,
              name: name
          })
          .select()
          .single();
      
      if (tmplError) return { success: false, error: tmplError };

      const itemsToInsert = items.map(item => ({
          template_id: template.id,
          ingredient_id: item.ingredientId,
          quantity: item.quantity
      }));

      const { error: itemsError } = await supabase.from('requisition_template_items').insert(itemsToInsert);

      if (itemsError) {
          await supabase.from('requisition_templates').delete().eq('id', template.id);
          return { success: false, error: itemsError };
      }

      await this.loadTemplates();
      return { success: true, error: null };
  }

  async deleteTemplate(templateId: string): Promise<{ success: boolean; error: any }> {
      const { error } = await supabase.from('requisition_templates').delete().eq('id', templateId);
      if (!error) {
          await this.loadTemplates();
      }
      return { success: !error, error };
  }

  async createRequisition(stationId: string | null, items: { ingredientId: string; quantity: number; unit: string }[], notes?: string, targetUnitId?: string): Promise<{ success: boolean; error: any }> {
    const userId = this.getActiveUnitId();
    // AUDIT: Capture the specific employee who requested this
    const employeeId = this.operationalAuthService.activeEmployee()?.id;

    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const { data: requisition, error: reqError } = await supabase
      .from('requisitions')
      .insert({
        user_id: userId,
        target_unit_id: targetUnitId || null,
        requested_by: employeeId || null, 
        station_id: stationId,
        status: 'PENDING',
        notes: notes
      })
      .select()
      .single();

    if (reqError) return { success: false, error: reqError };

    const itemsToInsert = items.map(item => ({
      user_id: userId,
      requisition_id: requisition.id,
      ingredient_id: item.ingredientId,
      quantity_requested: item.quantity,
      unit: item.unit
    }));

    const { error: itemsError } = await supabase.from('requisition_items').insert(itemsToInsert);

    if (itemsError) {
      await supabase.from('requisitions').delete().eq('id', requisition.id);
      return { success: false, error: itemsError };
    }

    return { success: true, error: null };
  }

  async updateRequisitionStatus(id: string, status: RequisitionStatus, items?: { id: string, quantity_delivered: number }[]): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    if (status === 'DELIVERED' && items) {
      return this.processDelivery(id, items, userId);
    }

    if (status === 'IN_TRANSIT' && items) {
       // Matriz is dispatching the items. We need to DEDUCT from their inventory now.
       for (const item of items) {
          // Temporarily save what the matrix is sending in 'quantity_delivered' 
          // (which really means 'quantity_dispatched' in this state)
          await supabase
            .from('requisition_items')
            .update({ quantity_delivered: item.quantity_delivered })
            .eq('id', item.id);
            
          // Deduct from MATRIZ local inventory. We assume the passed 'id' is the requisition_item id
          // We need the ingredientId to deduct stock
          const { data: reqItem } = await supabase.from('requisition_items').select('ingredient_id').eq('id', item.id).single();
          if (reqItem) {
              await this.inventoryDataService.adjustIngredientStock({
                 ingredientId: reqItem.ingredient_id,
                 quantityChange: -item.quantity_delivered,
                 reason: `Expedição para Transferência (Req #${id.slice(0,8)})`
              });
          }
       }
    }

    // AUDIT: Capture who performed the status change (e.g., Rejection)
    const employeeId = this.operationalAuthService.activeEmployee()?.id;

    const { error } = await supabase
      .from('requisitions')
      .update({ 
          status, 
          processed_at: new Date().toISOString(),
          processed_by: employeeId || null
      })
      .eq('id', id);

    return { success: !error, error };
  }

  private async processDelivery(requisitionId: string, itemsDelivered: { id: string, quantity_delivered: number }[], userId: string): Promise<{ success: boolean; error: any }> {
    for (const item of itemsDelivered) {
      await supabase
        .from('requisition_items')
        .update({ quantity_delivered: item.quantity_delivered })
        .eq('id', item.id);
    }

    const { data: requisition, error: fetchError } = await supabase
      .from('requisitions')
      .select('*, requisition_items(*)')
      .eq('id', requisitionId)
      .single();

    if (fetchError || !requisition) return { success: false, error: fetchError || { message: 'Requisition not found' } };

    const isExternalTransfer = requisition.target_unit_id !== null && requisition.target_unit_id !== undefined;

    for (const item of requisition.requisition_items) {
      const qty = item.quantity_delivered || 0;
      if (qty > 0) {
        
        if (isExternalTransfer) {
             // For external transfers, deduct stock from Matriz and add to Local Main Inventory
             // Currently, both operations need to happen across different stores.
             // Because InventoryService uses RLS heavily, we might need a dedicated RPC to do this securely,
             // or just trust the active user session if they have permissions.
             
             // 1. ADD STUFF TO TARGET RESTAURANT (The one receiving)
             await this.inventoryDataService.adjustIngredientStock({
                ingredientId: item.ingredient_id,
                quantityChange: qty, // ADDING stock!
                reason: `Entrada via TRF Matriz (Req #${requisitionId.slice(0,8)})`
             });
             // We do NOT add to `station_stocks` unless explicitly asked down the road.
        } else {
            // Internal Transfer Logging (Main Inventory -> Station)
            const deductResult = await this.inventoryDataService.adjustIngredientStock({
                ingredientId: item.ingredient_id,
                quantityChange: -qty,
                reason: `Transferência O.I para Praça (Req #${requisitionId.slice(0,8)})`
            });

            if (!deductResult.success) {
                console.error(`Failed to deduct stock for item ${item.id}`, deductResult.error);
            }

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
    }

    // AUDIT: Capture who performed the delivery
    const employeeId = this.operationalAuthService.activeEmployee()?.id;

    const { error: updateError } = await supabase
        .from('requisitions')
        .update({ 
            status: 'DELIVERED', 
            processed_at: new Date().toISOString(),
            processed_by: employeeId || null
        })
        .eq('id', requisitionId);

    return { success: !updateError, error: updateError };
  }

  // --- COMMISSARY / CROSS-TENANT ---
  async getInboxRequisitions(startDate: string, endDate: string) {
      const activeUnitId = this.getActiveUnitId();
      if (!activeUnitId) return { data: null, error: { message: 'Unit not found' } };

      const { data, error } = await supabase
          .from('requisitions')
          .select(`
            id, 
            status, 
            notes, 
            created_at, 
            user_id,
            origin_store:stores!requisitions_user_id_fkey(name),
            requisition_items (
              id,
              quantity_requested,
              quantity_delivered,
              unit,
              ingredients (id, name, type)
            )
          `)
          .eq('target_unit_id', activeUnitId)
          .gte('created_at', new Date(`${startDate}T00:00:00`).toISOString())
          .lte('created_at', new Date(`${endDate}T23:59:59`).toISOString())
          .order('created_at', { ascending: false });

      return { data, error };
  }

  // --- REPORTING ---
  async getRequisitionStats(startDate: string, endDate: string): Promise<StationCostSummary[]> {
      const userId = this.getActiveUnitId();
      if (!userId) return [];

      // Fetch delivered requisitions with items and ingredient details
      const { data, error } = await supabase
          .from('requisitions')
          .select(`
            id, 
            station_id, 
            stations(name), 
            requisition_items(
                quantity_delivered, 
                ingredients(cost)
            )
          `)
          .eq('user_id', userId)
          .eq('status', 'DELIVERED')
          .gte('created_at', new Date(`${startDate}T00:00:00`).toISOString())
          .lte('created_at', new Date(`${endDate}T23:59:59`).toISOString());

      if (error || !data) {
          console.error("Error fetching stats:", error);
          return [];
      }

      const summaryMap = new Map<string, StationCostSummary>();
      let grandTotal = 0;

      data.forEach(req => {
          // Fix for TS2339: Explicitly handle potential array return or single object
          const stationData = req.stations as any;
          const stationName = (Array.isArray(stationData) ? stationData[0]?.name : stationData?.name) || 'Estação Excluída';
          
          let reqCost = 0;
          req.requisition_items?.forEach((item: any) => {
              const qty = item.quantity_delivered || 0;
              const cost = item.ingredients?.cost || 0;
              reqCost += qty * cost;
          });

          if (!summaryMap.has(stationName)) {
              summaryMap.set(stationName, { stationName, totalCost: 0, requisitionCount: 0, percentage: 0 });
          }
          const current = summaryMap.get(stationName)!;
          current.totalCost += reqCost;
          current.requisitionCount += 1;
          grandTotal += reqCost;
      });

      return Array.from(summaryMap.values()).map(s => ({
          ...s,
          percentage: grandTotal > 0 ? (s.totalCost / grandTotal) * 100 : 0
      })).sort((a, b) => b.totalCost - a.totalCost);
  }
}
