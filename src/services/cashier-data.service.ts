

import { Injectable, inject } from '@angular/core';
import { supabase } from './supabase-client';
import { AuthService } from './auth.service';
import { SupabaseStateService } from './supabase-state.service';
import { InventoryDataService } from './inventory-data.service';
import { PricingService } from './pricing.service';
import { Order, OrderItem, Recipe, Transaction, TransactionType, CashierClosing, OrderItemStatus, DiscountType } from '../models/db.models';
import { Payment } from '../components/cashier/cashier.component';

interface CartItem {
  recipe: Recipe;
  quantity: number;
  notes: string;
  effectivePrice: number;
  originalPrice: number;
  discountType: DiscountType | null;
  discountValue: number | null;
}

export interface ReportData {
  // Sales Report
  grossRevenue?: number;
  totalOrders?: number;
  averageTicket?: number;
  paymentSummary?: { method: string; total: number; count: number }[];
  // Items Report
  bestSellingItems?: { name: string; quantity: number; revenue: number; totalCost: number; totalProfit: number; profitMargin: number; }[];
  // Financial Report
  cogs?: number;
  grossProfit?: number;
  totalExpenses?: number;
  netProfit?: number;
}


@Injectable({
  providedIn: 'root',
})
export class CashierDataService {
  private authService = inject(AuthService);
  private stateService = inject(SupabaseStateService);
  private inventoryDataService = inject(InventoryDataService);
  private pricingService = inject(PricingService);

