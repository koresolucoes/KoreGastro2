import { SupabaseClient } from '@supabase/supabase-js';
import { OrderItem, OrderStatus, OrderType, IfoodOrderDelivery, Customer } from '../../src/models/db.models.js';
import { getOrderIdFromPayload } from './ifood-utils.js';
import { v4 as uuidv4 } from 'uuid';

// --- LOGGING ---

export async function logWebhookEvent(supabase: SupabaseClient, payload: any, orderId: string | null) {
  const { data, error } = await supabase
    .from('ifood_webhook_logs')
    .insert({
      merchant_id: payload.merchant?.id || payload.merchantId,
      ifood_order_id: orderId,
      event_code: payload.fullCode || payload.code,
      raw_payload: payload,
      processing_status: 'RECEIVED',
    })
    .select('id')
    .single();

  if (error) {
    console.error("Critical: Failed to log webhook payload:", error);
  }
  return data?.id || null;
}

export async function updateLogStatus(supabase: SupabaseClient, logId: string, status: string, errorMessage?: string, payload?: any, userId?: string) {
  const updatePayload: { [key: string]: any } = { processing_status: status };
  if (errorMessage) updatePayload.error_message = errorMessage;
  if (payload) updatePayload.raw_payload = payload;
  if (userId) updatePayload.user_id = userId;
  
  await supabase.from('ifood_webhook_logs').update(updatePayload).eq('id', logId);
}

// --- DATA FETCHING ---

export async function findUserByMerchantId(supabase: SupabaseClient, merchantId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('company_profile')
    .select('user_id')
    .eq('ifood_merchant_id', merchantId)
    .single();
  
  if (error || !data) {
    console.error(`Merchant not found for ID: ${merchantId}`);
    return null;
  }
  return data.user_id;
}

export async function findExistingOrder(supabase: SupabaseClient, ifoodOrderId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('orders').select('id').eq('ifood_order_id', ifoodOrderId).eq('user_id', userId).maybeSingle();
  return !!data;
}

async function getOrCreateCustomer(supabase: SupabaseClient, userId: string, ifoodCustomer: any): Promise<string | null> {
  if (!ifoodCustomer || !ifoodCustomer.name) {
    console.warn('No customer data in iFood payload. Creating order without customer link.');
    return null;
  }

  const phone = ifoodCustomer.phone?.number || null;
  const cpf = ifoodCustomer.documentNumber || null;
  const name = ifoodCustomer.name;
  let existingCustomer: { id: string, cpf: string | null, phone: string | null } | null = null;
  let updates: Partial<Customer> = {};

  // Strategy 1: Find by CPF (most reliable)
  if (cpf) {
    const { data } = await supabase.from('customers').select('id, cpf, phone').eq('user_id', userId).eq('cpf', cpf).maybeSingle();
    existingCustomer = data;
    if (existingCustomer && !existingCustomer.phone && phone) {
      updates.phone = phone; // Update phone if it was missing
    }
  }

  // Strategy 2: Find by Phone (if not found by CPF)
  if (!existingCustomer && phone) {
    const { data } = await supabase.from('customers').select('id, cpf, phone').eq('user_id', userId).eq('phone', phone).maybeSingle();
    existingCustomer = data;
    if (existingCustomer && !existingCustomer.cpf && cpf) {
      updates.cpf = cpf; // Update CPF if it was missing
    }
  }
  
  // Strategy 3: Find by Name (least reliable, only for customers likely from iFood without phone/cpf)
  if (!existingCustomer && name && !phone && !cpf) {
      const { data } = await supabase
        .from('customers')
        .select('id, cpf, phone')
        .eq('user_id', userId)
        .eq('name', name)
        .is('phone', null)
        .is('cpf', null)
        .limit(1)
        .maybeSingle();
      existingCustomer = data;
  }

  // Handle found customer
  if (existingCustomer) {
    // If we have updates (e.g., new phone or CPF), apply them
    if (Object.keys(updates).length > 0) {
      await supabase.from('customers').update(updates).eq('id', existingCustomer.id);
    }
    return existingCustomer.id;
  }

  // Handle new customer creation
  const { data: newCustomer, error } = await supabase
    .from('customers')
    .insert({ user_id: userId, name: name, phone: phone, cpf: cpf })
    .select('id')
    .single();
  
  if (error) {
    // Handle potential unique constraint violation if a race condition occurs
    if (error.code === '23505') { // unique_violation
        console.warn(`Attempted to create a duplicate customer for ${name}, likely due to a race condition. Refetching...`);
        // Refetch to be safe.
        if (cpf) {
             const { data } = await supabase.from('customers').select('id').eq('user_id', userId).eq('cpf', cpf).maybeSingle();
             if (data) return data.id;
        }
        if (phone) {
            const { data } = await supabase.from('customers').select('id').eq('user_id', userId).eq('phone', phone).maybeSingle();
            if (data) return data.id;
        }
    }
    console.error("Error creating customer:", error);
    return null;
  }
  return newCustomer!.id;
}


