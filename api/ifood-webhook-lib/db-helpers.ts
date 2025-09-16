import { SupabaseClient } from '@supabase/supabase-js';
import { OrderItem, OrderStatus, OrderType, IfoodOrderDelivery } from '../../src/models/db.models';
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
    
    // 1. Fetch both recipes and ingredients that match any external code.
    const [recipesRes, ingredientsRes] = await Promise.all([
        supabase.from('recipes').select('id, external_code').in('external_code', allExternalCodes).eq('user_id', userId),
        supabase.from('ingredients').select('id, external_code, proxy_recipe_id, station_id').in('external_code', allExternalCodes).eq('user_id', userId)
    ]);

    if (recipesRes.error) throw recipesRes.error;
    if (ingredientsRes.error) throw ingredientsRes.error;

    // 2. Create maps for quick lookups.
    // FIX: Add explicit types to map callbacks to avoid type errors.
    const recipeByExternalCodeMap = new Map((recipesRes.data || []).map((r: { external_code: string; id: string }) => [r.external_code, r.id]));
    const ingredientByExternalCodeMap = new Map((ingredientsRes.data || []).map((i: { external_code: string, id: string, proxy_recipe_id: string | null, station_id: string | null }) => [i.external_code, { id: i.id, proxy_recipe_id: i.proxy_recipe_id, station_id: i.station_id }]));

    // 3. For ingredients that are linked to sub-recipes, create a map for that.
    const ingredientIds = (ingredientsRes.data || []).map((i: { id: string }) => i.id);
    let sourceRecipeByIngredientIdMap = new Map();
    if (ingredientIds.length > 0) {
        const { data: sourceRecipes, error: recipeError } = await supabase.from('recipes').select('id, source_ingredient_id').in('source_ingredient_id', ingredientIds).eq('user_id', userId);
        if (recipeError) throw recipeError;
        sourceRecipeByIngredientIdMap = new Map(sourceRecipes?.map((r: { source_ingredient_id: string; id: string }) => [r.source_ingredient_id, r.id]));
    }

    // 4. Fetch all preparations needed for any potential recipe match.
    const allPossibleRecipeIds = [
        ...recipeByExternalCodeMap.values(),
        ...(ingredientsRes.data || []).map((i: { proxy_recipe_id: string | null }) => i.proxy_recipe_id).filter(Boolean),
        ...sourceRecipeByIngredientIdMap.values()
    ];

    const { data: preparations, error: prepsError } = await supabase
        .from('recipe_preparations')
        .select('recipe_id, station_id, name')
        .in('recipe_id', allPossibleRecipeIds)
        .eq('user_id', userId);
    if (prepsError) throw prepsError;

    const prepsByRecipeId = (preparations || []).reduce((acc, p) => {
        if (!acc.has(p.recipe_id)) acc.set(p.recipe_id, []);
        acc.get(p.recipe_id)!.push(p);
        return acc;
    }, new Map<string, any[]>());

    // 5. Process items and build the insert payload.
    const orderItemsToInsert = payload.items.flatMap((item: any) => {
        let recipeId: string | null = null;
        let stationId: string | null = fallbackStationId;
        let isSimpleIngredient = true;

        // Priority 1: Direct match on recipe.external_code
        recipeId = recipeByExternalCodeMap.get(item.externalCode) || null;
        
        // Priority 2: Match via ingredient.external_code
        if (recipeId) {
            isSimpleIngredient = false;
        } else {
            const matchedIngredient = ingredientByExternalCodeMap.get(item.externalCode);
            if (matchedIngredient) {
                isSimpleIngredient = false;
                recipeId = sourceRecipeByIngredientIdMap.get(matchedIngredient.id) ?? matchedIngredient.proxy_recipe_id ?? null;
                stationId = matchedIngredient.station_id ?? fallbackStationId;
                if (!recipeId) {
                    isSimpleIngredient = true;
                }
            }
        }
        
        const status_timestamps = { 'PENDENTE': new Date().toISOString() };
        const notes = [item.observations, ...(item.options || []).map((opt: any) => `${opt.quantity}x ${opt.name}`)].filter(Boolean).join('; ');

        // Case A: A recipe was found
        if (recipeId && !isSimpleIngredient) {
            const recipePreps = prepsByRecipeId.get(recipeId);
            if (recipePreps && recipePreps.length > 0) {
                const groupId = uuidv4();
                return recipePreps.map(prep => ({
                    order_id: newOrder.id, recipe_id: recipeId, name: `${item.name} (${prep.name})`,
                    quantity: item.quantity, price: item.totalPrice / recipePreps.length, original_price: (item.unitPrice * item.quantity) / recipePreps.length,
                    notes, status: 'PENDENTE', station_id: prep.station_id, group_id: groupId,
                    status_timestamps, user_id: userId
                }));
            } else {
                return [{
                    order_id: newOrder.id, recipe_id: recipeId, name: item.name,
                    quantity: item.quantity, price: item.totalPrice, original_price: item.unitPrice * item.quantity,
                    notes, status: 'PENDENTE', station_id: fallbackStationId, group_id: null,
                    status_timestamps, user_id: userId
                }];
            }
        }
        
        // Case B: A simple sellable ingredient was found
        if (isSimpleIngredient && ingredientByExternalCodeMap.has(item.externalCode)) {
             return [{
                order_id: newOrder.id, recipe_id: null, name: item.name,
                quantity: item.quantity, price: item.totalPrice, original_price: item.unitPrice * item.quantity,
                notes, status: 'PENDENTE', station_id: stationId, group_id: null,
                status_timestamps, user_id: userId
            }];
        }
        
        // Case C: No match found
        console.warn(`No recipe or sellable ingredient found for external code: ${item.externalCode}. Skipping item: ${item.name}`);
        return [];
    });

    if (orderItemsToInsert.length > 0) {
        const { error: itemsError } = await supabase.from('order_items').insert(orderItemsToInsert);
        if (itemsError) {
          if (logId) await updateLogStatus(supabase, logId, 'ERROR_ITEM_INSERT', itemsError.message);
        }
    }
  }
}

