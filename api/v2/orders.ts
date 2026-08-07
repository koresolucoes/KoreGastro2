import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { OrderItem, OrderItemStatus, Recipe, RecipePreparation } from '../../src/models/db.models.js';
import { v4 as uuidv4 } from 'uuid';
import { triggerWebhook } from '../webhook-emitter.js';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

import { withAuth, supabase } from '../utils/api-handler.js';

const window = new JSDOM('').window;
const purify = DOMPurify(window as any);

interface RequestItem {
  externalCode: string;
  quantity: number;
  notes?: string | null;
}

export default withAuth(async function handler(req: any, res: any, restaurantId: string) {
    // Custom subresource routing for GET
    const { orderId, subresource } = req.query;

    if (req.method === 'GET' && orderId && typeof orderId === 'string' && subresource === 'summary') {
        await handleGetSummary(req, res, restaurantId, orderId);
        return;
    }

    // Custom subresource routing for POST
    if (req.method === 'POST' && orderId && typeof orderId === 'string' && subresource) {
        if (subresource === 'items') {
            await handleAddItems(req, res, restaurantId, orderId);
            return;
        }
        if (subresource === 'req-payment') {
            await handleRequestPayment(req, res, restaurantId, orderId);
            return;
        }
    }

    switch (req.method) {
      case 'GET':
        await handleGet(req, res, restaurantId);
        break;
      case 'POST':
        await handlePost(req, res, restaurantId);
        break;
      case 'DELETE':
        await handleDelete(req, res, restaurantId);
        break;
      default:
        res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
        res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } });
    }
});

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

    query = query.is('deleted_at', null);

    const limit = parseInt(req.query.limit as string) || 50;
    if (req.query.cursor) query = query.lt('timestamp', req.query.cursor as string);

    const { data, error } = await query.order('timestamp', { ascending: false }).limit(limit);
    if (error) throw error;
    return res.status(200).json(data || []);
}

const postOrderSchema = z.object({
    tableNumber: z.number().min(0, "tableNumber must be 0 or greater"),
    customerId: z.string().uuid("customerId must be a valid UUID").optional().nullable(),
    items: z.array(z.object({
        externalCode: z.string().min(1, "externalCode is required"),
        quantity: z.number().positive("quantity must be positive"),
        notes: z.string().optional().nullable()
    })).min(1, "items array cannot be empty")
});

async function handlePost(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const parsed = postOrderSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
    }
    const { tableNumber, customerId, items } = parsed.data;

    const idempotencyKey = (req.headers['x-idempotency-key'] as string) || (req.headers['idempotency-key'] as string);

    const rpcPayload: any = {
        p_restaurant_id: restaurantId,
        p_order_data: { tableNumber, customerId },
        p_items: items
    };

    if (idempotencyKey) {
        rpcPayload.p_idempotency_key = idempotencyKey;
    }

    const { data: finalOrder, error } = await supabase.rpc('create_order_with_items', rpcPayload);

    if (error) {
        if (error.message.includes('not found')) {
            return res.status(404).json({ error: { message: error.message } });
        }
        throw error;
    }

    await triggerWebhook(restaurantId, 'order.created', finalOrder).catch(console.error);
    return res.status(201).json(finalOrder);
}

async function handleDelete(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { orderId } = req.query;
    if (!orderId || typeof orderId !== 'string') {
        return res.status(400).json({ error: { message: 'An `orderId` is required in the query parameters.' } });
    }
    const { data, error } = await supabase.from('orders').update({ status: 'CANCELLED', completed_at: new Date().toISOString() }).eq('id', orderId).eq('user_id', restaurantId).in('status', ['OPEN', 'PAYING']).select().single();
    if (error) {
        if (error.code === 'PGRST116') return res.status(404).json({ error: { message: `Active order with id "${orderId}" not found.` } });
        throw error;
    }
    await triggerWebhook(restaurantId, 'order.updated', data).catch(console.error);
    return res.status(200).json(data);
}