// --- DATA MANIPULATION ---

export async function processPlacedOrder(supabase: SupabaseClient, userId: string, payload: any, logId: string | null) {
  const ifoodOrderId = getOrderIdFromPayload(payload);
  if (!ifoodOrderId) {
    throw new Error('Could not extract a valid iFood Order ID from the payload in processPlacedOrder.');
  }

  if (await findExistingOrder(supabase, ifoodOrderId, userId)) {
    console.warn(`Duplicate PLACED event for iFood order ${ifoodOrderId}. Ignoring.`);
    if (logId) await updateLogStatus(supabase, logId, 'SUCCESS_DUPLICATE_IGNORED');
    return;
  }

  const { data: stations, error: stationsError } = await supabase.from('stations').select('id').eq('user_id', userId).order('created_at', { ascending: true });
  if (stationsError || !stations || stations.length === 0) {
    throw new Error('No production stations configured for this restaurant.');
  }
  const fallbackStationId = stations[0].id;

  const customerId = await getOrCreateCustomer(supabase, userId, payload.customer);
  const orderType: OrderType = payload.orderType === 'DELIVERY' ? 'iFood-Delivery' : 'iFood-Takeout';
  const deliveryInfo: IfoodOrderDelivery | null = payload.delivery ? {
      deliveredBy: payload.delivery.deliveredBy,
      deliveryAddress: payload.delivery.deliveryAddress
  } : null;

  const { data: newOrder, error: orderError } = await supabase
    .from('orders')
    .insert({
      user_id: userId, table_number: 0, status: 'OPEN', order_type: orderType,
      customer_id: customerId, ifood_order_id: ifoodOrderId, ifood_display_id: payload.displayId,
      delivery_info: deliveryInfo,
      timestamp: payload.createdAt,
      ifood_order_timing: payload.orderTiming,
      ifood_scheduled_at: payload.preparationStartDateTime || payload.schedule?.deliveryDateTimeStart,
      ifood_payments: payload.payments,
      ifood_benefits: payload.total?.benefits > 0 ? payload.benefits : null,
      ifood_delivery_observations: payload.delivery?.observations,
      ifood_pickup_code: payload.takeout?.pickupCode,
    })
    .select('id')
    .single();
  
  if (orderError) {
      throw new Error(`Failed to insert order into DB: ${orderError.message}`);
  }
  
  const orderItems: Partial<OrderItem>[] = (payload.items || []).map((item: any) => ({
      order_id: newOrder.id,
      name: item.name,
      quantity: item.quantity,
      price: item.unitPrice,
      original_price: item.unitPrice,
      notes: item.observations,
      status: 'PENDENTE',
      station_id: fallbackStationId,
      status_timestamps: { 'PENDENTE': new Date().toISOString() },
      user_id: userId
  }));

  if (orderItems.length > 0) {
      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
      if (itemsError) {
          // Rollback order creation if items fail
          await supabase.from('orders').delete().eq('id', newOrder.id);
          throw new Error(`Failed to insert order items: ${itemsError.message}`);
      }
  }
}

export async function confirmOrderInDb(supabase: SupabaseClient, ifoodOrderId: string) {
  const { data: order, error: orderError } = await supabase.from('orders').select('id, order_items(id, status, status_timestamps)').eq('ifood_order_id', ifoodOrderId).single();
  if (orderError || !order) {
    console.error(`[DB Helper] Could not find order to confirm with iFood ID ${ifoodOrderId}`, orderError);
    return;
  }

  const itemsToUpdate = (order.order_items || []).filter((i: any) => i.status === 'PENDENTE');
  if (itemsToUpdate.length > 0) {
    const now = new Date().toISOString();
    const updates = itemsToUpdate.map((item: any) => ({
        ...item,
        id: item.id,
        status: 'EM_PREPARO',
        status_timestamps: { ...(item.status_timestamps || {}), 'EM_PREPARO': now }
    }));
    await supabase.from('order_items').upsert(updates);
  }
}

