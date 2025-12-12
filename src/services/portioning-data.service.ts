import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';
import { PortioningEvent, PortioningEventOutput } from '../models/db.models';

export interface PortioningForm {
  employee_id: string | null;
  notes: string | null;
  input_ingredient_id: string;
  input_lot_id: string;
  input_quantity: number;
  outputs: Partial<PortioningEventOutput>[];
}

@Injectable({
  providedIn: 'root'
})
export class PortioningDataService {
  private authService = inject(AuthService);

  async createPortioningEvent(form: PortioningForm) {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    // This should ideally be a single database transaction / RPC call
    // For now, we'll do it sequentially.
    try {
      // 1. Create the main event record
      const { data: event, error: eventError } = await supabase
        .from('portioning_events')
        .insert({
          user_id: userId,
          employee_id: form.employee_id,
          notes: form.notes,
          input_ingredient_id: form.input_ingredient_id,
          input_quantity: form.input_quantity,
          total_input_cost: 0, // This should be calculated based on lot cost
          yield_percentage: 0 // This should be calculated
        })
        .select()
        .single();
      
      if (eventError) throw eventError;

      // TODO: Calculate cost and yield and update the event record.

      // 2. Adjust stock for the input
      const { error: inputError } = await supabase.rpc('adjust_stock_by_lot', {
        p_ingredient_id: form.input_ingredient_id,
        p_quantity_change: -form.input_quantity,
        p_reason: `Porcionamento Evento #${event.id.slice(0, 8)}`,
        p_user_id: userId,
        p_lot_id_for_exit: form.input_lot_id,
        p_lot_number_for_entry: null,
        p_expiration_date_for_entry: null,
      });
      if (inputError) throw inputError;

      // 3. Create outputs and adjust stock for them
      for (const output of form.outputs) {
        if (!output.quantity_produced || output.quantity_produced <= 0) continue;

        if (output.output_type === 'YIELD' || output.output_type === 'BYPRODUCT') {
          if (!output.ingredient_id) continue;
          
          // Add stock for the output ingredient (creating a new lot)
          const { error: outputStockError } = await supabase.rpc('adjust_stock_by_lot', {
            p_ingredient_id: output.ingredient_id,
            p_quantity_change: output.quantity_produced,
            p_reason: `Rendimento Porcionamento #${event.id.slice(0, 8)}`,
            p_user_id: userId,
            p_lot_number_for_entry: `PORCIONADO-${event.id.slice(0,4)}`,
            p_lot_id_for_exit: null,
            p_expiration_date_for_entry: null,
          });
          if (outputStockError) throw outputStockError;
        }

        // Create the output record
        const { error: outputInsertError } = await supabase.from('portioning_event_outputs').insert({
          event_id: event.id,
          ingredient_id: output.ingredient_id,
          output_type: output.output_type,
          description: output.description,
          quantity_produced: output.quantity_produced,
          unit: output.unit
        });
        if (outputInsertError) throw outputInsertError;
      }

      return { success: true, error: null };

    } catch (error) {
      console.error("Error creating portioning event:", error);
      // Here would be rollback logic if this was a real transaction
      return { success: false, error };
    }
  }
}
