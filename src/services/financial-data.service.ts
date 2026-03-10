import { Injectable, inject } from '@angular/core';
import { supabase } from './supabase-client';
import { AuthService } from './auth.service';
import { UnitContextService } from './unit-context.service';
import { FinancialCategory, AssetDepreciation, DailyCmv, EquipmentRepair, EquipmentPurchase } from '../models/db.models';

export interface DailyDreResult {
  date: string;
  gross_revenue: number;
  cogs: number;
  gross_profit: number;
  operating_expenses: number;
  net_profit: number;
}

@Injectable({
  providedIn: 'root',
})
export class FinancialDataService {
  private authService = inject(AuthService);
  private unitContextService = inject(UnitContextService);

  private getActiveUnitId(): string | null {
    return this.unitContextService.activeUnitId();
  }

  async getFinancialCategories(): Promise<{ data: FinancialCategory[] | null; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { data: null, error: { message: 'Active unit not found' } };

    return supabase
      .from('financial_categories')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('name');
  }

  async getDailyDre(startDate: string, endDate: string): Promise<{ data: DailyDreResult[] | null; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { data: null, error: { message: 'Active unit not found' } };

    return supabase.rpc('get_daily_dre', {
      p_user_id: userId,
      p_start_date: startDate,
      p_end_date: endDate
    });
  }

  async getDailyCmv(startDate: string, endDate: string): Promise<{ data: DailyCmv[] | null; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { data: null, error: { message: 'Active unit not found' } };

    return supabase
      .from('daily_cmv')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false });
  }

  async calculateDailyCmv(date: string): Promise<{ data: any; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { data: null, error: { message: 'Active unit not found' } };

    return supabase.rpc('calculate_daily_cmv', {
      p_user_id: userId,
      p_date: date
    });
  }

  async getEquipmentRepairs(): Promise<{ data: EquipmentRepair[] | null; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { data: null, error: { message: 'Active unit not found' } };

    return supabase
      .from('equipment_repairs')
      .select('*')
      .eq('user_id', userId)
      .order('repair_date', { ascending: false });
  }

  async logEquipmentRepair(repair: Partial<EquipmentRepair>): Promise<{ data: EquipmentRepair | null; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { data: null, error: { message: 'Active unit not found' } };

    return supabase
      .from('equipment_repairs')
      .insert({ ...repair, user_id: userId })
      .select()
      .single();
  }

  async getEquipmentPurchases(): Promise<{ data: EquipmentPurchase[] | null; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { data: null, error: { message: 'Active unit not found' } };

    return supabase
      .from('equipment_purchases')
      .select('*')
      .eq('user_id', userId)
      .order('purchase_date', { ascending: false });
  }

  async logEquipmentPurchase(purchase: Partial<EquipmentPurchase>): Promise<{ data: EquipmentPurchase | null; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { data: null, error: { message: 'Active unit not found' } };

    return supabase
      .from('equipment_purchases')
      .insert({ ...purchase, user_id: userId })
      .select()
      .single();
  }
}
