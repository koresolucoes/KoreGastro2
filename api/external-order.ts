
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { OrderItem, OrderStatus, OrderType, Customer, Recipe, RecipePreparation, OrderItemStatus } from '../src/models/db.models.js';
import { v4 as uuidv4 } from 'uuid';
import { triggerWebhook } from './webhook-emitter.js';

// This is a separate client instance using the service role key for admin-level access
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Payload validation interfaces
interface RequestItem {
  externalCode: string;
  quantity: number;
  notes?: string;
  price?: number; // Optional price override
}

interface RequestBody {
  restaurantId: string;
  tableNumber: number; // For Dine-in, use 0 for QuickSale/takeout.
  orderTypeLabel?: string; // Optional label for the origin (e.g., "Totem 1", "App de Entrega")
  externalId?: string; // Optional ID from the external system
  customer?: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
  };
  items: RequestItem[];
}

interface PatchRequestBody {
    restaurantId: string;
    orderId: string;
    items: RequestItem[];
}

// Main handler
export default async function handler(request: VercelRequest, response: VercelResponse) {
  // CORS headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, GET, PATCH, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    return response.status(204).end();
  }

  try {
    // 1. Authentication
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.status(401).json({ error: { message: 'Authorization header is missing or invalid. Expected: Bearer YOUR_API_KEY' } });
    }
    const providedApiKey = authHeader.split(' ')[1];

    const restaurantId = (request.query.restaurantId || request.body.restaurantId) as string;

    if (!restaurantId) {
        return response.status(400).json({ error: { message: '`restaurantId` is required in the request body or query string.' } });
    }

    const { data: profile, error: profileError } = await supabase
      .from('company_profile')
      .select('external_api_key')
      .eq('user_id', restaurantId)
      .single();

    if (profileError || !profile || !profile.external_api_key) {
      return response.status(403).json({ error: { message: 'Invalid `restaurantId` or API key not configured for this restaurant.' } });
    }

    if (providedApiKey !== profile.external_api_key) {
      return response.status(403).json({ error: { message: 'Invalid API key.' } });
    }
    
    // 2. Method Routing
    switch (request.method) {
        case 'GET':
            await handleGet(request, response, restaurantId);
            break;
        case 'POST':
            await handlePost(request, response, restaurantId);
            break;
        case 'PATCH':
            await handlePatch(request, response, restaurantId);
            break;
        default:
            response.setHeader('Allow', ['GET', 'POST', 'PATCH']);
            response.status(405).json({ error: { message: `Method ${request.method} Not Allowed` } });
    }
  } catch (error: any) {
    console.error('[API /external-order] Fatal error:', error);
    return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
  }
}

async function handleGet(request: VercelRequest, response: VercelResponse, restaurantId: string) {
    // --- Handle GET request to fetch menu ---
    const { data: menuItems, error: menuError } = await supabase
        .from('recipes')
        .select('name, description, price, external_code')
        .eq('user_id', restaurantId)
        .eq('is_available', true)
        .not('external_code', 'is', null);

    if (menuError) {
        throw new Error(`Error fetching menu: ${menuError.message}`);
    }

    return response.status(200).json({ menu: menuItems });
}

