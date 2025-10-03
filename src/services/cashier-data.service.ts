import { Injectable, inject } from '@angular/core';
import { supabase } from './supabase-client';
import { AuthService } from './auth.service';
// FIX: Inject modular state services
import { SupabaseStateService } from './supabase-state.service';
import { RecipeStateService } from './recipe-state.service';
import { PosStateService } from './pos-state.service';
import { HrStateService } from './hr-state.service';
import { InventoryDataService } from './inventory-data.service';
import { PricingService } from './pricing.service';
import { Order, OrderItem, Recipe, Transaction, TransactionType, CashierClosing, OrderItemStatus, DiscountType } from '../models/db.models';
import { Payment } from '../components/cashier/cashier.component';
import { v4 as uuidv4 } from 'uuid';
import { WebhookService } from './webhook.service';

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

export interface PeriodSalesData {
    totalSales: number;
    orderCount: number;
    averageTicket: number;
}

export interface ComparativeData {
    current: PeriodSalesData;
    previous: PeriodSalesData;
}

export interface PeakHoursData {
    hour: number;
    sales: number;
}

export interface PeakDaysData {
  dayOfWeek: string;
  dayIndex: number;
  sales: number;
}

export interface DailySalesCogs {
  date: string; // YYYY-MM-DD
  sales: number;
  cogs: number;
}

export interface CustomReportConfig {
  dataSource: 'transactions';
  columns: Set<string>;
  filters: {
    startDate?: string;
    endDate?: string;
    employeeId?: string;
  };
  groupBy: string;
}

export interface CustomReportData {
  headers: { key: string; label: string }[];
  rows: any[];
  totals?: { [key: string]: number };
}


@Injectable({
  providedIn: 'root',
})
export class CashierDataService {
  private authService = inject(AuthService);
  private stateService = inject(SupabaseStateService);
  private inventoryDataService = inject(InventoryDataService);
  private pricingService = inject(PricingService);
  private webhookService = inject(WebhookService);
  // FIX: Inject modular state services
  private recipeState = inject(RecipeStateService);
  private posState = inject(PosStateService);
  private hrState = inject(HrStateService);

