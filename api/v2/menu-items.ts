import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    const { data: profile, error: profileError } = await supabase
      .from('company_profile')
      .select('external_api_key')
      .eq('user_id', restaurantId)
      .single();
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
  response.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
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

    switch (request.method) {
      case 'GET':
        await handleGet(request, response, restaurantId);
        break;
      case 'PATCH':
        await handlePatch(request, response, restaurantId);
        break;
      default:
        response.setHeader('Allow', ['GET', 'PATCH']);
        response.status(405).json({ error: { message: `Method ${request.method} Not Allowed` } });
    }
  } catch (error: any) {
    console.error('[API /v2/menu-items] Fatal error:', error);
    return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { itemId } = req.query;

    if (itemId && typeof itemId === 'string') {
        const { data, error } = await supabase.from('recipes').select('*, categories(name)').eq('user_id', restaurantId).eq('id', itemId).single();
        if (error) {
            if (error.code === 'PGRST116') return res.status(404).json({ error: { message: `Menu item with id "${itemId}" not found.` } });
            throw error;
        }
        return res.status(200).json(data);
    }
    
    // --- List all menu items with stock status ---
    let query = supabase.from('recipes').select('*, categories(name)').eq('user_id', restaurantId).eq('is_sub_recipe', false);
    if (req.query.isAvailable) query = query.eq('is_available', req.query.isAvailable === 'true');
    if (req.query.categoryId) query = query.eq('category_id', req.query.categoryId as string);
    
    const [recipesRes, allRecipesRes, ingredientsRes, recipeIngredientsRes, recipeSubRecipesRes] = await Promise.all([
        query,
        supabase.from('recipes').select('id, source_ingredient_id').eq('user_id', restaurantId),
        supabase.from('ingredients').select('id, stock').eq('user_id', restaurantId),
        supabase.from('recipe_ingredients').select('*').eq('user_id', restaurantId),
        supabase.from('recipe_sub_recipes').select('*').eq('user_id', restaurantId),
    ]);

    if (recipesRes.error || ingredientsRes.error || recipeIngredientsRes.error || recipeSubRecipesRes.error || allRecipesRes.error) {
        throw new Error('Failed to fetch menu data for stock calculation.');
    }

    const recipes = recipesRes.data || [];
    const ingredientsMap = new Map<string, number>(ingredientsRes.data?.map(i => [i.id, i.stock]) || []);
    const allRecipesMap = new Map<string, string | null>(allRecipesRes.data?.map(r => [r.id, r.source_ingredient_id]) || []);
    const memo = new Map<string, boolean>();

    const hasStock = (recipeId: string): boolean => {
        if (memo.has(recipeId)) return memo.get(recipeId)!;
        
        const directIngredients = recipeIngredientsRes.data?.filter(ri => ri.recipe_id === recipeId) || [];
        for (const ing of directIngredients) {
            if ((ingredientsMap.get(ing.ingredient_id) ?? 0) < ing.quantity) {
                memo.set(recipeId, false);
                return false;
            }
        }
        
        const subRecipes = recipeSubRecipesRes.data?.filter(rsr => rsr.parent_recipe_id === recipeId) || [];
        for (const sub of subRecipes) {
            const childRecipeSourceIngredientId = allRecipesMap.get(sub.child_recipe_id);
            if (childRecipeSourceIngredientId) {
                if ((ingredientsMap.get(childRecipeSourceIngredientId) ?? 0) < sub.quantity) {
                    memo.set(recipeId, false);
                    return false;
                }
            } else {
                 if (!hasStock(sub.child_recipe_id)) {
                    memo.set(recipeId, false);
                    return false;
                 }
            }
        }
        memo.set(recipeId, true);
        return true;
    };

    const detailedMenu = recipes.map(recipe => ({
        ...recipe,
        has_stock: hasStock(recipe.id),
    }));

    return res.status(200).json(detailedMenu);
}


async function handlePatch(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { itemId } = req.query;
    if (!itemId || typeof itemId !== 'string') {
        return res.status(400).json({ error: { message: 'A menu item `itemId` is required in the query parameters.' } });
    }
    const { price, is_available } = req.body;
    const updatePayload: { [key: string]: any } = {};
    if (price !== undefined) updatePayload.price = price;
    if (is_available !== undefined) updatePayload.is_available = is_available;
    
    if (Object.keys(updatePayload).length === 0) {
        return res.status(400).json({ error: { message: 'At least one field to update (`price` or `is_available`) is required.' } });
    }

    const { data, error } = await supabase.from('recipes').update(updatePayload).eq('id', itemId).eq('user_id', restaurantId).select().single();
    if (error) {
        if (error.code === 'PGRST116') return res.status(404).json({ error: { message: `Menu item with id "${itemId}" not found.` } });
        throw error;
    }
    return res.status(200).json(data);
}
