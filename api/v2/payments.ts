import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Order, OrderItem, Transaction, TransactionType } from '../../src/models/db.models.js';
import { triggerWebhook } from '../webhook-emitter.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Payment {
  method: string;
  amount: number;
}

interface RequestBody {
  restaurantId: string;
  orderId: string;
  payments: Payment[];
  tip?: number;
}

async function authenticateRequest(request: VercelRequest): Promise<{ restaurantId?: string; error?: { message: string }; status?: number }> {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { error: { message: 'Authorization header is missing or invalid.' }, status: 401 };
    }
    const providedApiKey = authHeader.split(' ')[1];
    const restaurantId = request.body.restaurantId as string;
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
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    return response.status(204).end();
  }
  
  if (request.method !== 'POST') {
    response.setHeader('Allow', ['POST']);
    return response.status(405).json({ error: { message: 'Method Not Allowed' } });
  }

  try {
    const authResult = await authenticateRequest(request);
    if (authResult.error) {
        return response.status(authResult.status!).json({ error: authResult.error });
    }
    const restaurantId = authResult.restaurantId!;

    const { orderId, payments, tip } = request.body as RequestBody;

    if (!orderId || !payments || !Array.isArray(payments) || payments.length === 0) {
      return response.status(400).json({ error: { message: '`orderId` and a non-empty `payments` array are required.' } });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .eq('user_id', restaurantId)
      .eq('status', 'OPEN')
      .single();

    if (orderError) {
      if (orderError.code === 'PGRST116') return response.status(404).json({ error: { message: `Open order with id "${orderId}" not found.` } });
      throw orderError;
    }
    
    const orderItems = (order.order_items || []) as OrderItem[];
    const orderTotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0) + (tip || 0);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    
    if (totalPaid < orderTotal - 0.01) {
      return response.status(400).json({ error: { message: `Payment amount is insufficient. Order total is ${orderTotal.toFixed(2)}, but received ${totalPaid.toFixed(2)}.` } });
    }

    const { data: updatedOrder, error: updateOrderError } = await supabase
        .from('orders')
        .update({ status: 'COMPLETED', completed_at: new Date().toISOString() })
        .eq('id', orderId)
        .select('*, customers(*), order_items(*)')
        .single();
    if (updateOrderError) throw updateOrderError;

    if (order.table_number > 0) {
      await supabase.from('tables').update({ status: 'LIVRE', employee_id: null, customer_count: 0 }).eq('number', order.table_number).eq('user_id', restaurantId);
    }

    const transactionsToInsert: Partial<Transaction>[] = payments.map(p => ({
      description: `Receita Pedido #${orderId.slice(0, 8)} (${p.method})`,
      type: 'Receita' as TransactionType,
      amount: p.amount,
      user_id: restaurantId,
    }));
    
    if (tip && tip > 0) {
        transactionsToInsert.push({
          description: `Gorjeta Pedido #${orderId.slice(0, 8)}`,
          type: 'Gorjeta' as TransactionType,
          amount: tip,
          user_id: restaurantId,
        });
    }

    const { error: transactionError } = await supabase.from('transactions').insert(transactionsToInsert);
    if (transactionError) throw transactionError;

    deductStockForOrderItems(orderItems, orderId, restaurantId).catch(stockError => {
        console.error(`[API /v2/payments] NON-FATAL: Stock deduction failed for order ${orderId}.`, stockError);
    });
    
    triggerWebhook(restaurantId, 'order.updated', updatedOrder).catch(console.error);

    return response.status(200).json({ success: true, message: 'Payment processed and order completed successfully.' });

  } catch (error: any) {
    console.error('[API /v2/payments] Fatal error:', error);
    return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
  }
}

// --- Stock Deduction Logic ---
async function deductStockForOrderItems(orderItems: OrderItem[], orderId: string, userId: string) {
    if (orderItems.length === 0) return;

    const recipeIds = [...new Set(orderItems.map(item => item.recipe_id).filter(Boolean))];
    if (recipeIds.length === 0) return;
    
    const [recipesRes, recipeIngredientsRes, recipeSubRecipesRes] = await Promise.all([
        supabase.from('recipes').select('id, source_ingredient_id').eq('user_id', userId),
        supabase.from('recipe_ingredients').select('*').eq('user_id', userId),
        supabase.from('recipe_sub_recipes').select('*').eq('user_id', userId),
    ]);
    if (recipesRes.error || recipeIngredientsRes.error || recipeSubRecipesRes.error) {
        throw new Error('Failed to fetch recipe composition data for stock deduction.');
    }
    const allRecipes = recipesRes.data || [];
    const allRecipeIngredients = recipeIngredientsRes.data || [];
    const allRecipeSubRecipes = recipeSubRecipesRes.data || [];

    const memo = new Map<string, Map<string, number>>();

    const getRawIngredients = (recipeId: string): Map<string, number> => {
        if (memo.has(recipeId)) return memo.get(recipeId)!;
        const rawIngredients = new Map<string, number>();
        const directIngredients = allRecipeIngredients.filter(ri => ri.recipe_id === recipeId);
        for (const ri of directIngredients) {
            rawIngredients.set(ri.ingredient_id, (rawIngredients.get(ri.ingredient_id) || 0) + ri.quantity);
        }
        const subRecipes = allRecipeSubRecipes.filter(rsr => rsr.parent_recipe_id === recipeId);
        for (const sr of subRecipes) {
            const subRecipeRawIngredients = getRawIngredients(sr.child_recipe_id);
            for (const [ingId, qty] of subRecipeRawIngredients.entries()) {
                rawIngredients.set(ingId, (rawIngredients.get(ingId) || 0) + (qty * sr.quantity));
            }
        }
        memo.set(recipeId, rawIngredients);
        return rawIngredients;
    };
    
    const totalDeductions = new Map<string, number>();
    const processedGroupIds = new Set<string>();

    for (const item of orderItems) {
        if (!item.recipe_id) continue;
        if (item.group_id) {
            if (processedGroupIds.has(item.group_id)) continue;
            processedGroupIds.add(item.group_id);
        }
        
        const recipe = allRecipes.find(r => r.id === item.recipe_id);
        if (recipe?.source_ingredient_id) {
            totalDeductions.set(recipe.source_ingredient_id, (totalDeductions.get(recipe.source_ingredient_id) || 0) + item.quantity);
        } else {
            const rawIngredients = getRawIngredients(item.recipe_id);
            for (const [ingId, qtyNeeded] of rawIngredients.entries()) {
                const totalUsed = qtyNeeded * item.quantity;
                totalDeductions.set(ingId, (totalDeductions.get(ingId) || 0) + totalUsed);
            }
        }
    }
    
    const reason = `Venda Pedido #${orderId.slice(0, 8)}`;
    for (const [ingredientId, quantityChange] of totalDeductions.entries()) {
        if (quantityChange > 0) {
            const { error } = await supabase.rpc('adjust_stock_by_lot', {
                p_ingredient_id: ingredientId,
                p_quantity_change: -quantityChange,
                p_reason: reason,
                p_user_id: userId,
            });
            if (error) console.error(`Failed to deduct stock for ingredient ${ingredientId}:`, error);
        }
    }
}