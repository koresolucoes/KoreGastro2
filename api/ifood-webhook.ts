import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'crypto';
import type { Order, OrderItem, OrderStatus, OrderType, IfoodOrderDelivery } from '../src/models/db.models';
import { v4 as uuidv4 } from 'uuid';

// This config is necessary for Vercel to provide the raw request body
export const config = {
  api: {
    bodyParser: false,
  },
};

// Initialize Supabase Admin Client for server-side operations
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// --- HELPER FUNCTIONS ---

/**
 * Fetches the full order details from the iFood Merchant API.
 * This is necessary when the webhook is a simple notification without the full payload.
 * @param orderId The ID of the iFood order.
 * @returns The full order details object.
 */
async function getIFoodOrderDetails(orderId: string): Promise<any> {
    const clientId = process.env.IFOOD_CLIENT_ID;
    const clientSecret = process.env.IFOOD_CLIENT_SECRET;
    const iFoodApiBaseUrl = 'https://merchant-api.ifood.com.br';

    if (!clientId || !clientSecret) {
        throw new Error('iFood API credentials (IFOOD_CLIENT_ID, IFOOD_CLIENT_SECRET) are not set in environment variables.');
    }

    // 1. Get Access Token using Client Credentials flow
    const tokenParams = new URLSearchParams();
    tokenParams.append('grantType', 'client_credentials');
    tokenParams.append('clientId', clientId);
    tokenParams.append('clientSecret', clientSecret);

    const tokenResponse = await fetch(`${iFoodApiBaseUrl}/authentication/v1.0/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams,
    });

    if (!tokenResponse.ok) {
        throw new Error(`Failed to get iFood access token: ${await tokenResponse.text()}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.accessToken;

    if (!accessToken) {
        throw new Error('Access token not found in iFood authentication response.');
    }

    // 2. Get Order Details using the access token
    const orderDetailsResponse = await fetch(`${iFoodApiBaseUrl}/order/v1.0/orders/${orderId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (!orderDetailsResponse.ok) {
        throw new Error(`Failed to fetch iFood order details for ${orderId}: ${await orderDetailsResponse.text()}`);
    }

    return await orderDetailsResponse.json();
}


async function getRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function verifySignature(signature: string, body: Buffer, secret: string): boolean {
  if (!signature || !body || !secret) {
    return false;
  }
  const hmac = createHmac('sha256', secret);
  hmac.update(body);
  const computedSignature = hmac.digest('hex');
  return computedSignature === signature;
}

async function getOrCreateCustomer(userId: string, ifoodCustomer: any): Promise<string | null> {
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

    const { data: existingCustomer, error: findError } = await query.maybeSingle();
    if (findError) {
      console.error("Error finding customer (will proceed to create):", findError);
    }
    if (existingCustomer) {
      return existingCustomer.id;
    }

    const { data: newCustomer, error: createError } = await supabase
        .from('customers')
        .insert({
            user_id: userId,
            name: ifoodCustomer.name,
            phone: ifoodCustomer.phone?.number || null,
        })
        .select('id')
        .single();
    
    if (createError) {
        console.error("Error creating customer:", createError);
        return null;
    }
    return newCustomer.id;
}


// --- MAIN WEBHOOK HANDLER ---

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  if (request.method !== 'POST') {
    return response.status(405).send({ error: 'Method Not Allowed' });
  }

  const ifoodSecret = process.env.IFOOD_CLIENT_SECRET;
  if (!ifoodSecret) {
    console.error('IFOOD_CLIENT_SECRET is not set in environment variables.');
    return response.status(500).send({ error: 'Server configuration error.' });
  }
  
  let logId: string | null = null;
  const rawBody = await getRawBody(request);

  try {
    // Make payload mutable to allow for enrichment from API call
    let payload = JSON.parse(rawBody.toString('utf-8'));
    const signature = request.headers['x-ifood-signature'] as string;

    const { data: logEntry, error: logError } = await supabase
      .from('ifood_webhook_logs')
      .insert({
        merchant_id: payload.merchant?.id || payload.merchantId,
        ifood_order_id: payload.id || payload.orderId,
        event_code: payload.fullCode || payload.code,
        raw_payload: payload,
        processing_status: 'RECEIVED'
      })
      .select('id')
      .single();

    if (logError) {
      console.error("Critical: Failed to log webhook payload:", logError);
    }
    logId = logEntry?.id || null;

    if (!verifySignature(signature, rawBody, ifoodSecret)) {
      console.warn('Invalid signature received.');
      if (logId) await supabase.from('ifood_webhook_logs').update({ processing_status: 'ERROR_INVALID_SIGNATURE' }).eq('id', logId);
      return response.status(401).send({ error: 'Invalid signature.' });
    }

    if (payload.fullCode === 'KEEPALIVE' || payload.code === 'KEEPALIVE') {
      console.log('Keepalive heartbeat received.');
      if (logId) await supabase.from('ifood_webhook_logs').update({ processing_status: 'SUCCESS_KEEPALIVE' }).eq('id', logId);
      return response.status(202).send({ message: 'Accepted' });
    }

    const merchantId = payload.merchant?.id || payload.merchantId;
    if (!merchantId) {
       console.warn('Webhook received without merchantId.');
       if (logId) await supabase.from('ifood_webhook_logs').update({ processing_status: 'ERROR_NO_MERCHANT_ID' }).eq('id', logId);
       return response.status(400).send({ error: 'Merchant ID missing.' });
    }

    const { data: profile, error: profileError } = await supabase
        .from('company_profile')
        .select('user_id')
        .eq('ifood_merchant_id', merchantId)
        .single();

    if (profileError || !profile) {
        console.error(`Merchant not found for ID: ${merchantId}`);
        if (logId) await supabase.from('ifood_webhook_logs').update({ processing_status: 'ERROR_MERCHANT_NOT_FOUND', error_message: `Merchant ID ${merchantId} not found.` }).eq('id', logId);
        return response.status(404).send({ error: 'Merchant not found' });
    }
    const userId = profile.user_id;
    const orderIdFromEvent = payload.id || payload.orderId;
    
    if(logId) await supabase.from('ifood_webhook_logs').update({ user_id: userId }).eq('id', logId);

    if (payload.fullCode === 'PLACED' || payload.code === 'PLC') {
      
      // If the payload is minimal (doesn't contain items), it's a notification.
      // We must fetch the full order details from the iFood API.
      if (!payload.items) {
          try {
              console.log(`Minimal 'PLACED' event for ${orderIdFromEvent}. Fetching full details from iFood API...`);
              const fullOrderDetails = await getIFoodOrderDetails(orderIdFromEvent);
              payload = fullOrderDetails; // Overwrite the payload with the full details.
              if (logId) await supabase.from('ifood_webhook_logs').update({ raw_payload: payload, processing_status: 'FETCHED_DETAILS' }).eq('id', logId);
          } catch (fetchError: any) {
              console.error('Failed to fetch full order details from iFood API:', fetchError);
              if (logId) await supabase.from('ifood_webhook_logs').update({ processing_status: 'ERROR_FETCH_DETAILS', error_message: fetchError.message }).eq('id', logId);
              // Acknowledge the event to prevent iFood from retrying if our API call is what's failing.
              return response.status(202).send({ message: 'Accepted, but failed to fetch details.' });
          }
      }

      const ifoodOrderId = payload.id; // Use ID from the full payload now

      const { data: existingOrder } = await supabase.from('orders').select('id').eq('ifood_order_id', ifoodOrderId).eq('user_id', userId).maybeSingle();
      if (existingOrder) {
        console.warn(`Duplicate PLACED event for iFood order ${ifoodOrderId}. Ignoring.`);
        if (logId) await supabase.from('ifood_webhook_logs').update({ processing_status: 'SUCCESS_DUPLICATE_IGNORED' }).eq('id', logId);
        return response.status(202).send({ message: 'Duplicate order, accepted.' });
      }

      const { data: stations, error: stationsError } = await supabase.from('stations').select('id').eq('user_id', userId).order('created_at', { ascending: true });
      if (stationsError || !stations || stations.length === 0) {
        console.error(`No production stations found for user ${userId}. Cannot process iFood order.`);
        if (logId) await supabase.from('ifood_webhook_logs').update({ processing_status: 'ERROR_NO_STATIONS_CONFIGURED', error_message: 'No production stations configured for this restaurant.' }).eq('id', logId);
        return response.status(400).send({ error: 'Restaurant not configured for production.' });
      }
      const fallbackStationId = stations[0].id;

      const customerId = await getOrCreateCustomer(userId, payload.customer);
      const orderType: OrderType = payload.orderType === 'DELIVERY' ? 'iFood-Delivery' : 'iFood-Takeout';
      const deliveryInfo: IfoodOrderDelivery | null = payload.delivery ? {
          deliveredBy: payload.delivery.deliveredBy,
          deliveryAddress: payload.delivery.deliveryAddress
      } : null;

      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: userId, table_number: 0, status: 'OPEN', order_type: orderType,
          customer_id: customerId, ifood_order_id: payload.id, ifood_display_id: payload.displayId,
          delivery_info: deliveryInfo
        }).select('id').single();

      if (orderError) {
        if (logId) await supabase.from('ifood_webhook_logs').update({ processing_status: 'ERROR_ORDER_INSERT', error_message: orderError.message }).eq('id', logId);
        return response.status(500).json({ error: 'Failed to save order.' });
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
          if (logId) await supabase.from('ifood_webhook_logs').update({ processing_status: 'ERROR_ITEM_INSERT', error_message: itemsError.message }).eq('id', logId);
        }
      }
      if (logId) await supabase.from('ifood_webhook_logs').update({ processing_status: 'SUCCESS_CREATED' }).eq('id', logId);
    } else if (payload.fullCode === 'CANCELLED' || payload.code === 'CAN') {
        await supabase.from('orders').update({ status: 'CANCELLED' }).eq('ifood_order_id', orderIdFromEvent);
        if (logId) await supabase.from('ifood_webhook_logs').update({ processing_status: 'SUCCESS_CANCELLED' }).eq('id', logId);
    } else {
        console.log(`Received unhandled event code: ${payload.fullCode || payload.code}`);
        if (logId) await supabase.from('ifood_webhook_logs').update({ processing_status: 'SUCCESS_UNHANDLED_EVENT' }).eq('id', logId);
    }

    return response.status(202).send({ message: 'Event received successfully.' });

  } catch (error: any) {
    console.error('Error processing webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (logId) await supabase.from('ifood_webhook_logs').update({ processing_status: 'ERROR_FATAL', error_message: errorMessage }).eq('id', logId);
    if (error instanceof SyntaxError) {
        return response.status(400).send({ error: 'Invalid JSON payload.' });
    }
    return response.status(500).send({ error: 'Internal Server Error' });
  }
}
