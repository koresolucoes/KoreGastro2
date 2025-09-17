import { SupabaseClient } from '@supabase/supabase-js';
import { OrderItem, OrderStatus, OrderType, IfoodOrderDelivery, Customer } from '../../src/models/db.models';
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
      timestamp: payload.createdAt // Store the original iFood timestamp
    }).select('id').single();

  if (orderError) {
    throw new Error(orderError.message);
  }

  if (Array.isArray(payload.items) && payload.items.length > 0) {
    const allExternalCodes = payload.items.flatMap((item: any) => [item.externalCode, ...(item.options || []).map((opt: any) => opt.externalCode)]).filter(Boolean);
    
    // 1. Fetch both recipes and ingredients that match any external code.
    const [recipesRes, ingredientsRes] = await Promise.all([
        supabase.from('recipes').select('id, external_code').in('external_code', allExternalCodes).eq('user_id', userId),
        supabase.from('ingredients').select('id, external_code, proxy_recipe_id, station_id').in('external_code', allExternalCodes).eq('user_id', userId)
    ]);

    if (recipesRes.error) throw recipesRes.error;
    if (ingredientsRes.error) throw ingredientsRes.error;

    // 2. Create maps for quick lookups.
    // FIX: Add explicit types to maps to ensure type safety.
    const recipeByExternalCodeMap = new Map<string, string>((recipesRes.data || []).map((r: any) => [r.external_code, r.id]));
    
    type IngredientMapValue = { id: string; proxy_recipe_id: string | null; station_id: string | null };
    const ingredientByExternalCodeMap = new Map<string, IngredientMapValue>((ingredientsRes.data || []).map((i: any) => [i.external_code, { id: i.id, proxy_recipe_id: i.proxy_recipe_id, station_id: i.station_id }]));

    // 3. For ingredients that are linked to sub-recipes, create a map for that.
    const ingredientIds = (ingredientsRes.data || []).map((i: any) => i.id);
    // FIX: Explicitly type the map to ensure type safety.
    let sourceRecipeByIngredientIdMap = new Map<string, string>();
    if (ingredientIds.length > 0) {
        // FIX: The original code used 'ingredient' instead of 'ingredientIds'.
        const { data: sourceRecipes, error: recipeError } = await supabase.from('recipes').select('id, source_ingredient_id').in('source_ingredient_id', ingredientIds);
        if (recipeError) throw recipeError;
        (sourceRecipes || []).forEach((r: any) => {
            if(r.source_ingredient_id) {
                sourceRecipeByIngredientIdMap.set(r.source_ingredient_id, r.id);
            }
        });
    }

    const orderItems: Omit<OrderItem, 'id' | 'created_at'>[] = payload.items.flatMap((item: any) => {
        const mainRecipeId = recipeByExternalCodeMap.get(item.externalCode);
        const mainIngredient = ingredientByExternalCodeMap.get(item.externalCode);

        // Determine if this is a recipe-based item or an ingredient-based item
        let recipeId: string | null = null;
        let stationId: string = fallbackStationId;

        if (mainRecipeId) {
            recipeId = mainRecipeId;
        } else if (mainIngredient) {
            // FIX: Use nullish coalescing to handle potential undefined from map.get() and ensure type safety.
            recipeId = sourceRecipeByIngredientIdMap.get(mainIngredient.id) ?? mainIngredient.proxy_recipe_id;
            stationId = mainIngredient.station_id || fallbackStationId;
        }

        if (!recipeId) {
            console.warn(`No matching recipe or ingredient for external code: ${item.externalCode}. Skipping item.`);
            if (logId) updateLogStatus(supabase, logId, 'WARNING_SKIPPED_ITEM', `External code not found: ${item.externalCode}`);
            return []; // Skip this item
        }
        
        const baseItem: Partial<OrderItem> = {
            order_id: newOrder.id,
            recipe_id: recipeId,
            name: item.name,
            quantity: item.quantity,
            price: item.price.unit,
            original_price: item.price.originalValue || item.price.unit,
            notes: item.observations || null,
            status: 'PENDENTE',
            station_id: stationId,
            status_timestamps: { 'PENDENTE': new Date().toISOString() },
            user_id: userId,
        };

        const itemsToInsert = [baseItem];

        // Handle options as separate order items
        if (Array.isArray(item.options)) {
            item.options.forEach((option: any) => {
                const optionRecipeId = recipeByExternalCodeMap.get(option.externalCode);
                const optionIngredient = ingredientByExternalCodeMap.get(option.externalCode);

                let optRecipeId: string | null = null;
                let optStationId: string = fallbackStationId;

                if (optionRecipeId) {
                    optRecipeId = optionRecipeId;
                } else if (optionIngredient) {
                    // FIX: Use nullish coalescing to handle potential undefined from map.get() and ensure type safety.
                    optRecipeId = sourceRecipeByIngredientIdMap.get(optionIngredient.id) ?? optionIngredient.proxy_recipe_id;
                    optStationId = optionIngredient.station_id || fallbackStationId;
                }

                if (optRecipeId) {
                    itemsToInsert.push({
                        ...baseItem,
                        recipe_id: optRecipeId,
                        name: option.name,
                        quantity: option.quantity,
                        price: option.price.unit,
                        original_price: option.price.originalValue || option.price.unit,
                        notes: null, // Options usually don't have observations
                        station_id: optStationId,
                    });
                } else {
                    console.warn(`No matching recipe/ingredient for option external code: ${option.externalCode}. Skipping option.`);
                }
            });
        }
        
        return itemsToInsert;
    });

    if (orderItems.length > 0) {
        const { error: itemsError } = await supabase.from('order_items').insert(orderItems as any);
        if (itemsError) {
            // Attempt to clean up the created order if item insertion fails
            await supabase.from('orders').delete().eq('id', newOrder.id);
            throw new Error(itemsError.message);
        }
    }
  }
}

