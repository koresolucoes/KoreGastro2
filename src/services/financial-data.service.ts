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

export interface LossReportItem {
    id: string;
    date: string;
    type: 'CANCELLATION' | 'INVENTORY_LOSS';
    description: string;
    quantity: number;
    totalCost: number;
    employeeName?: string;
    reason: string;
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

  async getLossReport(startDate: string, endDate: string): Promise<{ data: LossReportItem[] | null; error: any }> {
      const userId = this.getActiveUnitId();
      if (!userId) return { data: null, error: { message: 'Active unit not found' } };
      
      try {
          const items: LossReportItem[] = [];
          
          // 1. Get cancelled order items
          const { data: cancelledOrders, error: ordersError } = await supabase
              .from('orders')
              .select('id, timestamp, status, cancelled_by, notes, order_items(id, name, quantity, price, recipe_id)')
              .eq('user_id', userId)
              .gte('timestamp', `${startDate}T00:00:00.000Z`)
              .lte('timestamp', `${endDate}T23:59:59.999Z`)
              .eq('status', 'CANCELLED');
              
          if (!ordersError && cancelledOrders) {
              for (const order of cancelledOrders) {
                  for (const item of (order.order_items || [])) {
                        items.push({
                            id: item.id,
                            date: order.timestamp,
                            type: 'CANCELLATION',
                            description: `Pedido Cancelado - ${item.name}`,
                            quantity: item.quantity,
                            totalCost: (item.price * item.quantity) * 0.35, // Estimated CMV 35% if no actual cost is present
                            reason: order.notes || 'Cancelado',
                            employeeName: order.cancelled_by ? 'Operador Caixa' : 'Sistema'
                        });
                  }
              }
          }
          
          // 2. Get inventory loss
          const { data: adjustments, error: adjError } = await supabase
              .from('inventory_adjustments')
              .select('id, created_at, quantity_change, total_value, reason, ingredients(name), employees(name)')
              .eq('user_id', userId)
              .gte('created_at', `${startDate}T00:00:00.000Z`)
              .lte('created_at', `${endDate}T23:59:59.999Z`)
              .lt('quantity_change', 0);
              
          if (!adjError && adjustments) {
              for (const adj of adjustments) {
                   if (adj.reason !== 'CONSUMO_VENDA' && adj.reason !== 'Mise En Place') {
                        items.push({
                            id: adj.id,
                            date: adj.created_at,
                            type: 'INVENTORY_LOSS',
                            description: `Ajuste Estoque - ${(adj as any).ingredients?.name || 'Item'}`,
                            quantity: Math.abs(adj.quantity_change),
                            totalCost: Math.abs(adj.total_value),
                            reason: adj.reason || 'Ajuste Negativo',
                            employeeName: (adj as any).employees?.name || 'Sistema'
                        });
                   }
              }
          }
          
          items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          
          return { data: items, error: null };
      } catch (err) {
          return { data: null, error: err };
      }
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
