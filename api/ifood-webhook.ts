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
    // Try to find a customer by name or phone (if provided)
    let query = supabase.from('customers').select('id').eq('user_id', userId);
    
    if (ifoodCustomer.phone?.number) {
        query = query.eq('phone', ifoodCustomer.phone.number);
    } else {
        query = query.eq('name', ifoodCustomer.name);
    }

    const { data: existingCustomer, error: findError } = await query.maybeSingle();
    if (findError) console.error("Error finding customer:", findError);
    if (existingCustomer) return existingCustomer.id;

    // Create a new customer if not found
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

  try {
    const rawBody = await getRawBody(request);
    // IMPORTANT: The iFood API may send different payloads for different events.
    // The "PLACED" event notification might just be an ID, but for this integration to work,
    // we are assuming the FULL order payload is sent, as per the documentation provided earlier.
    const payload = JSON.parse(rawBody.toString('utf-8'));

    // The signature check must be done on the raw, unparsed body.
    const signature = request.headers['x-ifood-signature'] as string;
    if (!verifySignature(signature, rawBody, ifoodSecret)) {
      console.warn('Invalid signature received.');
      return response.status(401).send({ error: 'Invalid signature.' });
    }

    // --- Event Handling Logic ---

    if (payload.fullCode === 'KEEPALIVE' || payload.code === 'KEEPALIVE') {
      console.log('Keepalive heartbeat received.');
      return response.status(202).send({ message: 'Accepted' });
    }

    // From here, we assume an order event. We need the merchantId to find the user.
    const merchantId = payload.merchant?.id || payload.merchantId;
    if (!merchantId) {
       console.warn('Webhook received without merchantId.');
       return response.status(400).send({ error: 'Merchant ID missing.' });
    }

    const { data: profile, error: profileError } = await supabase
        .from('company_profile')
        .select('user_id')
        .eq('ifood_merchant_id', merchantId)
        .single();

    if (profileError || !profile) {
        console.error(`Merchant not found for ID: ${merchantId}`);
        return response.status(404).send({ error: 'Merchant not found' });
    }
    const userId = profile.user_id;
    const orderId = payload.id || payload.orderId;

    if (payload.fullCode === 'PLACED' || payload.code === 'PLC') {
      console.log(`Processing new order: ${orderId}`);
      
      const customerId = await getOrCreateCustomer(userId, payload.customer);

      const orderType: OrderType = payload.orderType === 'DELIVERY' ? 'iFood-Delivery' : 'iFood-Takeout';
      const deliveryInfo: IfoodOrderDelivery | null = payload.delivery ? {
          deliveredBy: payload.delivery.deliveredBy,
          deliveryAddress: payload.delivery.deliveryAddress
      } : null;

      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: userId,
          table_number: 0,
          status: 'OPEN',
          order_type: orderType,
          customer_id: customerId,
          ifood_order_id: payload.id,
          ifood_display_id: payload.displayId,
          delivery_info: deliveryInfo
        })
        .select('id')
        .single();

      if (orderError) {
        console.error('Error inserting iFood order:', orderError);
        return response.status(500).json({ error: 'Failed to save order.' });
      }

      // Map iFood items to ChefOS ingredients via external_code
      const allExternalCodes = payload.items.flatMap((item: any) => 
        [item.externalCode, ...(item.options || []).map((opt: any) => opt.externalCode)]
      ).filter(Boolean);

      const { data: ingredients, error: ingredientsError } = await supabase
        .from('ingredients')
        .select('id, external_code, proxy_recipe_id, station_id')
        .in('external_code', allExternalCodes)
        .eq('user_id', userId);
      
      if (ingredientsError) {
        console.error('Error fetching ingredients by external code:', ingredientsError);
        // Continue, but some items might not be linked.
      }

      const ingredientMap = new Map(ingredients?.map(i => [i.external_code, i]));

      const orderItemsToInsert: Partial<OrderItem>[] = [];
      for (const item of payload.items) {
        const mainIngredient = ingredientMap.get(item.externalCode);
        orderItemsToInsert.push({
            order_id: newOrder.id,
            recipe_id: mainIngredient?.proxy_recipe_id ?? null,
            name: item.name,
            quantity: item.quantity,
            price: item.totalPrice, // Using total price from iFood
            original_price: item.unitPrice * item.quantity,
            notes: [
                item.observations,
                ...(item.options || []).map((opt: any) => `${opt.quantity}x ${opt.name}`)
            ].filter(Boolean).join('; '),
            status: 'PENDENTE',
            station_id: mainIngredient?.station_id, // This is crucial for KDS
            status_timestamps: { 'PENDENTE': new Date().toISOString() },
            user_id: userId
        });
      }

      if (orderItemsToInsert.length > 0) {
        const { error: itemsError } = await supabase.from('order_items').insert(orderItemsToInsert);
        if (itemsError) {
          console.error('Error inserting order items for iFood order:', itemsError);
          // Don't fail the whole request, order is already created.
        }
      }
      
    } else if (payload.fullCode === 'DISPATCHED' || payload.code === 'DSP') {
      // Logic for DISPATCHED can be added later if needed.
      // For now, it doesn't change our internal status from 'OPEN'.
    } else if (payload.fullCode === 'CANCELLED' || payload.code === 'CAN') {
        await supabase
          .from('orders')
          .update({ status: 'CANCELLED' })
          .eq('ifood_order_id', orderId);
    } else {
        console.log(`Received unhandled event code: ${payload.fullCode || payload.code}`);
    }

    return response.status(202).send({ message: 'Event received successfully.' });

  } catch (error: any) {
    console.error('Error processing webhook:', error);
    if (error instanceof SyntaxError) {
        return response.status(400).send({ error: 'Invalid JSON payload.' });
    }
    return response.status(500).send({ error: 'Internal Server Error' });
  }
}