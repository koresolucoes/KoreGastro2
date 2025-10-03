import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { OrderItem, OrderStatus, OrderType, Customer, Recipe, RecipePreparation, OrderItemStatus } from '../../src/models/db.models';
import { v4 as uuidv4 } from 'uuid';

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
  orderTypeLabel?: string;
  externalId?: string;
  customer?: {
    name: string;
    phone?: string;
    email?: string;
  };
  items: RequestItem[];
}

// Main handler
export default async function handler(request: VercelRequest, response: VercelResponse) {
  // CORS headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    return response.status(204).end();
  }

  if (request.method !== 'POST') {
    return response.status(405).json({ error: { message: 'Only POST requests are allowed' } });
  }

  try {
    const body: RequestBody = request.body;
    const { restaurantId, items } = body;

    // 1. Authentication
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.status(401).json({ error: { message: 'Authorization header is missing or invalid. Expected: Bearer YOUR_API_KEY' } });
    }
    const providedApiKey = authHeader.split(' ')[1];

    if (!restaurantId) {
        return response.status(400).json({ error: { message: '`restaurantId` is required in the request body.' } });
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

    // 2. Payload Validation
    if (!items || !Array.isArray(items) || items.length === 0) {
        return response.status(400).json({ error: { message: '`items` array is required and cannot be empty.' } });
    }
    for (const item of items) {
        if (!item.externalCode || !item.quantity || item.quantity <= 0) {
            return response.status(400).json({ error: { message: 'Each item must have a valid `externalCode` and `quantity`.' } });
        }
    }

    // 3. Data Processing
    // Get/Create Customer
    let customerId: string | null = null;
    if (body.customer?.name) {
        const { data: existingCustomer } = await supabase
            .from('customers')
            .select('id')
            .eq('user_id', restaurantId)
            .eq('name', body.customer.name)
            .maybeSingle();

        if (existingCustomer) {
            customerId = existingCustomer.id;
        } else {
            const { data: newCustomer, error: customerError } = await supabase
                .from('customers')
                .insert({
                    user_id: restaurantId,
                    name: body.customer.name,
                    phone: body.customer.phone || null,
                    email: body.customer.email || null,
                })
                .select('id')
                .single();
            if (customerError) throw new Error(`Could not create customer: ${customerError.message}`);
            customerId = newCustomer!.id;
        }
    }

    // Map items
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

    // Create Order
    const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
            user_id: restaurantId,
            table_number: 0,
            order_type: 'QuickSale',
            status: 'OPEN',
            customer_id: customerId,
            notes: `Pedido externo via API. Origem: ${body.orderTypeLabel || 'Desconhecida'}. ID Externo: ${body.externalId || 'N/A'}`
        })
        .select('id')
        .single();
    if (orderError) throw new Error(`Error creating order: ${orderError.message}`);

    // Fetch necessary preparations and stations
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

    // Create Order Items
    const status_timestamps = { 'PENDENTE': new Date().toISOString() };
    const orderItemsToInsert: Partial<OrderItem>[] = body.items.flatMap(item => {
        const recipe = recipesMap.get(item.externalCode)!;
        const recipePreps = prepsMap.get(recipe.id);
        const finalPrice = item.price !== undefined ? item.price : recipe.price;

        if (recipePreps && recipePreps.length > 0) {
            const groupId = uuidv4();
            return recipePreps.map(prep => ({
                order_id: newOrder.id,
                recipe_id: recipe.id,
                name: `${recipe.name} (${prep.name})`,
                quantity: item.quantity,
                price: finalPrice / recipePreps.length, // Distribute price
                original_price: recipe.price / recipePreps.length,
                notes: item.notes,
                status: 'PENDENTE' as OrderItemStatus,
                station_id: prep.station_id,
                group_id: groupId,
                status_timestamps,
                user_id: restaurantId
            }));
        } else {
            return [{
                order_id: newOrder.id,
                recipe_id: recipe.id,
                name: recipe.name,
                quantity: item.quantity,
                price: finalPrice,
                original_price: recipe.price,
                notes: item.notes,
                status: 'PENDENTE' as OrderItemStatus,
                station_id: fallbackStationId, // A station must be assigned
                status_timestamps,
                user_id: restaurantId
            }];
        }
    });

    const { error: itemsError } = await supabase.from('order_items').insert(orderItemsToInsert);
    if (itemsError) {
        await supabase.from('orders').delete().eq('id', newOrder.id);
        throw new Error(`Error creating order items: ${itemsError.message}`);
    }

    // 4. Respond
    return response.status(201).json({
      success: true,
      message: 'Order created successfully and sent to KDS.',
      orderId: newOrder.id
    });

  } catch (error: any) {
    console.error('[API /external-order] Fatal error:', error);
    return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
  }
}