async function handlePost(request: VercelRequest, response: VercelResponse, restaurantId: string) {
    const body: RequestBody = request.body;
    const { items } = body;

    // Payload Validation for POST
    if (body.tableNumber === undefined || body.tableNumber === null) {
        return response.status(400).json({ error: { message: '`tableNumber` is required.' } });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
        return response.status(400).json({ error: { message: '`items` array is required and cannot be empty.' } });
    }
    for (const item of items) {
        if (!item.externalCode || !item.quantity || item.quantity <= 0) {
            return response.status(400).json({ error: { message: 'Each item must have a valid `externalCode` and `quantity`.' } });
        }
    }

    // Data Processing for POST
    let customerId: string | null = null;
    let customerDataForWebhook: Customer | null = null;
    if (body.customer?.name) {
        const { data: existingCustomer } = await supabase
            .from('customers')
            .select('*')
            .eq('user_id', restaurantId)
            .eq('name', body.customer.name)
            .maybeSingle();

        if (existingCustomer) {
            customerId = existingCustomer.id;
            customerDataForWebhook = existingCustomer;
        } else {
            const { data: newCustomer, error: customerError } = await supabase
                .from('customers')
                .insert({
                    user_id: restaurantId,
                    name: body.customer.name,
                    phone: body.customer.phone || null,
                    email: body.customer.email || null,
                    address: body.customer.address || null,
                })
                .select('*')
                .single();
            if (customerError) throw new Error(`Could not create customer: ${customerError.message}`);
            customerId = newCustomer!.id;
            customerDataForWebhook = newCustomer;
        }
    }

    // Call the transactional RPC
    const { data: finalOrder, error } = await supabase.rpc('create_order_with_items', {
        p_restaurant_id: restaurantId,
        p_order_data: { 
            tableNumber: body.tableNumber, 
            customerId: customerId,
            // Pass external info as notes for the first item (handled in RPC or webhook)
            notes: body.orderTypeLabel || body.externalId ? `Origem: ${body.orderTypeLabel || 'Desconhecida'}. ID Externo: ${body.externalId || 'N/A'}` : null
        },
        p_items: items
    });

    if (error) {
        if (error.message.includes('not found')) {
            return response.status(404).json({ error: { message: error.message } });
        }
        throw error;
    }

    // Trigger 'order.created' or 'delivery.created' webhook
    try {
        const effectiveOrderType = finalOrder.order_type;
        const webhookEvent = effectiveOrderType === 'External-Delivery' ? 'delivery.created' : 'order.created';
        const webhookPayload = {
            orderId: finalOrder.id,
            tableNumber: finalOrder.table_number,
            orderType: finalOrder.order_type,
            status: finalOrder.status,
            timestamp: finalOrder.created_at,
            customer: customerDataForWebhook,
            items: finalOrder.order_items.map((item: any) => ({
                name: item.name,
                quantity: item.quantity,
                price: item.price,
                notes: item.notes,
            })),
            externalInfo: {
                label: body.orderTypeLabel,
                id: body.externalId,
            },
        };
        await triggerWebhook(restaurantId, webhookEvent, webhookPayload);
    } catch (whError: any) {
        console.error(`[API /external-order] Webhook trigger failed for order ${finalOrder.id}:`, whError.message);
    }

    return response.status(201).json({
        success: true,
        message: 'Order created successfully and sent to KDS.',
        orderId: finalOrder.id
    });
}

async function handlePatch(request: VercelRequest, response: VercelResponse, restaurantId: string) {
    const body: PatchRequestBody = request.body;
    const { orderId, items } = body;
    
    if (!orderId) return response.status(400).json({ error: { message: '`orderId` is required.' } });
    if (!items || !Array.isArray(items) || items.length === 0) {
        return response.status(400).json({ error: { message: '`items` array is required and cannot be empty.' } });
    }
    for (const item of items) {
        if (!item.externalCode || !item.quantity || item.quantity <= 0) {
            return response.status(400).json({ error: { message: 'Each item must have a valid `externalCode` and `quantity`.' } });
        }
    }
    
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, table_number, order_type, status, timestamp, customers(*)')
      .eq('id', orderId)
      .eq('user_id', restaurantId)
      .eq('status', 'OPEN')
      .single();
      
    if (orderError) {
        if (orderError.code === 'PGRST116') return response.status(404).json({ error: { message: `Open order with id "${orderId}" not found.` } });
        throw new Error(`Error fetching order: ${orderError.message}`);
    }

    const externalCodes = items.map(i => i.externalCode);
    const { data: recipes, error: recipeError } = await supabase
        .from('recipes')
        .select('*')
        .eq('user_id', restaurantId)
        .in('external_code', externalCodes);
    if (recipeError) throw new Error(`Error fetching recipes: ${recipeError.message}`);

    const recipesMap = new Map<string, Recipe>(recipes!.map(r => [r.external_code!, r]));
    const missingCodes = externalCodes.filter(code => !recipesMap.has(code));
    if (missingCodes.length > 0) {
        return response.status(404).json({ error: { message: `Recipe(s) not found for external codes: ${missingCodes.join(', ')}` } });
    }

    const orderItemsToInsert = await buildOrderItems(restaurantId, order.id, items, recipesMap);
    
    const { data: insertedItems, error: itemsError } = await supabase.from('order_items').insert(orderItemsToInsert).select();
    if (itemsError) {
        throw new Error(`Error creating order items: ${itemsError.message}`);
    }

     // Trigger 'order.updated' webhook
    try {
        const { data: allItems } = await supabase.from('order_items').select('*').eq('order_id', orderId);
        const webhookPayload = {
            ...order,
            itemsAdded: insertedItems,
            allItems: allItems || [],
        };
        await triggerWebhook(restaurantId, 'order.updated', webhookPayload);
    } catch (whError: any) {
        console.error(`[API /external-order] Webhook trigger failed for order update ${orderId}:`, whError.message);
    }
    
    return response.status(200).json({
        success: true,
        message: 'Items added to order successfully.',
        orderId: order.id
    });
}