export async function dispatchOrderInDb(supabase: SupabaseClient, ifoodOrderId: string) {
  const { data: order, error: orderError } = await supabase.from('orders').select('id, order_items(id, status, status_timestamps)').eq('ifood_order_id', ifoodOrderId).single();
  if (orderError || !order) {
    console.error(`[DB Helper] Could not find order to dispatch with iFood ID ${ifoodOrderId}`, orderError);
    return;
  }

  const itemsToUpdate = (order.order_items || []).filter((i: any) => i.status === 'PENDENTE' || i.status === 'EM_PREPARO');
  if (itemsToUpdate.length > 0) {
    const now = new Date().toISOString();
    const updates = itemsToUpdate.map((item: any) => ({
        ...item,
        id: item.id,
        status: 'PRONTO',
        status_timestamps: { ...(item.status_timestamps || {}), 'PRONTO': now }
    }));
    await supabase.from('order_items').upsert(updates);
  }
}

export async function concludeOrderInDb(supabase: SupabaseClient, ifoodOrderId: string) {
  // Fetch the order to get payment details and user_id
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, user_id, ifood_payments')
    .eq('ifood_order_id', ifoodOrderId)
    .single();

  if (error || !order) {
    console.error(`[concludeOrderInDb] Could not find order with iFood ID ${ifoodOrderId} to create transaction.`);
    // Still try to update the status as a fallback
    await supabase.from('orders').update({ status: 'COMPLETED', completed_at: new Date().toISOString() }).eq('ifood_order_id', ifoodOrderId);
    return;
  }

  const paymentsData = order.ifood_payments as { methods?: { value: number; method: string }[] };

  // Calculate total from the `methods` array.
  const total = paymentsData?.methods?.reduce((sum, payment) => sum + (payment.value || 0), 0) ?? 0;
  
  // Extract payment method names, which is `method`, not `name`.
  const paymentMethods = paymentsData?.methods
    ?.map((p) => p.method)
    .filter(Boolean)
    .join(', ') || 'iFood';

  // Create a transaction record only if total is greater than 0
  if (total > 0) {
    const { error: transactionError } = await supabase
      .from('transactions')
      .insert({
        description: `Receita Pedido #${order.id.slice(0, 8)} (${paymentMethods})`,
        type: 'Receita',
        amount: total,
        user_id: order.user_id,
        date: new Date().toISOString()
      });
    
    if (transactionError) {
      console.error(`[concludeOrderInDb] Failed to insert transaction for order ${order.id}:`, transactionError);
    }
  }

  // Finally, update the order status
  await supabase.from('orders').update({ status: 'COMPLETED', completed_at: new Date().toISOString() }).eq('ifood_order_id', ifoodOrderId);
}

export async function cancelOrderInDb(supabase: SupabaseClient, ifoodOrderId: string) {
  await supabase.from('orders').update({ 
    status: 'CANCELLED', 
    completed_at: new Date().toISOString(),
    ifood_dispute_id: null,
    ifood_dispute_details: null
  }).eq('ifood_order_id', ifoodOrderId);
}
// FIX: Added missing updateOrderLogisticsMetadata function.
export async function updateOrderLogisticsMetadata(supabase: SupabaseClient, ifoodOrderId: string, metadata: any) {
  // Fetches the order to get the current delivery_info
  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('id, delivery_info')
    .eq('ifood_order_id', ifoodOrderId)
    .single();

  if (fetchError || !order) {
    console.warn(`[DB Helper] Could not find order with iFood ID ${ifoodOrderId} to update logistics metadata.`, fetchError);
    return;
  }

  // Merge the new logistics metadata with any existing delivery_info
  // This preserves the original address while adding new tracking info.
  const updatedDeliveryInfo = {
    ...(order.delivery_info as object || {}),
    ...metadata, // The metadata from the webhook event (e.g., driver info)
  };

  const { error: updateError } = await supabase
    .from('orders')
    .update({ delivery_info: updatedDeliveryInfo })
    .eq('id', order.id);
  
  if (updateError) {
    console.error(`[DB Helper] Failed to update logistics metadata for iFood order ${ifoodOrderId}.`, updateError);
  }
}
