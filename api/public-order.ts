import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { checkRateLimit } from './utils/redis.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  serviceRoleKey || 'placeholder-key'
);

const TokenSchema = z.string().uuid();
const PublicItemSchema = z.object({
  recipeId: z.string().uuid().optional(),
  externalCode: z.string().min(1).max(120).optional(),
  quantity: z.number().int().positive().max(100),
  notes: z.string().max(1000).optional().nullable()
}).refine(item => !!item.recipeId || !!item.externalCode, 'recipeId or externalCode is required');
const CreateOrderSchema = z.object({
  restaurantId: z.string().uuid(),
  tableNumber: z.number().int().min(0),
  customerId: z.string().uuid().optional().nullable(),
  customerName: z.string().max(160).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  orderType: z.string().max(80).optional().nullable(),
  deliveryInfo: z.record(z.string(), z.unknown()).optional().nullable(),
  items: z.array(PublicItemSchema).min(1).max(100)
});
const AddItemsSchema = z.array(PublicItemSchema).min(1).max(100);

function setCorsHeaders(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin;
  const allowed = typeof origin === 'string' && (
    origin === 'https://app.chefos.online'
    || origin.startsWith('http://localhost:')
    || origin.startsWith('http://127.0.0.1:')
  );
  res.setHeader('Access-Control-Allow-Origin', allowed ? origin : 'https://app.chefos.online');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

function extractToken(req: VercelRequest): string | null {
  const value = req.query?.token || req.body?.token || req.body?.session_token || req.body?.sessionToken;
  const token = Array.isArray(value) ? value[0] : value;
  return typeof token === 'string' && token.trim() ? token.trim() : null;
}

function sanitizeText(value: unknown, maxLength = 1000): string | null {
  if (typeof value !== 'string') return null;
  return value.replace(/<[^>]*>/g, '').trim().slice(0, maxLength) || null;
}

function normalizeItem(item: any) {
  return {
    recipeId: item?.recipeId || item?.recipe_id,
    externalCode: item?.externalCode || item?.external_code,
    quantity: item?.quantity,
    notes: item?.notes
  };
}

function normalizeCreatePayload(body: any) {
  const orderData = body?.orderData || {};
  return {
    restaurantId: body?.restaurantId || orderData.user_id,
    tableNumber: body?.tableNumber ?? orderData.table_number ?? 0,
    customerId: body?.customerId ?? orderData.customer_id,
    customerName: body?.customerName ?? orderData.customer_name,
    notes: body?.notes ?? orderData.notes,
    orderType: body?.orderType ?? orderData.order_type,
    deliveryInfo: body?.deliveryInfo ?? orderData.delivery_info,
    items: Array.isArray(body?.items) ? body.items.map(normalizeItem) : body?.items
  };
}

function optionRecipeIds(notes: string | null | undefined): string[] {
  const match = notes?.match(/\[OPT_RECIPE_IDS:([^\]]+)\]/);
  if (!match) return [];
  return match[1].split(',').map(value => value.trim()).filter(value => TokenSchema.safeParse(value).success);
}

