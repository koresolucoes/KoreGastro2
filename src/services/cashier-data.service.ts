import { Injectable, inject } from '@angular/core';
import { CashierClosing, OrderItem, OrderItemStatus, Recipe, TransactionType } from '../models/db.models';
import { AuthService } from './auth.service';
import { SupabaseStateService } from './supabase-state.service';
import { PricingService } from './pricing.service';
import { supabase } from './supabase-client';

interface CartItem { recipe: Recipe; quantity: number; }
interface PaymentInfo { method: string; amount: number; }

@Injectable({
  providedIn: 'root',
})
export class CashierDataService {
  private authService = inject(AuthService);
  private stateService = inject(SupabaseStateService);
  private pricingService = inject(PricingService);

  async finalizeQuickSalePayment(cart: CartItem[], payments: PaymentInfo[]): Promise<{ success: boolean, error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const { data: order, error: orderError } = await supabase.from('orders').insert({
        table_number: 0, order_type: 'QuickSale', is_completed: true,
        completed_at: new Date().toISOString(), user_id: userId
    }).select().single();
    if (orderError) return { success: false, error: orderError };

    const prices = this.stateService.recipesById();
    const orderItems = cart.map(item => ({
        order_id: order.id, recipe_id: item.recipe.id, name: item.recipe.name, quantity: item.quantity,
        price: prices.get(item.recipe.id)?.price ?? 0, status: 'PRONTO' as OrderItemStatus,
        station_id: this.stateService.stations()[0]?.id, user_id: userId,
    }));
    
    const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
    if (itemsError) return { success: false, error: itemsError };

    const transactions = payments.map(p => ({
        description: `Receita Venda Rápida #${order.id.slice(0, 8)} (${p.method})`,
        type: 'Receita' as TransactionType, amount: p.amount, user_id: userId
    }));

    const { error: transError } = await supabase.from('transactions').insert(transactions);
    if (transError) return { success: false, error: transError };
    
    return { success: true, error: null };
  }

  async logTransaction(description: string, amount: number, type: TransactionType): Promise<{ success: boolean, error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase.from('transactions').insert({ description, amount, type, user_id: userId });
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
}
