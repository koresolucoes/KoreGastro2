import { Injectable, inject } from '@angular/core';
import { CashierClosing, OrderItem, OrderItemStatus, Recipe, TransactionType } from '../models/db.models';
import { AuthService } from './auth.service';
import { SupabaseStateService } from './supabase-state.service';
import { PricingService } from './pricing.service';
import { supabase } from './supabase-client';
import { InventoryDataService } from './inventory-data.service';

interface CartItem { recipe: Recipe; quantity: number; }
interface PaymentInfo { method: string; amount: number; }

export interface ReportData {
  grossRevenue: number;
  totalOrders: number;
  averageTicket: number;
  paymentSummary: { method: string, total: number }[];
  bestSellingItems: { name: string, quantity: number, revenue: number }[];
}

@Injectable({
  providedIn: 'root',
})
export class CashierDataService {
  private authService = inject(AuthService);
  private stateService = inject(SupabaseStateService);
  private pricingService = inject(PricingService);
  private inventoryDataService = inject(InventoryDataService);

  async finalizeQuickSalePayment(cart: CartItem[], payments: PaymentInfo[]): Promise<{ success: boolean, error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const { data: order, error: orderError } = await supabase.from('orders').insert({
        table_number: 0, order_type: 'QuickSale', is_completed: true,
        completed_at: new Date().toISOString(), user_id: userId
    }).select().single();
    if (orderError) return { success: false, error: orderError };

    const stations = this.stateService.stations();
    if (stations.length === 0) {
      return { success: false, error: { message: 'Nenhuma estação de produção configurada para registrar a venda.' } };
    }
    const stationId = stations[0].id;
    
    const orderItems = cart.map(item => ({
        order_id: order.id,
        recipe_id: item.recipe.id,
        name: item.recipe.name,
        quantity: item.quantity,
        price: this.pricingService.getEffectivePrice(item.recipe),
        status: 'SERVIDO' as OrderItemStatus,
        station_id: stationId,
        user_id: userId,
    }));
    
    const { data: insertedItems, error: itemsError } = await supabase.from('order_items').insert(orderItems).select();
    if (itemsError) return { success: false, error: itemsError };

    const transactions = payments.map(p => ({
        description: `Receita Venda Rápida #${order.id.slice(0, 8)} (${p.method})`,
        type: 'Receita' as TransactionType, amount: p.amount, user_id: userId
    }));

    const { error: transError } = await supabase.from('transactions').insert(transactions);
    if (transError) return { success: false, error: transError };
    
    // Deduct stock after successful payment
    if (insertedItems) {
        const { success: deductionSuccess, error: deductionError } = await this.inventoryDataService.deductStockForOrderItems(insertedItems, order.id);
        if (!deductionSuccess) {
            console.error('Stock deduction failed for quick sale after payment was processed. Manual adjustment needed.', deductionError);
        }
    }
    
    return { success: true, error: null };
  }

  async logTransaction(description: string, amount: number, type: TransactionType): Promise<{ success: boolean, error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase.from('transactions').insert({ description, amount, type, user_id: userId });
    
    if (!error) {
      // Manually trigger a refresh to ensure UI updates immediately.
      await this.stateService.refreshDashboardAndCashierData();
    }

    return { success: !error, error };
  }

  async closeCashier(closingData: Omit<CashierClosing, 'id' | 'closed_at'>): Promise<{ success: boolean, error: any, data?: CashierClosing }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    
    const { data, error } = await supabase.from('cashier_closings').insert({ ...closingData, user_id: userId }).select().single();
    if (error) return { success: false, error };
    
    await this.logTransaction('Abertura de Caixa', closingData.counted_cash, 'Abertura de Caixa');
    
    return { success: true, error: null, data: data };
  }

  async generateReportData(startDate: string, endDate: string, reportType: 'sales' | 'items'): Promise<ReportData> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) throw new Error('User not authenticated');
    
    // Adjust end date to include the whole day
    const endDateObj = new Date(endDate);
    endDateObj.setHours(23, 59, 59, 999);

    const [completedOrdersRes, transactionsRes] = await Promise.all([
      supabase.from('orders').select('*, order_items(*)').eq('is_completed', true).gte('completed_at', new Date(startDate).toISOString()).lte('completed_at', endDateObj.toISOString()).eq('user_id', userId),
      supabase.from('transactions').select('*').gte('date', new Date(startDate).toISOString()).lte('date', endDateObj.toISOString()).eq('user_id', userId).eq('type', 'Receita')
    ]);

    if (completedOrdersRes.error) throw completedOrdersRes.error;
    if (transactionsRes.error) throw transactionsRes.error;

    const completedOrders = completedOrdersRes.data || [];
    const transactions = transactionsRes.data || [];
    
    // Process data
    const grossRevenue = transactions.reduce((sum, t) => sum + t.amount, 0);
    const totalOrders = completedOrders.length;
    const averageTicket = totalOrders > 0 ? grossRevenue / totalOrders : 0;
    
    const paymentSummaryMap = new Map<string, number>();
    const paymentMethodRegex = /\(([^)]+)\)/;
    for (const transaction of transactions) {
        const match = transaction.description.match(paymentMethodRegex);
        const method = match ? match[1] : 'Outros';
        paymentSummaryMap.set(method, (paymentSummaryMap.get(method) || 0) + transaction.amount);
    }
    const paymentSummary = Array.from(paymentSummaryMap.entries()).map(([method, total]) => ({ method, total })).sort((a,b) => b.total - a.total);

    const itemCounts = new Map<string, { name: string, quantity: number, revenue: number }>();
    completedOrders.flatMap(o => o.order_items).forEach(item => {
        const existing = itemCounts.get(item.recipe_id);
        if (existing) {
            existing.quantity += item.quantity;
            existing.revenue += item.price * item.quantity;
        } else {
            itemCounts.set(item.recipe_id, { name: item.name, quantity: item.quantity, revenue: item.price * item.quantity });
        }
    });
    const bestSellingItems = Array.from(itemCounts.values()).sort((a, b) => b.quantity - a.quantity);
    
    return {
      grossRevenue,
      totalOrders,
      averageTicket,
      paymentSummary,
      bestSellingItems
    };
  }
}