async function buildOrderItems(restaurantId: string, orderId: string, items: z.infer<typeof PublicItemSchema>[]) {
  const baseIds = items.map(item => item.recipeId).filter((value): value is string => !!value);
  const externalCodes = items.map(item => item.externalCode).filter((value): value is string => !!value);
  const optionIds = items.flatMap(item => optionRecipeIds(item.notes));
  const allIds = [...new Set([...baseIds, ...optionIds])];

  const recipeQueries: any[] = [];
  if (allIds.length) {
    recipeQueries.push(
      supabase.from('recipes')
        .select('id,name,price,operational_cost,external_code,user_id,store_id')
        .or(`user_id.eq.${restaurantId},store_id.eq.${restaurantId}`)
        .in('id', allIds)
        .is('deleted_at', null)
    );
  }
  if (externalCodes.length) {
    recipeQueries.push(
      supabase.from('recipes')
        .select('id,name,price,operational_cost,external_code,user_id,store_id')
        .or(`user_id.eq.${restaurantId},store_id.eq.${restaurantId}`)
        .in('external_code', externalCodes)
        .is('deleted_at', null)
    );
  }

  const [recipeResults, { data: stations, error: stationError }] = await Promise.all([
    Promise.all(recipeQueries),
    supabase.from('stations').select('id').eq('user_id', restaurantId).limit(1)
  ]);
  const recipeError = recipeResults.find(result => result.error)?.error;
  if (recipeError) throw recipeError;
  if (stationError) throw stationError;
  if (!stations?.length) throw new Error('No production station configured');

  const recipes = [...new Map(
    recipeResults.flatMap(result => result.data || []).map(recipe => [recipe.id, recipe])
  ).values()];

  const recipesById = new Map((recipes || []).map(recipe => [recipe.id, recipe]));
  const recipesByCode = new Map((recipes || []).filter(recipe => recipe.external_code).map(recipe => [recipe.external_code, recipe]));
  const resolvedItems = items.map(item => ({ item, recipe: item.recipeId ? recipesById.get(item.recipeId) : recipesByCode.get(item.externalCode!) }));
  if (resolvedItems.some(entry => !entry.recipe)) throw new Error('One or more recipes were not found');

  const recipeIds = [...new Set(resolvedItems.map(entry => entry.recipe!.id))];
  const { data: preparations, error: preparationError } = await supabase
    .from('recipe_preparations')
    .select('id,recipe_id,station_id,name')
    .in('recipe_id', recipeIds)
    .is('deleted_at', null);
  if (preparationError) throw preparationError;
  const preparationsByRecipe = new Map<string, any[]>();
  for (const preparation of preparations || []) {
    preparationsByRecipe.set(preparation.recipe_id, [...(preparationsByRecipe.get(preparation.recipe_id) || []), preparation]);
  }

  const statusTimestamps = { PENDENTE: new Date().toISOString() };
  return resolvedItems.flatMap(({ item, recipe }) => {
    const extras = optionRecipeIds(item.notes).map(id => recipesById.get(id)).filter(Boolean);
    const fullPrice = Number(recipe!.price || 0) + extras.reduce((sum, extra) => sum + Number(extra!.price || 0), 0);
    const fullCost = Number(recipe!.operational_cost || 0) + extras.reduce((sum, extra) => sum + Number(extra!.operational_cost || 0), 0);
    const recipePreparations = preparationsByRecipe.get(recipe!.id) || [];
    const sanitizedNotes = sanitizeText(item.notes);

    if (!recipePreparations.length) {
      return [{
        order_id: orderId, recipe_id: recipe!.id, name: recipe!.name,
        quantity: item.quantity, price: fullPrice, original_price: fullPrice,
        unit_cost: fullCost, notes: sanitizedNotes, status: 'PENDENTE',
        station_id: stations[0].id, status_timestamps: statusTimestamps, user_id: restaurantId
      }];
    }

    const groupId = randomUUID();
    return recipePreparations.map((preparation, index) => ({
      order_id: orderId, recipe_id: recipe!.id, name: `${recipe!.name} (${preparation.name})`,
      quantity: item.quantity, price: fullPrice / recipePreparations.length,
      original_price: fullPrice / recipePreparations.length,
      unit_cost: fullCost / recipePreparations.length,
      notes: index === 0 ? sanitizedNotes : null, status: 'PENDENTE',
      station_id: preparation.station_id || stations[0].id, group_id: groupId,
      status_timestamps: statusTimestamps, user_id: restaurantId
    }));
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  if (!supabaseUrl || !serviceRoleKey) return res.status(503).json({ error: 'Service unavailable' });

  const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const rateLimit = await checkRateLimit(`public-order:${clientIp}`, req.method === 'GET' ? 120 : 40, 60);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(Math.ceil(rateLimit.resetMs / 1000)));
    return res.status(429).json({ error: 'Too many requests' });
  }

  try {
    if (req.method === 'GET') {
      const tokenResult = TokenSchema.safeParse(extractToken(req));
      if (!tokenResult.success) return res.status(400).json({ error: 'A valid session token is required' });
      const { data: order, error } = await supabase
        .from('orders')
        .select('id,table_number,timestamp,order_type,customer_name,customer_count,completed_at,user_id,customer_id,status,notes,delivery_info,session_token,order_items(id,recipe_id,name,quantity,notes,status,station_id,course,status_timestamps,created_at,group_id,price,original_price,unit_cost)')
        .eq('session_token', tokenResult.data)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      if (!order) return res.status(404).json({ error: 'Order session not found' });
      return res.status(200).json({ order });
    }

    const token = extractToken(req);
    const isCreate = req.body?.create === true || (!token && !!(req.body?.restaurantId || req.body?.orderData?.user_id));
    if (isCreate) {
      const parsed = CreateOrderSchema.safeParse(normalizeCreatePayload(req.body));
      if (!parsed.success) return res.status(400).json({ error: 'Invalid order payload', details: parsed.error.issues });
      const payload = parsed.data;
      const { data: newOrder, error } = await supabase.rpc('create_order_with_items', {
        p_restaurant_id: payload.restaurantId,
        p_order_data: {
          tableNumber: payload.tableNumber,
          customerId: payload.customerId,
          customerName: sanitizeText(payload.customerName, 160),
          notes: sanitizeText(payload.notes),
          orderType: payload.orderType,
          deliveryInfo: payload.deliveryInfo
        },
        p_items: payload.items.map(item => ({ ...item, notes: sanitizeText(item.notes) })),
        p_idempotency_key: randomUUID()
      });
      if (error) {
        console.error('[API /public-order] Creation failed:', error);
        return res.status(400).json({ error: 'Unable to create order' });
      }
      return res.status(201).json({ success: true, order: newOrder });
    }

    const tokenResult = TokenSchema.safeParse(token);
    if (!tokenResult.success) return res.status(401).json({ error: 'A valid session token is required' });
    const { data: sessionOrder, error: sessionError } = await supabase
      .from('orders')
      .select('id,user_id,status')
      .eq('session_token', tokenResult.data)
      .is('deleted_at', null)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!sessionOrder) return res.status(403).json({ error: 'Order session is not authorized' });
    if (req.body?.orderId && req.body.orderId !== sessionOrder.id) return res.status(403).json({ error: 'Order does not match session' });

    if (req.body?.insertItems) {
      if (sessionOrder.status !== 'OPEN') return res.status(409).json({ error: 'Order is not open for new items' });
      if (!Array.isArray(req.body.insertItems)) return res.status(400).json({ error: 'insertItems must be an array' });
      const parsedItems = AddItemsSchema.safeParse(req.body.insertItems.map(normalizeItem));
      if (!parsedItems.success) return res.status(400).json({ error: 'Invalid items payload', details: parsedItems.error.issues });
      let rows;
      try {
        rows = await buildOrderItems(sessionOrder.user_id, sessionOrder.id, parsedItems.data);
      } catch (error: any) {
        if (error?.message?.includes('not found')) return res.status(404).json({ error: 'One or more recipes were not found' });
        if (error?.message?.includes('station')) return res.status(409).json({ error: 'No production station is configured' });
        throw error;
      }
      const { data: insertedItems, error } = await supabase.from('order_items').insert(rows).select('id,recipe_id,name,quantity,notes,status,station_id,group_id,price,original_price,unit_cost');
      if (error) throw error;
      return res.status(200).json({ success: true, items: insertedItems || [] });
    }

    const updates = req.body?.updates;
    if (!updates) return res.status(400).json({ error: 'Missing updates' });
    if (updates.action === 'GENERATE_PIX') {
      const { data: orderItems, error: itemsError } = await supabase
        .from('order_items').select('quantity,price').eq('order_id', sessionOrder.id).neq('status', 'CANCELADO');
      if (itemsError) throw itemsError;
      const total = (orderItems || []).reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
      const { data: credentials, error: credentialsError } = await supabase
        .from('store_integration_credentials').select('mp_access_token').eq('store_id', sessionOrder.user_id).maybeSingle();
      if (credentialsError) throw credentialsError;
      const mpToken = credentials?.mp_access_token || process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MERCADO_PAGO_ACCESS_TOKEN;
      if (!mpToken) return res.status(400).json({ error: 'Mercado Pago is not configured' });
      if (total <= 0) return res.status(400).json({ error: 'Invalid order total' });

      const paymentResponse = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: { Authorization: `Bearer ${mpToken}`, 'X-Idempotency-Key': `${sessionOrder.id}-${randomUUID()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_amount: total, description: `Pedido ${sessionOrder.id.slice(0, 8).toUpperCase()}`, payment_method_id: 'pix', payer: { email: 'cliente@email.com' } })
      });
      const payment: any = await paymentResponse.json();
      if (!paymentResponse.ok) return res.status(502).json({ error: 'Payment provider rejected the request' });
      return res.status(200).json({ success: true, qr_code: payment.point_of_interaction?.transaction_data?.qr_code, qr_code_base64: payment.point_of_interaction?.transaction_data?.qr_code_base64, payment_id: payment.id });
    }

    if (updates.action === 'FINALIZE' || updates.action === 'APPLY_DISCOUNT') {
      return res.status(403).json({ error: 'Manager action is not allowed on the public endpoint' });
    }
    const allowedUpdates: Record<string, string | null> = {};
    if (updates.customer_name !== undefined) allowedUpdates.customer_name = sanitizeText(updates.customer_name, 160);
    if (updates.notes !== undefined) allowedUpdates.notes = sanitizeText(updates.notes);
    if (!Object.keys(allowedUpdates).length) return res.status(400).json({ error: 'No valid updates' });
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders').update(allowedUpdates).eq('id', sessionOrder.id).select('id,customer_name,notes,status').single();
    if (updateError) throw updateError;
    return res.status(200).json({ order: updatedOrder });
  } catch (error) {
    console.error('[API /public-order] Request failed:', error);
    return res.status(500).json({ error: 'Unable to process public order' });
  }
}