// FIX: Add missing order status update functions.

/**
 * Updates the status of an order's items to EM_PREPARO in the database.
 * @param supabase The Supabase client instance.
 * @param ifoodOrderId The iFood order ID.
 */
export async function confirmOrderInDb(supabase: SupabaseClient, ifoodOrderId: string) {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id')
    .eq('ifood_order_id', ifoodOrderId)
    .maybeSingle();

  if (orderError) throw orderError;
  if (!order) {
    console.warn(`DB Info: Order with iFood ID ${ifoodOrderId} not found for CONFIRMED event. It might have been created manually.`);
    return;
  }

  const { error: itemsError } = await supabase
    .from('order_items')
    .update({ status: 'EM_PREPARO' })
    .eq('order_id', order.id)
    .eq('status', 'PENDENTE');

  if (itemsError) {
    console.error(`DB Error: Failed to update items to EM_PREPARO for order ${order.id}`, itemsError);
    throw itemsError;
  }
}

/**
 * Updates the status of an order's items to PRONTO in the database.
 * @param supabase The Supabase client instance.
 * @param ifoodOrderId The iFood order ID.
 */
export async function dispatchOrderInDb(supabase: SupabaseClient, ifoodOrderId: string) {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id')
    .eq('ifood_order_id', ifoodOrderId)
    .maybeSingle();

  if (orderError) throw orderError;
  if (!order) {
    console.warn(`DB Info: Order with iFood ID ${ifoodOrderId} not found for DISPATCHED/READY_FOR_PICKUP event.`);
    return;
  }

  const { error: itemsError } = await supabase
    .from('order_items')
    .update({ status: 'PRONTO' })
    .eq('order_id', order.id)
    .in('status', ['PENDENTE', 'EM_PREPARO']);

  if (itemsError) {
    console.error(`DB Error: Failed to update items to PRONTO for order ${order.id}`, itemsError);
    throw itemsError;
  }
}

/**
 * Updates the status of an order to COMPLETED in the database.
 * @param supabase The Supabase client instance.
 * @param ifoodOrderId The iFood order ID.
 */
export async function concludeOrderInDb(supabase: SupabaseClient, ifoodOrderId: string) {
    const { error } = await supabase
        .from('orders')
        .update({ status: 'COMPLETED', completed_at: new Date().toISOString() })
        .eq('ifood_order_id', ifoodOrderId);
    if (error) {
        console.error(`DB Error: Failed to conclude iFood order ${ifoodOrderId}`, error);
        throw error;
    }
}

/**
 * Updates the status of an order to CANCELLED in the database.
 * @param supabase The Supabase client instance.
 * @param ifoodOrderId The iFood order ID.
 */
export async function cancelOrderInDb(supabase: SupabaseClient, ifoodOrderId: string) {
  const { error } = await supabase
    .from('orders')
    .update({ status: 'CANCELLED', completed_at: new Date().toISOString() })
    .eq('ifood_order_id', ifoodOrderId);
  if (error) {
    console.error(`DB Error: Failed to cancel iFood order ${ifoodOrderId}`, error);
    throw error;
  }
}
