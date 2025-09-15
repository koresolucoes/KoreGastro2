
import { SupabaseClient } from '@supabase/supabase-js';
import { OrderItem, OrderStatus, OrderType, IfoodOrderDelivery } from '../../src/models/db.models';
import { getOrderIdFromPayload } from './ifood-utils.js';

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

  let query = supabase.from('customers').select('id').eq('user_id', userId);
  if (ifoodCustomer.phone?.number) {
    query = query.eq('phone', ifoodCustomer.phone.number);
  } else {
    query = query.eq('name', ifoodCustomer.name);
  }

  const { data: existingCustomer } = await query.maybeSingle();
  if (existingCustomer) {
    return existingCustomer.id;
  }

  const { data: newCustomer, error } = await supabase
    .from('customers')
    .insert({ user_id: userId, name: ifoodCustomer.name, phone: ifoodCustomer.phone?.number || null })
    .select('id')
    .single();
  
  if (error) {
    console.error("Error creating customer:", error);
    return null;
  }
  return newCustomer.id;
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
      delivery_info: deliveryInfo
    }).select('id').single();

  if (orderError) {
    throw new Error(orderError.message);
  }

  if (Array.isArray(payload.items) && payload.items.length > 0) {
    const allExternalCodes = payload.items.flatMap((item: any) => [item.externalCode, ...(item.options || []).map((opt: any) => opt.externalCode)]).filter(Boolean);
    const { data: ingredients } = await supabase.from('ingredients').select('id, external_code, proxy_recipe_id, station_id').in('external_code', allExternalCodes).eq('user_id', userId);
    const ingredientMap = new Map(ingredients?.map(i => [i.external_code, i]));
    const orderItemsToInsert: Partial<OrderItem>[] = payload.items.map((item: any) => {
      const mainIngredient = ingredientMap.get(item.externalCode);
      return {
          order_id: newOrder.id, recipe_id: mainIngredient?.proxy_recipe_id ?? null, name: item.name,
          quantity: item.quantity, price: item.totalPrice, original_price: item.unitPrice * item.quantity,
          notes: [item.observations, ...(item.options || []).map((opt: any) => `${opt.quantity}x ${opt.name}`)].filter(Boolean).join('; '),
          status: 'PENDENTE',
          station_id: mainIngredient?.station_id ?? fallbackStationId,
          status_timestamps: { 'PENDENTE': new Date().toISOString() }, user_id: userId
      };
    });
    const { error: itemsError } = await supabase.from('order_items').insert(orderItemsToInsert);
    if (itemsError) {
      if (logId) await updateLogStatus(supabase, logId, 'ERROR_ITEM_INSERT', itemsError.message);
    }
  }
}

export async function cancelOrderInDb(supabase: SupabaseClient, ifoodOrderId: string) {
  await supabase.from('orders').update({ status: 'CANCELLED' }).eq('ifood_order_id', ifoodOrderId);
}
