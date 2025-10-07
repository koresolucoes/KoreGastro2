

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { OrderItem, OrderStatus, OrderType, Customer, Recipe, RecipePreparation, OrderItemStatus } from '../src/models/db.models.js';
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
  tableNumber: number; // For Dine-in, use 0 for QuickSale/takeout.
  orderTypeLabel?: string; // Optional label for the origin (e.g., "Totem 1", "App de Entrega")
  externalId?: string; // Optional ID from the external system
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
  response.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
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

    const restaurantId = (request.method === 'GET' ? request.query.restaurantId : request.body.restaurantId) as string;

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
    if (request.method === 'GET') {
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
    } else if (request.method === 'POST') {
      // --- Handle POST request to create an order ---
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

      // NEW LOGIC: Handle table existence and default to QuickSale if not found.
      let effectiveTableNumber = body.tableNumber;
      let effectiveOrderType: OrderType = body.tableNumber > 0 ? 'Dine-in' : 'QuickSale';
      let tableIdToUpdate: string | null = null;

      if (body.tableNumber > 0) {
        const { data: table, error: tableError } = await supabase
          .from('tables')
          .select('id')
          .eq('user_id', restaurantId)
          .eq('number', body.tableNumber)
          .maybeSingle();
        
        if (tableError) throw new Error(`Error checking for table: ${tableError.message}`);

        if (!table) {
          // Table not found, create a QuickSale order instead.
          effectiveTableNumber = 0;
          effectiveOrderType = 'QuickSale';
        } else {
          // Table found, we will update its status later.
          tableIdToUpdate = table.id;
        }
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

      const { data: newOrder, error: orderError } = await supabase
          .from('orders')
          .insert({
              user_id: restaurantId,
              table_number: effectiveTableNumber, // Use effective number
              order_type: effectiveOrderType,     // Use effective type
              status: 'OPEN',
              customer_id: customerId,
          })
          .select('id')
          .single();
      if (orderError) throw new Error(`Error creating order: ${orderError.message}`);

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
      const orderNotes = `Pedido externo via API. Origem: ${body.orderTypeLabel || 'Desconhecida'}. ID Externo: ${body.externalId || 'N/A'}`;

      const orderItemsToInsert: Partial<OrderItem>[] = body.items.flatMap((item, itemIndex) => {
          const recipe = recipesMap.get(item.externalCode)!;
          const recipePreps = prepsMap.get(recipe.id);
          const finalPrice = item.price !== undefined ? item.price : recipe.price;

          const baseNotes = itemIndex === 0 
            ? `${orderNotes}${item.notes ? `\n---\n${item.notes}` : ''}`.trim() 
            : item.notes;

          if (recipePreps && recipePreps.length > 0) {
              const groupId = uuidv4();
              return recipePreps.map((prep, prepIndex) => ({
                  order_id: newOrder.id,
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
                  order_id: newOrder.id,
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

      const { error: itemsError } = await supabase.from('order_items').insert(orderItemsToInsert);
      if (itemsError) {
          await supabase.from('orders').delete().eq('id', newOrder.id);
          throw new Error(`Error creating order items: ${itemsError.message}`);
      }

      // NEW LOGIC: Update table status if a valid table was found.
      if (tableIdToUpdate) {
        const { error: tableUpdateError } = await supabase
          .from('tables')
          .update({ status: 'OCUPADA' })
          .eq('id', tableIdToUpdate);
        
        if (tableUpdateError) {
          // The order was created, so we shouldn't fail the whole request.
          // But we should log this critical error on the server.
          console.error(`[API /external-order] CRITICAL: Order ${newOrder.id} created for table ${body.tableNumber}, but failed to update table status to OCUPADA. Error: ${tableUpdateError.message}`);
        }
      }

      return response.status(201).json({
        success: true,
        message: 'Order created successfully and sent to KDS.',
        orderId: newOrder.id
      });
    } else {
      return response.status(405).json({ error: { message: 'Method not allowed.' } });
    }
  } catch (error: any) {
    console.error('[API /external-order] Fatal error:', error);
    return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
  }
}