export async function cancelOrderInDb(supabase: SupabaseClient, ifoodOrderId: string) {
  await supabase.from('orders')
    .update({ status: 'CANCELLED', completed_at: new Date().toISOString() })
    .eq('ifood_order_id', ifoodOrderId);
}

export async function confirmOrderInDb(supabase: SupabaseClient, ifoodOrderId: string) {
    const { data: order, error } = await supabase.from('orders').select('id').eq('ifood_order_id', ifoodOrderId).single();
    if (error || !order) {
        console.error(`Order with ifood_order_id ${ifoodOrderId} not found for CONFIRMED event.`);
        return;
    }
    await supabase.from('order_items')
        .update({ status: 'EM_PREPARO' })
        .eq('order_id', order.id)
        .eq('status', 'PENDENTE');
}

export async function dispatchOrderInDb(supabase: SupabaseClient, ifoodOrderId: string) {
    const { data: order, error } = await supabase.from('orders').select('id').eq('ifood_order_id', ifoodOrderId).single();
    if (error || !order) {
        console.error(`Order with ifood_order_id ${ifoodOrderId} not found for DISPATCHED/READY_FOR_PICKUP event.`);
        return;
    }
    await supabase.from('order_items')
        .update({ status: 'PRONTO' })
        .eq('order_id', order.id)
        .in('status', ['PENDENTE', 'EM_PREPARO']);
}

export async function concludeOrderInDb(supabase: SupabaseClient, ifoodOrderId: string) {
    await supabase.from('orders')
        .update({ status: 'COMPLETED', completed_at: new Date().toISOString() })
        .eq('ifood_order_id', ifoodOrderId);
}