import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Order, OrderItem, Recipe, RecipeIngredient, RecipeSubRecipe, Transaction, TransactionType } from '../src/models/db.models.js';

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
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  // CORS headers
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
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.status(401).json({ error: { message: 'Authorization header is missing or invalid.' } });
    }
    const providedApiKey = authHeader.split(' ')[1];

    const restaurantId = request.body.restaurantId as string;

    if (!restaurantId) {
      return response.status(400).json({ error: { message: '`restaurantId` is required.' } });
    }

    const { data: profile, error: profileError } = await supabase
      .from('company_profile')
      .select('external_api_key')
      .eq('user_id', restaurantId)
      .single();

    if (profileError || !profile || !profile.external_api_key) {
      return response.status(403).json({ error: { message: 'Invalid `restaurantId` or API key not configured.' } });
    }

    if (providedApiKey !== profile.external_api_key) {
      return response.status(403).json({ error: { message: 'Invalid API key.' } });
    }

    // --- Main Logic ---
    const { orderId, payments } = request.body as RequestBody;

    // 1. Validate body
    if (!orderId || !payments || !Array.isArray(payments) || payments.length === 0) {
      return response.status(400).json({ error: { message: '`orderId` and a non-empty `payments` array are required.' } });
    }
    for (const p of payments) {
      if (!p.method || typeof p.amount !== 'number' || p.amount <= 0) {
        return response.status(400).json({ error: { message: 'Each payment must have a valid `method` and `amount`.' } });
      }
    }

    // 2. Fetch order
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

    // 3. Validate payments
    const orderTotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    
    // Use a small tolerance for floating point comparisons
    if (totalPaid < orderTotal - 0.001) {
      return response.status(400).json({ error: { message: `Payment amount is insufficient. Order total is ${orderTotal.toFixed(2)}, but received ${totalPaid.toFixed(2)}.` } });
    }

    // 4. Update order & table
    const { error: updateOrderError } = await supabase
        .from('orders')
        .update({ status: 'COMPLETED', completed_at: new Date().toISOString() })
        .eq('id', orderId);
    if (updateOrderError) throw updateOrderError;

    if (order.table_number > 0) {
      await supabase.from('tables').update({ status: 'LIVRE', employee_id: null, customer_count: 0 }).eq('number', order.table_number).eq('user_id', restaurantId);
    }

    // 5. Insert transactions
    const transactionsToInsert: Partial<Transaction>[] = payments.map(p => ({
      description: `Receita Pedido #${orderId.slice(0, 8)} (${p.method})`,
      type: 'Receita' as TransactionType,
      amount: p.amount,
      user_id: restaurantId,
    }));
    
    const { error: transactionError } = await supabase.from('transactions').insert(transactionsToInsert);
    if (transactionError) throw transactionError;

    // 6. Deduct stock (non-blocking)
    deductStockForOrderItems(orderItems, orderId, restaurantId).catch(stockError => {
        console.error(`[API /payments] NON-FATAL: Stock deduction failed for order ${orderId}.`, stockError);
    });
    
    // 7. Return success
    return response.status(200).json({ success: true, message: 'Payment processed and order completed successfully.' });

  } catch (error: any) {
    console.error('[API /payments] Fatal error:', error);
    return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
  }
}

// --- Stock Deduction Logic ---
async function deductStockForOrderItems(orderItems: OrderItem[], orderId: string, userId: string) {
    if (orderItems.length === 0) return;

    const recipeIds = [...new Set(orderItems.map(item => item.recipe_id).filter(Boolean))];
    if (recipeIds.length === 0) return;
    
    // Fetch all necessary data for composition calculation
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

    // Replicates the logic from recipe-state.service to recursively find raw ingredients
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
    
    // Calculate total deductions
    const totalDeductions = new Map<string, number>();
    const processedGroupIds = new Set<string>();

    for (const item of orderItems) {
        if (!item.recipe_id) continue;
        if (item.group_id) {
            if (processedGroupIds.has(item.group_id)) continue;
            processedGroupIds.add(item.group_id);
        }
        
        // Check if this recipe is a direct proxy for a sellable ingredient
        const recipe = allRecipes.find(r => r.id === item.recipe_id);
        if (recipe?.source_ingredient_id) {
            totalDeductions.set(recipe.source_ingredient_id, (totalDeductions.get(recipe.source_ingredient_id) || 0) + item.quantity);
        } else {
            // It's a complex recipe, calculate its raw ingredients
            const rawIngredients = getRawIngredients(item.recipe_id);
            for (const [ingId, qtyNeeded] of rawIngredients.entries()) {
                const totalUsed = qtyNeeded * item.quantity;
                totalDeductions.set(ingId, (totalDeductions.get(ingId) || 0) + totalUsed);
            }
        }
    }
    
    // Execute deductions
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