  async generateReportData(startDateStr: string, endDateStr: string, reportType: 'sales' | 'items' | 'financial'): Promise<ReportData> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) throw new Error('User not authenticated');

    const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
    const startDate = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);

    const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number);
    const endDate = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);
    
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('user_id', userId)
      .eq('is_completed', true)
      .gte('completed_at', startDate.toISOString())
      .lte('completed_at', endDate.toISOString());

    if (error) throw error;
    if (!orders) return {};
    
    const recipeCosts = this.stateService.recipeCosts();

    const calculateCOGS = (orderList: Order[]): number => {
        return orderList
            .flatMap(o => o.order_items)
            .reduce((sum, item) => {
                const cost = recipeCosts.get(item.recipe_id)?.totalCost ?? 0;
                return sum + (cost * item.quantity);
            }, 0);
    };

    if (reportType === 'sales') {
        const { data: transactions, error: tError } = await supabase
            .from('transactions')
            .select('*')
            .eq('user_id', userId)
            .eq('type', 'Receita')
            .gte('date', startDate.toISOString())
            .lte('date', endDate.toISOString());
        
        if (tError) throw tError;

        const grossRevenue = (transactions || []).reduce((sum, t) => sum + t.amount, 0);
        const totalOrders = orders.length;
        const averageTicket = totalOrders > 0 ? grossRevenue / totalOrders : 0;
        
        const paymentSummaryMap = new Map<string, { total: number; count: number }>();
        const paymentMethodRegex = /\(([^)]+)\)/;

        for (const t of (transactions || [])) {
            const match = t.description.match(paymentMethodRegex);
            const method = match ? match[1] : 'Outros';
            const current = paymentSummaryMap.get(method) || { total: 0, count: 0 };
            current.total += t.amount;
            current.count++;
            paymentSummaryMap.set(method, current);
        }

        return {
            grossRevenue,
            totalOrders,
            averageTicket,
            paymentSummary: Array.from(paymentSummaryMap.entries()).map(([method, data]) => ({ method, ...data })),
        };
    } else if (reportType === 'items') {
        const itemMap = new Map<string, { name: string; quantity: number; revenue: number; totalCost: number }>();
        
        for (const order of orders) {
            for (const item of order.order_items) {
                const existing = itemMap.get(item.recipe_id) || { name: item.name, quantity: 0, revenue: 0, totalCost: 0 };
                const itemCost = recipeCosts.get(item.recipe_id)?.totalCost ?? 0;
                existing.quantity += item.quantity;
                existing.revenue += item.price * item.quantity;
                existing.totalCost += itemCost * item.quantity;
                itemMap.set(item.recipe_id, existing);
            }
        }
        
        const bestSellingItems = Array.from(itemMap.values()).map(item => {
            const totalProfit = item.revenue - item.totalCost;
            const profitMargin = item.revenue > 0 ? (totalProfit / item.revenue) * 100 : 0;
            return { ...item, totalProfit, profitMargin };
        }).sort((a, b) => b.totalProfit - a.totalProfit);

        return { bestSellingItems };
    } else { // financial report
        const { data: transactions, error: tError } = await supabase
            .from('transactions')
            .select('*')
            .eq('user_id', userId)
            .gte('date', startDate.toISOString())
            .lte('date', endDate.toISOString());
        
        if (tError) throw tError;
        
        const grossRevenue = (transactions || []).filter(t => t.type === 'Receita').reduce((sum, t) => sum + t.amount, 0);
        const totalExpenses = (transactions || []).filter(t => t.type === 'Despesa').reduce((sum, t) => sum + t.amount, 0);
        const cogs = calculateCOGS(orders);
        const grossProfit = grossRevenue - cogs;
        const netProfit = grossProfit - totalExpenses;

        return { grossRevenue, totalOrders: orders.length, cogs, grossProfit, totalExpenses, netProfit };
    }
  }
  
  async finalizeQuickSalePayment(cart: CartItem[], payments: Payment[]): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({ table_number: 0, order_type: 'QuickSale', is_completed: true, completed_at: new Date().toISOString(), user_id: userId })
        .select()
        .single();
    
    if (orderError) return { success: false, error: orderError };

    const orderItems: Omit<OrderItem, 'id' | 'created_at' | 'user_id'>[] = cart.map(item => ({
      order_id: order.id,
      recipe_id: item.recipe.id,
      name: item.recipe.name,
      quantity: item.quantity,
      price: item.effectivePrice,
      original_price: item.originalPrice,
      discount_type: item.discountType,
      discount_value: item.discountValue,
      notes: item.notes,
      status: 'SERVIDO' as OrderItemStatus,
      station_id: 'none', // Not relevant for quick sale
      group_id: null,
      status_timestamps: { 'SERVIDO': new Date().toISOString() },
    }));

    const orderItemsWithUserId = orderItems.map(item => ({...item, user_id: userId}));

    const { error: itemsError } = await supabase.from('order_items').insert(orderItemsWithUserId);
    if (itemsError) {
        await supabase.from('orders').delete().eq('id', order.id);
        return { success: false, error: itemsError };
    }

    const cashierEmployeeId = this.stateService.employees().find(e => e.role === 'Caixa')?.id ?? null;

    const transactionsToInsert: Partial<Transaction>[] = payments.map(p => ({
      description: `Receita Pedido #${order.id.slice(0, 8)} (${p.method})`,
      type: 'Receita' as TransactionType,
      amount: p.amount,
      user_id: userId,
      employee_id: cashierEmployeeId,
    }));
    
    if (transactionsToInsert.length > 0) {
      const { error: transactionError } = await supabase.from('transactions').insert(transactionsToInsert);
      if (transactionError) {
          // don't roll back, payment was made
          return { success: false, error: transactionError };
      }
    }

    const { success, error } = await this.inventoryDataService.deductStockForOrderItems(orderItemsWithUserId as OrderItem[], order.id);
    if (!success) {
        console.error('Stock deduction failed for quick sale', error);
    }
    
    await this.stateService.refreshDashboardAndCashierData();
    
    return { success: true, error: null };
  }

  async logTransaction(description: string, amount: number, type: 'Despesa'): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const cashierEmployeeId = this.stateService.employees().find(e => e.role === 'Caixa')?.id ?? null;

    const { error } = await supabase.from('transactions').insert({
        description,
        amount,
        type,
        user_id: userId,
        employee_id: cashierEmployeeId
    });
    
    return { success: !error, error };
  }
  
  async closeCashier(closingData: Omit<CashierClosing, 'id' | 'closed_at' | 'user_id'>): Promise<{ success: boolean; error: any, data: CashierClosing | null }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' }, data: null };
    
    const { data, error } = await supabase
        .from('cashier_closings')
        .insert({ ...closingData, user_id: userId })
        .select()
        .single();
    
    if (error) return { success: false, error, data: null };

    // After closing, log the opening balance for the next session
    const { error: openError } = await supabase.from('transactions').insert({
        description: 'Abertura de Caixa',
        type: 'Abertura de Caixa',
        amount: closingData.counted_cash,
        user_id: userId,
    });
    
    if (openError) console.error("Failed to log opening balance for next session", openError);
    
    return { success: true, error: null, data };
  }
}
