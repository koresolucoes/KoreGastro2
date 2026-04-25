import { Injectable, inject } from '@angular/core';
import { supabase } from './supabase-client';
import { UnitContextService } from './unit-context.service';
import { Customer, Order } from '../models/db.models';

export interface RfmCustomer {
  customerId: string;
  name: string;
  phone: string | null;
  email: string | null;
  lastOrderDate: string;
  recencyDays: number;
  frequency: number;
  monetary: number;
  segment: 'VIP' | 'Leal' | 'Potencial' | 'Risco' | 'Inativo' | 'Novo';
}

@Injectable({
  providedIn: 'root'
})
export class CrmDataService {
  unitContext = inject(UnitContextService);

  async getRfmAnalysis(): Promise<{ success: boolean; data: RfmCustomer[] | null; error: any }> {
      const userId = this.unitContext.activeUnitId();
      if (!userId) return { success: false, data: null, error: new Error('Usuário não autenticado') };
      
      try {
          // Fetch all customers for the current unit
          const { data: customers, error: customerError } = await supabase
              .from('customers')
              .select('*')
              .eq('user_id', userId);
              
          if (customerError) return { success: false, data: null, error: customerError };
          if (!customers || customers.length === 0) return { success: true, data: [], error: null };
          
          // Fetch all completed orders (with a customer attached) for the current unit
          const { data: orders, error: ordersError } = await orderQuery(userId);
          
          if (ordersError) return { success: false, data: null, error: ordersError };
          
          const customersMap = new Map<string, RfmCustomer>();
          
          const now = new Date();
          
          // Process orders to calculate frequency, monetary, and recency
          for (const order of (orders || [])) {
              if (!order.customer_id) continue;
              
              const orderDate = new Date(order.timestamp);
              // Calculate total for order
              let orderTotal = 0;
              for (const item of (order.order_items || [])) {
                  if (item.status !== 'CANCELLED') {
                      let itemPrice = item.price * item.quantity;
                      if (item.discount_value) {
                           if (item.discount_type === 'PERCENTAGE') {
                               itemPrice -= itemPrice * (item.discount_value / 100);
                           } else {
                               itemPrice -= item.discount_value;
                           }
                      }
                      orderTotal += itemPrice;
                  }
              }
              
              // Apply order level discount
              if (order.discount_value) {
                   if (order.discount_type === 'PERCENTAGE') {
                       orderTotal -= orderTotal * (order.discount_value / 100);
                   } else {
                       orderTotal -= order.discount_value;
                   }
              }
              
              const diffTime = Math.abs(now.getTime() - orderDate.getTime());
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              
              if (!customersMap.has(order.customer_id)) {
                   const customer = customers.find(c => c.id === order.customer_id);
                   if (customer) {
                       customersMap.set(customer.id, {
                           customerId: customer.id,
                           name: customer.name,
                           phone: customer.phone,
                           email: customer.email,
                           lastOrderDate: orderDate.toISOString(),
                           recencyDays: diffDays,
                           frequency: 1,
                           monetary: orderTotal,
                           segment: 'Novo'
                       });
                   }
              } else {
                   const stats = customersMap.get(order.customer_id)!;
                   stats.frequency += 1;
                   stats.monetary += orderTotal;
                   if (diffDays < stats.recencyDays) {
                       stats.recencyDays = diffDays;
                       stats.lastOrderDate = orderDate.toISOString();
                   }
              }
          }
          
          // Determine segments
          const result = Array.from(customersMap.values()).map(c => {
              c.segment = this.calculateSegment(c);
              return c;
          }).sort((a, b) => b.monetary - a.monetary); // Sort by monetary descending initially
          
          return { success: true, data: result, error: null };
          
      } catch (err) {
          return { success: false, data: null, error: err };
      }
  }
  
  private calculateSegment(c: RfmCustomer): RfmCustomer['segment'] {
      // Very basic segmentation logic
      if (c.recencyDays <= 30 && c.frequency >= 5 && c.monetary > 500) return 'VIP';
      if (c.recencyDays <= 60 && c.frequency >= 3) return 'Leal';
      if (c.recencyDays <= 30 && c.frequency <= 2) return 'Novo';
      if (c.recencyDays > 60 && c.recencyDays <= 120 && c.frequency >= 3) return 'Risco';
      if (c.recencyDays > 120) return 'Inativo';
      return 'Potencial';
  }
}

async function orderQuery(userId: string) {
    return supabase
              .from('orders')
              .select(`
                  id, customer_id, timestamp, status, discount_type, discount_value,
                  order_items(id, price, quantity, status, discount_type, discount_value)
              `)
              .eq('user_id', userId)
              .in('status', ['COMPLETED', 'DELIVERED']);
}