async function handleGetSummary(req: VercelRequest, res: VercelResponse, restaurantId: string, orderId: string) {
    const { data: order, error } = await supabase
        .from('orders')
        .select(`
            id,
            table_number,
            status,
            customers ( name, phone ),
            order_items ( name, quantity, price, notes )
        `)
        .eq('id', orderId)
        .eq('user_id', restaurantId)
        .single();
    
    if (error) {
        if (error.code === 'PGRST116') {
            return res.status(404).json({ error: { message: `Order with id "${orderId}" not found.` } });
        }
        throw error;
    }

    const items = (order.order_items as any[])?.map((item: any) => {
        const itemPriceCents = Math.round((item.price || 0) * 100);
        const qty = item.quantity || 1;
        const itemTotalCents = itemPriceCents * qty;
        return {
            name: item.name,
            quantity: qty,
            price: itemPriceCents / 100,
            total: itemTotalCents / 100,
            notes: item.notes,
        };
    }) || [];

    const subtotalCents = items.reduce((acc: number, item: any) => acc + Math.round(item.total * 100), 0);
    const serviceFeeCents = Math.round(subtotalCents * 0.10); // Standard 10%
    const totalCents = subtotalCents + serviceFeeCents;
    
    const responsePayload = {
        orderId: order.id,
        tableNumber: order.table_number,
        status: order.status,
        customer: order.customers,
        items: items,
        summary: {
            subtotal: subtotalCents / 100,
            serviceFee: serviceFeeCents / 100,
            total: totalCents / 100,
        }
    };
    
    return res.status(200).json(responsePayload);
}

// --- Subresource Handlers ---
const addItemsSchema = z.object({
    items: z.array(z.object({
        externalCode: z.string().min(1, "externalCode is required"),
        quantity: z.number().positive("quantity must be positive"),
        notes: z.string().optional().nullable()
    })).min(1, "items array cannot be empty")
});

async function handleAddItems(req: VercelRequest, res: VercelResponse, restaurantId: string, orderId: string) {
    const parsed = addItemsSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
    }
    const { items } = parsed.data;
    
    const { data: order, error: orderError } = await supabase.from('orders').select('id').eq('id', orderId).in('status', ['OPEN', 'PAYING']).single();
    if (orderError) return res.status(404).json({ error: { message: `Active order with id "${orderId}" not found.` } });
    
    try {
        const orderItemsToInsert = await buildOrderItems(restaurantId, orderId, items);
        const { data: insertedItems, error: itemsError } = await supabase.from('order_items').insert(orderItemsToInsert).select();
        if (itemsError) throw itemsError;
        
        await triggerWebhook(restaurantId, 'order.updated', { orderId, itemsAdded: insertedItems }).catch(console.error);
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
    
    const { error: orderUpdateError } = await supabase.from('orders').update({ status: 'PAYING' }).eq('id', orderId).eq('user_id', restaurantId);
    if (orderUpdateError) throw orderUpdateError;

    const { error: tableError } = await supabase.from('tables').update({ status: 'PAGANDO' }).eq('user_id', restaurantId).eq('number', order.table_number);
    if (tableError) throw tableError;
    
    await triggerWebhook(restaurantId, 'order.updated', { orderId, status: 'PAYING', tableNumber: order.table_number }).catch(console.error);
    return res.status(200).json({ success: true, message: `Table #${order.table_number} and order status updated to PAYING.` });
}


// --- Helper Functions ---
async function buildOrderItems(restaurantId: string, orderId: string, items: RequestItem[]): Promise<Partial<OrderItem>[]> {
    const externalCodes = items.map(i => i.externalCode);
    const { data: recipes, error: recipeError } = await supabase.from('recipes').select('*').eq('store_id', restaurantId).in('external_code', externalCodes);
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
        const sanitizedNotes = item.notes ? purify.sanitize(item.notes) : null;

        if (recipePreps && recipePreps.length > 0) {
            const groupId = uuidv4();
            return recipePreps.map((prep, prepIndex) => ({
                order_id: orderId, recipe_id: recipe.id, name: `${recipe.name} (${prep.name})`,
                quantity: item.quantity, price: finalPrice / recipePreps.length, original_price: recipe.price / recipePreps.length,
                notes: prepIndex === 0 ? sanitizedNotes : null, status: 'PENDENTE' as OrderItemStatus,
                station_id: prep.station_id, group_id: groupId, status_timestamps, user_id: restaurantId,
            }));
        } else {
            return [{
                order_id: orderId, recipe_id: recipe.id, name: recipe.name,
                quantity: item.quantity, price: finalPrice, original_price: recipe.price,
                notes: sanitizedNotes, status: 'PENDENTE' as OrderItemStatus,
                station_id: fallbackStationId, status_timestamps, user_id: restaurantId
            }];
        }
    });
}