  async getTransactionsForPeriod(startDateStr: string, endDateStr: string): Promise<{ data: Transaction[] | null; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { data: null, error: { message: 'User not authenticated' } };

    const startDate = new Date(`${startDateStr}T00:00:00`);
    const endDate = new Date(`${endDateStr}T23:59:59`);

    return supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate.toISOString())
      .lte('date', endDate.toISOString())
      .order('date', { ascending: true });
  }

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
      .eq('status', 'COMPLETED')
      .gte('completed_at', startDate.toISOString())
      .lte('completed_at', endDate.toISOString());

    if (error) throw error;
    if (!orders) return {};
    
    // FIX: Access recipeCosts from recipeState
    const recipeCosts = this.recipeState.recipeCosts();

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

  private async getSalesDataForPeriod(startDate: Date, endDate: Date): Promise<PeriodSalesData> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { totalSales: 0, orderCount: 0, averageTicket: 0 };

    const { data: transactions, error } = await supabase
        .from('transactions')
        .select('amount, description')
        .eq('user_id', userId)
        .eq('type', 'Receita')
        .gte('date', startDate.toISOString())
        .lte('date', endDate.toISOString());

    if (error) throw error;
    if (!transactions) return { totalSales: 0, orderCount: 0, averageTicket: 0 };

    const totalSales = transactions.reduce((sum, t) => sum + t.amount, 0);
    const orderIds = new Set(transactions.map(t => t.description.match(/#([a-f0-9-]+)/)?.[1]).filter(Boolean));
    const orderCount = orderIds.size;
    const averageTicket = orderCount > 0 ? totalSales / orderCount : 0;

    return { totalSales, orderCount, averageTicket };
  }

  async getSalesDataForComparativeReport(currentStart: string, currentEnd: string): Promise<ComparativeData> {
      const currentStartDate = new Date(`${currentStart}T00:00:00`);
      const currentEndDate = new Date(`${currentEnd}T23:59:59`);

      const duration = currentEndDate.getTime() - currentStartDate.getTime();
      const previousEndDate = new Date(currentStartDate.getTime() - 1);
      const previousStartDate = new Date(previousEndDate.getTime() - duration);

      const [current, previous] = await Promise.all([
          this.getSalesDataForPeriod(currentStartDate, currentEndDate),
          this.getSalesDataForPeriod(previousStartDate, previousEndDate),
      ]);
      
      return { current, previous };
  }

  async getSalesByHourForPeriod(startDateStr: string, endDateStr: string): Promise<PeakHoursData[]> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return [];

    const startDate = new Date(`${startDateStr}T00:00:00`);
    const endDate = new Date(`${endDateStr}T23:59:59`);

    const { data: transactions, error } = await supabase
        .from('transactions')
        .select('amount, date')
        .eq('user_id', userId)
        .eq('type', 'Receita')
        .gte('date', startDate.toISOString())
        .lte('date', endDate.toISOString());

    if (error) throw error;
    if (!transactions) return [];

    const salesByHour: { [key: number]: number } = {};
    for (let i = 0; i < 24; i++) salesByHour[i] = 0;

    for (const t of transactions) {
        const hour = new Date(t.date).getHours();
        salesByHour[hour] = (salesByHour[hour] || 0) + t.amount;
    }

    return Object.entries(salesByHour).map(([hour, sales]) => ({
        hour: Number(hour),
        sales,
    }));
  }

  async getSalesByDayOfWeekForPeriod(startDateStr: string, endDateStr: string): Promise<PeakDaysData[]> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return [];

    const startDate = new Date(`${startDateStr}T00:00:00`);
    const endDate = new Date(`${endDateStr}T23:59:59`);

    const { data: transactions, error } = await supabase
        .from('transactions')
        .select('amount, date')
        .eq('user_id', userId)
        .eq('type', 'Receita')
        .gte('date', startDate.toISOString())
        .lte('date', endDate.toISOString());

    if (error) throw error;
    if (!transactions) return [];

    const salesByDay: number[] = [0, 0, 0, 0, 0, 0, 0]; // Sun -> Sat
    
    for (const t of transactions) {
        const dayIndex = new Date(t.date).getDay(); // 0 for Sunday, 1 for Monday...
        salesByDay[dayIndex] += t.amount;
    }
    
    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    return salesByDay.map((sales, index) => ({
      dayOfWeek: dayNames[index],
      dayIndex: index,
      sales: sales,
    }));
  }
  
  async finalizeQuickSalePayment(cart: CartItem[], payments: Payment[], customerId: string | null): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({ 
          table_number: 0, 
          order_type: 'QuickSale', 
          status: 'COMPLETED', 
          completed_at: new Date().toISOString(), 
          user_id: userId,
          customer_id: customerId 
        })
        .select('*, customers(*)')
        .single();
    
    if (orderError) return { success: false, error: orderError };

    // FIX: Access stations from posState
    const stations = this.posState.stations();
    if (stations.length === 0) {
        await supabase.from('orders').delete().eq('id', order.id); // Rollback order
        return { success: false, error: { message: 'Nenhuma estação de produção configurada.' } };
    }
    const fallbackStationId = stations[0].id;

    const recipeIds = cart.map(item => item.recipe.id);
    const { data: preps } = await supabase
        .from('recipe_preparations')
        .select('*')
        .in('recipe_id', recipeIds)
        .eq('user_id', userId);
        
    const prepsByRecipeId = (preps || []).reduce((acc, p) => {
        if (!acc.has(p.recipe_id)) acc.set(p.recipe_id, []);
        acc.get(p.recipe_id)!.push(p);
        return acc;
    }, new Map<string, any[]>());

    const allOrderItemsToInsert = cart.flatMap(item => {
        const recipePreps = prepsByRecipeId.get(item.recipe.id);
        const status_timestamps = { 'SERVIDO': new Date().toISOString() };

        if (recipePreps && recipePreps.length > 0) {
            const groupId = uuidv4();
            return recipePreps.map(prep => ({
                order_id: order.id,
                recipe_id: item.recipe.id,
                name: `${item.recipe.name} (${prep.name})`,
                quantity: item.quantity,
                price: (item.effectivePrice / recipePreps.length),
                original_price: (item.originalPrice / recipePreps.length),
                discount_type: item.discountType,
                discount_value: item.discountValue,
                notes: item.notes,
                status: 'SERVIDO' as OrderItemStatus,
                station_id: prep.station_id,
                group_id: groupId,
                status_timestamps,
            }));
        } else {
            return [{
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
                station_id: fallbackStationId,
                group_id: null,
                status_timestamps,
            }];
        }
    });

    const orderItemsWithUserId = allOrderItemsToInsert.map(item => ({...item, user_id: userId}));

    const { error: itemsError } = await supabase.from('order_items').insert(orderItemsWithUserId);
    if (itemsError) {
        await supabase.from('orders').delete().eq('id', order.id);
        return { success: false, error: itemsError };
    }

    // FIX: Access roles and employees from hrState
    const cashierRoleId = this.hrState.roles().find(r => r.name === 'Caixa')?.id;
    const cashierEmployeeId = this.hrState.employees().find(e => e.role_id === cashierRoleId)?.id ?? null;

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

    const fullOrderItems = { ...order, order_items: orderItemsWithUserId as OrderItem[] };
    this.webhookService.triggerWebhook('pedido.finalizado', { order: fullOrderItems, payments });

    const { success, error } = await this.inventoryDataService.deductStockForOrderItems(orderItemsWithUserId as OrderItem[], order.id);
    if (!success) {
        console.error('Stock deduction failed for quick sale', error);
    }
    
    await this.stateService.refreshDashboardAndCashierData();
    
    return { success: true, error: null };
  }

  async createQuickSaleOrderForKitchen(cart: { recipe: Recipe; quantity: number; notes: string }[], customerId: string | null): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    // 1. Create the order
    const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
            table_number: 0, // Using 0 for cashier/quick sale
            order_type: 'QuickSale',
            status: 'OPEN',
            user_id: userId,
            customer_id: customerId
        })
        .select('id')
        .single();

    if (orderError) return { success: false, error: orderError };
    
    // 2. Create order items
    // FIX: Access stations from posState
    const stations = this.posState.stations();
    if (stations.length === 0) return { success: false, error: { message: 'Nenhuma estação de produção configurada.' } };
    const fallbackStationId = stations[0].id;
    
    const { data: preps } = await supabase.from('recipe_preparations').select('*').in('recipe_id', cart.map(i => i.recipe.id)).eq('user_id', userId);
    const prepsByRecipeId = (preps || []).reduce((acc, p) => {
        if (!acc.has(p.recipe_id)) acc.set(p.recipe_id, []);
        acc.get(p.recipe_id)!.push(p);
        return acc;
    }, new Map<string, any[]>());
    
    const cartWithPrices = cart.map(item => ({
        ...item,
        effectivePrice: this.pricingService.getEffectivePrice(item.recipe)
    }));

    const allItemsToInsert = cartWithPrices.flatMap(item => {
        const recipePreps = prepsByRecipeId.get(item.recipe.id);
        const status_timestamps = { 'PENDENTE': new Date().toISOString() };
        if (recipePreps && recipePreps.length > 0) {
            const groupId = uuidv4();
            return recipePreps.map((prep: any) => ({
                order_id: order.id, recipe_id: item.recipe.id, name: `${item.recipe.name} (${prep.name})`, quantity: item.quantity, notes: item.notes,
                status: 'PENDENTE' as OrderItemStatus, station_id: prep.station_id, status_timestamps, 
                price: item.effectivePrice / recipePreps.length, 
                original_price: item.recipe.price / recipePreps.length,
                group_id: groupId, user_id: userId,
                discount_type: null, discount_value: null
            }));
        }
        return [{
            order_id: order.id, recipe_id: item.recipe.id, name: item.recipe.name, quantity: item.quantity, notes: item.notes,
            status: 'PENDENTE' as OrderItemStatus, station_id: fallbackStationId, status_timestamps,
            price: item.effectivePrice, 
            original_price: item.recipe.price,
            group_id: null, user_id: userId,
            discount_type: null, discount_value: null
        }];
    });

    if (allItemsToInsert.length === 0) {
        await supabase.from('orders').delete().eq('id', order.id);
        return { success: true, error: null };
    }

    const { error: itemsError } = await supabase.from('order_items').insert(allItemsToInsert);
    if (itemsError) {
        await supabase.from('orders').delete().eq('id', order.id); // Rollback
        return { success: false, error: itemsError };
    }

    return { success: true, error: null };
  }

  async finalizeExistingQuickSalePayment(orderId: string, payments: Payment[]): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const { data: order, error: orderError } = await supabase
        .from('orders')
        .update({ status: 'COMPLETED', completed_at: new Date().toISOString() })
        .eq('id', orderId)
        .select('*, order_items(*), customers(*)')
        .single();

    if (orderError) return { success: false, error: orderError };

    // FIX: Access roles and employees from hrState
    const cashierRoleId = this.hrState.roles().find(r => r.name === 'Caixa')?.id;
    const cashierEmployeeId = this.hrState.employees().find(e => e.role_id === cashierRoleId)?.id ?? null;

    const transactionsToInsert: Partial<Transaction>[] = payments.map(p => ({
        description: `Receita Pedido #${orderId.slice(0, 8)} (${p.method})`,
        type: 'Receita' as TransactionType,
        amount: p.amount,
        user_id: userId,
        employee_id: cashierEmployeeId
    }));
    
    if (transactionsToInsert.length > 0) {
        const { error: transactionError } = await supabase.from('transactions').insert(transactionsToInsert);
        if (transactionError) return { success: false, error: transactionError };
    }
    
    this.webhookService.triggerWebhook('pedido.finalizado', { order, payments });

    if (order.order_items) {
        const { success, error } = await this.inventoryDataService.deductStockForOrderItems(order.order_items, order.id);
        if (!success) {
            console.error('Stock deduction failed for existing quick sale', error);
        }
    }

    await this.stateService.refreshDashboardAndCashierData();
    return { success: true, error: null };
  }


  async logTransaction(description: string, amount: number, type: 'Despesa'): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    // FIX: Access roles and employees from hrState
    const cashierRoleId = this.hrState.roles().find(r => r.name === 'Caixa')?.id;
    const cashierEmployeeId = this.hrState.employees().find(e => e.role_id === cashierRoleId)?.id ?? null;

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
  
  async getSalesAndCogsForPeriod(days: 7 | 30): Promise<DailySalesCogs[]> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return [];
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);
    
    const [ordersRes, transactionsRes] = await Promise.all([
         supabase.from('orders')
            .select('completed_at, order_items(*)')
            .eq('user_id', userId).eq('status', 'COMPLETED')
            .gte('completed_at', startDate.toISOString()).lte('completed_at', endDate.toISOString()),
        supabase.from('transactions')
            .select('date, amount')
            .eq('user_id', userId).eq('type', 'Receita')
            .gte('date', startDate.toISOString()).lte('date', endDate.toISOString())
    ]);

    if (ordersRes.error || transactionsRes.error) {
        console.error("Error fetching chart data", ordersRes.error || transactionsRes.error);
        return [];
    }
    
    // FIX: Access recipeCosts from recipeState
    const recipeCosts = this.recipeState.recipeCosts();
    const dailyData = new Map<string, { sales: number; cogs: number }>();

    // Initialize map for all days in the period
    for (let i = 0; i < days; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        const dateString = date.toISOString().split('T')[0];
        dailyData.set(dateString, { sales: 0, cogs: 0 });
    }

    // Process transactions for sales data
    for (const t of transactionsRes.data || []) {
        const dateString = new Date(t.date).toISOString().split('T')[0];
        if (dailyData.has(dateString)) {
            dailyData.get(dateString)!.sales += t.amount;
        }
    }
    
    // Process orders for COGS data
    for (const o of ordersRes.data || []) {
        if (!o.completed_at) continue;
        const dateString = new Date(o.completed_at).toISOString().split('T')[0];
        if (dailyData.has(dateString)) {
             const orderCogs = o.order_items.reduce((sum, item) => {
                const cost = recipeCosts.get(item.recipe_id)?.totalCost ?? 0;
                return sum + (cost * item.quantity);
            }, 0);
            dailyData.get(dateString)!.cogs += orderCogs;
        }
    }

    return Array.from(dailyData.entries())
        .map(([date, values]) => ({ date, ...values }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }
  
  async buildCustomReport(config: CustomReportConfig): Promise<CustomReportData> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) throw new Error("Usuário não autenticado.");

    const { dataSource, columns, filters, groupBy } = config;
    const { startDate, endDate, employeeId } = filters;

    if (dataSource !== 'transactions') {
        throw new Error("Fonte de dados não suportada no momento.");
    }
    
    let query = supabase.from('transactions').select('*, employees(name)')
        .eq('user_id', userId)
        .gte('date', new Date(`${startDate}T00:00:00`).toISOString())
        .lte('date', new Date(`${endDate}T23:59:59`).toISOString());

    if (employeeId && employeeId !== 'all') {
        query = query.eq('employee_id', employeeId);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    
    // FIX: Access employees from hrState
    const availableColumnsMap = new Map(this.hrState.employees().map(e => [e.id, e.name]));

    const mappedData = data.map(d => ({
        ...d,
        employeeName: d.employees?.name || 'N/A'
    }));

    const finalHeaders = Array.from(columns).map(key => {
        const colMap: Record<string, string> = { date: 'Data', description: 'Descrição', amount: 'Valor', type: 'Tipo', employeeName: 'Funcionário' };
        return { key, label: colMap[key] || key };
    });

    if (groupBy === 'none') {
        const rows = mappedData.map(row => {
            const newRow: any = {};
            columns.forEach(col => newRow[col] = (row as any)[col]);
            return newRow;
        });
        return { headers: finalHeaders, rows };
    } else {
        const grouped = mappedData.reduce<Record<string, { date: string, description: string, type: string, employeeName: string, count: number, totalAmount: number }>>((acc, row) => {
            let key = '';
            if (groupBy === 'day') key = new Date(row.date).toISOString().split('T')[0];
            else if (groupBy === 'type') key = row.type;
            else if (groupBy === 'employee') key = row.employeeName;

            if (!acc[key]) {
                acc[key] = {
                    date: key,
                    description: `${groupBy === 'day' ? 'Vendas do dia' : 'Agrupado por'} ${key}`,
                    type: key,
                    employeeName: key,
                    count: 0,
                    totalAmount: 0
                };
            }
            acc[key].count++;
            acc[key].totalAmount += row.amount;
            return acc;
        }, {});
        
        const rows = Object.values(grouped);
        // FIX: Use 'employeeName' as the key when grouping by employee to match the data structure.
        const headers = [
            { key: groupBy === 'day' ? 'date' : (groupBy === 'employee' ? 'employeeName' : groupBy), label: 'Agrupado por' },
            { key: 'count', label: 'Nº Transações' },
            { key: 'totalAmount', label: 'Valor Total' }
        ];

        return {
            headers: headers,
            rows: rows,
            totals: {
                // FIX: The `reduce` method with an `any` typed argument was causing incorrect type inference for the result.
                // Providing an explicit generic argument `<number>` to `reduce` ensures the final result is correctly typed.
                totalAmount: rows.reduce<number>((sum, r: any) => sum + (r.totalAmount || 0), 0)
            }
        };
    }
  }
}