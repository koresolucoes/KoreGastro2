import { Injectable, inject } from '@angular/core';
import { supabase } from './supabase-client';
import { PayrollAdjustment } from '../models/db.models';
import { UnitContextService } from './unit-context.service';

@Injectable({
  providedIn: 'root'
})
export class PayrollService {
  private unitContextService = inject(UnitContextService);

  private getActiveUnitId(): string | null {
      return this.unitContextService.activeUnitId();
  }

  async getAdjustments(period: string): Promise<{ data: PayrollAdjustment[]; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { data: [], error: { message: 'User not authenticated' } };

    const { data, error } = await supabase
        .from('payroll_adjustments')
        .select('*')
        .eq('user_id', userId)
        .eq('period', period);
    
    return { data: data || [], error };
  }

  async addAdjustment(adjustment: Partial<PayrollAdjustment>): Promise<{ success: boolean; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const { error } = await supabase
        .from('payroll_adjustments')
        .insert({
            ...adjustment,
            user_id: userId
        });
    
    return { success: !error, error };
  }

  async deleteAdjustment(id: string): Promise<{ success: boolean; error: any }> {
      const { error } = await supabase.from('payroll_adjustments').delete().eq('id', id);
      return { success: !error, error };
  }
}
