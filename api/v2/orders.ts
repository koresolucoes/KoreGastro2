import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { OrderItem, OrderItemStatus, Recipe, RecipePreparation } from '../../src/models/db.models.js';
import { v4 as uuidv4 } from 'uuid';
import { triggerWebhook } from '../webhook-emitter.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface RequestItem {
  externalCode: string;
  quantity: number;
  notes?: string;
}

async function authenticateRequest(request: VercelRequest): Promise<{ restaurantId?: string; error?: { message: string }; status?: number }> {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { error: { message: 'Authorization header is missing or invalid.' }, status: 401 };
    }
    const providedApiKey = authHeader.split(' ')[1];
    const restaurantId = (request.query.restaurantId || request.body.restaurantId) as string;
    if (!restaurantId) {
        return { error: { message: '`restaurantId` is required.' }, status: 400 };
    }
    const { data: profile, error: profileError } = await supabase.from('company_profile').select('external_api_key').eq('user_id', restaurantId).single();
    if (profileError || !profile || !profile.external_api_key) {
        return { error: { message: 'Invalid `restaurantId` or API key not configured.' }, status: 403 };
    }
    if (providedApiKey !== profile.external_api_key) {
        return { error: { message: 'Invalid API key.' }, status: 403 };
    }
    return { restaurantId };
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    return response.status(204).end();
  }

  try {
    const authResult = await authenticateRequest(request);
    if (authResult.error) {
        return response.status(authResult.status!).json({ error: authResult.error });
    }
    const restaurantId = authResult.restaurantId!;

    // Custom subresource routing for POST
    const { orderId, subresource } = request.query;
    if (request.method === 'POST' && orderId && typeof orderId === 'string' && subresource) {
        if (subresource === 'items') {
            await handleAddItems(request, response, restaurantId, orderId);
            return;
        }
        if (subresource === 'request-payment') {
            await handleRequestPayment(request, response, restaurantId, orderId);
            return;
        }
    }

    switch (request.method) {
      case 'GET':
        await handleGet(request, response, restaurantId);
        break;
      case 'POST':
        await handlePost(request, response, restaurantId);
        break;
      case 'DELETE':
        await handleDelete(request, response, restaurantId);
        break;
      default:
        response.setHeader('Allow', ['GET', 'POST', 'DELETE']);
        response.status(405).json({ error: { message: `Method ${request.method} Not Allowed` } });
    }
  } catch (error: any) {
    console.error('[API /v2/orders] Fatal error:', error);
    return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { orderId, status, tableNumber, customerId } = req.query;

    if (orderId && typeof orderId === 'string') {
        const { data, error } = await supabase.from('orders').select('*, customers(*), order_items(*)').eq('id', orderId).eq('user_id', restaurantId).single();
        if (error) {
            if (error.code === 'PGRST116') return res.status(404).json({ error: { message: `Order with id "${orderId}" not found.` } });
            throw error;
        }
        return res.status(200).json(data);
    }
    
    let query = supabase.from('orders').select('*, customers(*), order_items(*)').eq('user_id', restaurantId);
    if (status) query = query.eq('status', status as string);
    if (tableNumber) query = query.eq('table_number', tableNumber as string);
    if (customerId) query = query.eq('customer_id', customerId as string);

    const { data, error } = await query.order('timestamp', { ascending: false });
    if (error) throw error;
    return res.status(200).json(data || []);
}

async function handlePost(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { tableNumber, customerId, items } = req.body;
    if (tableNumber === undefined || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: { message: '`tableNumber` and a non-empty `items` array are required.' } });
    }

    const { data: table } = await supabase.from('tables').select('id').eq('user_id', restaurantId).eq('number', tableNumber).maybeSingle();
    if (tableNumber > 0 && !table) {
        return res.status(404).json({ error: { message: `Table #${tableNumber} not found.` } });
    }
    
    const { data: newOrder, error: orderError } = await supabase.from('orders').insert({
        user_id: restaurantId,
        table_number: tableNumber,
        order_type: tableNumber > 0 ? 'Dine-in' : 'QuickSale',
        status: 'OPEN',
        customer_id: customerId || null,
    }).select().single();
    if (orderError) throw orderError;
    
    try {
        const orderItemsToInsert = await buildOrderItems(restaurantId, newOrder.id, items);
        const { data: insertedItems, error: itemsError } = await supabase.from('order_items').insert(orderItemsToInsert).select();
        if (itemsError) throw itemsError;

        if (table) {
            await supabase.from('tables').update({ status: 'OCUPADA' }).eq('id', table.id);
        }
        
        const finalOrder = { ...newOrder, order_items: insertedItems };
        triggerWebhook(restaurantId, 'order.created', finalOrder).catch(console.error);
        return res.status(201).json(finalOrder);

    } catch (error: any) {
        await supabase.from('orders').delete().eq('id', newOrder.id);
        if (error.message.includes('not found')) {
            return res.status(404).json({ error: { message: error.message } });
        }
        throw error;
    }
}

