import { Injectable, inject } from '@angular/core';
import { supabase } from './supabase-client';
import { Order, OrderItem, OrderType } from '../models/db.models';
import { PublicCartService } from './public-cart.service';
import { PublicCustomerService } from './public-customer.service';

@Injectable({
  providedIn: 'root'
})
export class PublicOrderService {
  private cartService = inject(PublicCartService);
  private customerService = inject(PublicCustomerService);

  async submitOrder(
    restaurantUserId: string, 
    deliveryMethod: 'delivery' | 'pickup',
    paymentMethod: string
  ): Promise<Order> {
    const cartItems = this.cartService.cartItems();
    if (cartItems.length === 0) {
      throw new Error('Carrinho vazio');
    }

    // 1. Save/Update Customer
    const customer = await this.customerService.saveCustomerToDatabase(restaurantUserId);

    // 2. Prepare Order Data
    const orderType: OrderType = deliveryMethod === 'delivery' ? 'External-Delivery' : 'External-Pickup';
    const customerState = this.customerService.customerState();
    
    // Calculate total
    const totalAmount = this.cartService.cartTotal();
    
    // Create notes including payment method and address if delivery
    let orderNotes = `Pagamento: ${paymentMethod}`;
    if (deliveryMethod === 'delivery') {
      orderNotes += `\nEndereço: ${customerState.street}, ${customerState.number} - ${customerState.neighborhood}`;
      if (customerState.complement) {
        orderNotes += ` (${customerState.complement})`;
      }
    }

    const newOrder = {
      user_id: restaurantUserId,
      customer_id: customer.id,
      status: 'OPEN',
      order_type: orderType,
      table_number: 0, // 0 or null for delivery/pickup
      notes: orderNotes,
      delivery_status: 'AWAITING_PREP',
      timestamp: new Date().toISOString()
    };

    // 3. Insert Order
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert([newOrder])
      .select()
      .single();

    if (orderError) throw orderError;

    // 4. Prepare Order Items
    const orderItemsToInsert = cartItems.map(item => ({
      order_id: orderData.id,
      recipe_id: item.recipe.id,
      quantity: item.quantity,
      price_at_time: item.recipe.effectivePrice,
      notes: item.notes || null
    }));

    // 5. Insert Order Items
    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItemsToInsert);

    if (itemsError) {
      // Rollback order if items fail (ideally should be an RPC transaction, but this works for now)
      await supabase.from('orders').delete().eq('id', orderData.id);
      throw itemsError;
    }

    // 6. Clear Cart
    this.cartService.clearCart();

    return orderData as Order;
  }
}