async function buildOrderItems(
    restaurantId: string,
    orderId: string,
    items: RequestItem[],
    recipesMap: Map<string, Recipe>,
    orderTypeLabel?: string,
    externalId?: string
): Promise<Partial<OrderItem>[]> {
    const recipeIds = Array.from(recipesMap.values()).map(r => r.id);
    const { data: stations } = await supabase.from('stations').select('id').eq('user_id', restaurantId).limit(1);
    if (!stations || stations.length === 0) throw new Error('No production stations found for this restaurant.');
    const fallbackStationId = stations[0].id;
    
    const { data: preps } = await supabase.from('recipe_preparations').select('*').in('recipe_id', recipeIds);
    const prepsMap = new Map<string, RecipePreparation[]>();
    preps?.forEach(p => {
        if (!prepsMap.has(p.recipe_id)) prepsMap.set(p.recipe_id, []);
        prepsMap.get(p.recipe_id)!.push(p);
    });

    const status_timestamps = { 'PENDENTE': new Date().toISOString() };
    const baseOrderNotes = orderTypeLabel || externalId
      ? `Pedido externo via API. Origem: ${orderTypeLabel || 'Desconhecida'}. ID Externo: ${externalId || 'N/A'}`
      : null;

    return items.flatMap((item, itemIndex) => {
        const recipe = recipesMap.get(item.externalCode)!;
        const recipePreps = prepsMap.get(recipe.id);
        const finalPrice = item.price !== undefined ? item.price : recipe.price;

        let baseNotes = item.notes;
        // Only add the main order notes to the very first item being inserted in this batch
        if (itemIndex === 0 && baseOrderNotes) {
            baseNotes = `${baseOrderNotes}${item.notes ? `\n---\n${item.notes}` : ''}`.trim();
        }

        if (recipePreps && recipePreps.length > 0) {
            const groupId = uuidv4();
            return recipePreps.map((prep, prepIndex) => ({
                order_id: orderId,
                recipe_id: recipe.id,
                name: `${recipe.name} (${prep.name})`,
                quantity: item.quantity,
                price: finalPrice / recipePreps.length,
                original_price: recipe.price / recipePreps.length,
                notes: prepIndex === 0 ? baseNotes : null, // Notes only on the first item of the group
                status: 'PENDENTE' as OrderItemStatus,
                station_id: prep.station_id,
                group_id: groupId,
                status_timestamps,
                user_id: restaurantId
            }));
        } else {
            return [{
                order_id: orderId,
                recipe_id: recipe.id,
                name: recipe.name,
                quantity: item.quantity,
                price: finalPrice,
                original_price: recipe.price,
                notes: baseNotes,
                status: 'PENDENTE' as OrderItemStatus,
                station_id: fallbackStationId,
                status_timestamps,
                user_id: restaurantId
            }];
        }
    });
}