async function handleDelete(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { orderId } = req.query;
    if (!orderId || typeof orderId !== 'string') {
        return res.status(400).json({ error: { message: 'An `orderId` is required in the query parameters.' } });
    }
    const { data, error } = await supabase.from('orders').update({ status: 'CANCELLED', completed_at: new Date().toISOString() }).eq('id', orderId).eq('user_id', restaurantId).eq('status', 'OPEN').select().single();
    if (error) {
        if (error.code === 'PGRST116') return res.status(404).json({ error: { message: `Open order with id "${orderId}" not found.` } });
        throw error;
    }
    triggerWebhook(restaurantId, 'order.updated', data).catch(console.error);
    return res.status(200).json(data);
}

// --- Subresource Handlers ---
async function handleAddItems(req: VercelRequest, res: VercelResponse, restaurantId: string, orderId: string) {
    const { items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: { message: 'A non-empty `items` array is required.' } });
    }
    
    const { data: order, error: orderError } = await supabase.from('orders').select('id').eq('id', orderId).eq('status', 'OPEN').single();
    if (orderError) return res.status(404).json({ error: { message: `Open order with id "${orderId}" not found.` } });
    
    try {
        const orderItemsToInsert = await buildOrderItems(restaurantId, orderId, items);
        const { data: insertedItems, error: itemsError } = await supabase.from('order_items').insert(orderItemsToInsert).select();
        if (itemsError) throw itemsError;
        
        triggerWebhook(restaurantId, 'order.updated', { orderId, itemsAdded: insertedItems }).catch(console.error);
        return res.status(200).json(insertedItems);
    } catch (error: any) {
        if (error.message.includes('not found')) {
            return res.status(404).json({ error: { message: error.message } });
        }
        throw error;
    }
}

async function handleRequestPayment(req: VercelRequest, res: VercelResponse, restaurantId: string, orderId: string) {
    const { data: order, error: orderError } = await supabase.from('orders').select('table_number').eq('id', orderId).eq('user_id', restaurantId).single();
    if (orderError || !order || order.table_number <= 0) {
        return res.status(404).json({ error: { message: `Dine-in order with id "${orderId}" not found.` } });
    }
    
    const { error: tableError } = await supabase.from('tables').update({ status: 'PAGANDO' }).eq('user_id', restaurantId).eq('number', order.table_number);
    if (tableError) throw tableError;
    
    return res.status(200).json({ success: true, message: `Table #${order.table_number} status updated to PAGANDO.` });
}


// --- Helper Functions ---
async function buildOrderItems(restaurantId: string, orderId: string, items: RequestItem[]): Promise<Partial<OrderItem>[]> {
    const externalCodes = items.map(i => i.externalCode);
    const { data: recipes, error: recipeError } = await supabase.from('recipes').select('*').eq('user_id', restaurantId).in('external_code', externalCodes);
    if (recipeError) throw new Error(`Error fetching recipes: ${recipeError.message}`);

    const recipesMap = new Map<string, Recipe>(recipes!.map(r => [r.external_code!, r]));
    const missingCodes = externalCodes.filter(code => !recipesMap.has(code));
    if (missingCodes.length > 0) {
        throw new Error(`Recipe(s) not found for external codes: ${missingCodes.join(', ')}`);
    }

    const { data: stations } = await supabase.from('stations').select('id').eq('user_id', restaurantId).limit(1);
    if (!stations || stations.length === 0) throw new Error('No production stations found for this restaurant.');
    const fallbackStationId = stations[0].id;
    
    const { data: preps } = await supabase.from('recipe_preparations').select('*').in('recipe_id', Array.from(recipesMap.values()).map(r => r.id));
    const prepsMap = new Map<string, RecipePreparation[]>();
    preps?.forEach(p => {
        if (!prepsMap.has(p.recipe_id)) prepsMap.set(p.recipe_id, []);
        prepsMap.get(p.recipe_id)!.push(p);
    });

    const status_timestamps = { 'PENDENTE': new Date().toISOString() };

    return items.flatMap(item => {
        const recipe = recipesMap.get(item.externalCode)!;
        const recipePreps = prepsMap.get(recipe.id);
        const finalPrice = recipe.price; // Price overrides are not supported in V2 yet

        if (recipePreps && recipePreps.length > 0) {
            const groupId = uuidv4();
            return recipePreps.map((prep, prepIndex) => ({
                order_id: orderId, recipe_id: recipe.id, name: `${recipe.name} (${prep.name})`,
                quantity: item.quantity, price: finalPrice / recipePreps.length, original_price: recipe.price / recipePreps.length,
                notes: prepIndex === 0 ? item.notes : null, status: 'PENDENTE' as OrderItemStatus,
                station_id: prep.station_id, group_id: groupId, status_timestamps, user_id: restaurantId,
            }));
        } else {
            return [{
                order_id: orderId, recipe_id: recipe.id, name: recipe.name,
                quantity: item.quantity, price: finalPrice, original_price: recipe.price,
                notes: item.notes, status: 'PENDENTE' as OrderItemStatus,
                station_id: fallbackStationId, status_timestamps, user_id: restaurantId
            }];
        }
    });
}
