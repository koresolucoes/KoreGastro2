import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Recipe, Ingredient, RecipeIngredient, RecipeSubRecipe, Category } from '../src/models/db.models.js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Main handler function
export default async function handler(request: VercelRequest, response: VercelResponse) {
  // CORS headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    return response.status(204).end();
  }

  try {
    // 1. Authentication
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.status(401).json({ error: { message: 'Authorization header is missing or invalid.' } });
    }
    const providedApiKey = authHeader.split(' ')[1];

    const restaurantId = (request.query.restaurantId || request.body.restaurantId) as string;

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

    // 2. Method Routing
    switch (request.method) {
      case 'GET':
        await handleGet(request, response, restaurantId);
        break;
      case 'PUT':
        await handlePut(request, response, restaurantId);
        break;
      default:
        response.setHeader('Allow', ['GET', 'PUT']);
        response.status(405).json({ error: { message: `Method ${request.method} Not Allowed` } });
    }
  } catch (error: any) {
    console.error('[API /cardapio-estoque] Fatal error:', error);
    return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
  }
}

// --- Handler for GET requests ---
async function handleGet(request: VercelRequest, response: VercelResponse, restaurantId: string) {
    const { action, status } = request.query;

    if (action === 'insumos') {
        let query = supabase.from('ingredients').select('*').eq('user_id', restaurantId);
        const { data, error } = await query;
        if (error) throw error;
        
        let result = data || [];
        if (status === 'estoque_baixo') {
            result = result.filter(i => i.stock < i.min_stock);
        }
        return response.status(200).json(result);
    }

    // Default action: 'detalhado'
    const [recipesRes, allRecipesRes, ingredientsRes, recipeIngredientsRes, recipeSubRecipesRes, categoriesRes] = await Promise.all([
        supabase.from('recipes').select('*').eq('user_id', restaurantId).eq('is_available', true).eq('is_sub_recipe', false),
        supabase.from('recipes').select('id, source_ingredient_id').eq('user_id', restaurantId),
        supabase.from('ingredients').select('id, stock').eq('user_id', restaurantId),
        supabase.from('recipe_ingredients').select('*').eq('user_id', restaurantId),
        supabase.from('recipe_sub_recipes').select('*').eq('user_id', restaurantId),
        supabase.from('categories').select('id, name').eq('user_id', restaurantId)
    ]);

    if (recipesRes.error || ingredientsRes.error || recipeIngredientsRes.error || recipeSubRecipesRes.error || categoriesRes.error || allRecipesRes.error) {
        throw new Error('Failed to fetch menu data.');
    }

    const recipes = recipesRes.data || [];
    const ingredientsMap = new Map<string, { stock: number }>(ingredientsRes.data?.map(i => [i.id, { stock: i.stock }]) || []);
    const allRecipesMap = new Map<string, { source_ingredient_id: string | null }>(allRecipesRes.data?.map(r => [r.id, { source_ingredient_id: r.source_ingredient_id }]) || []);
    const categoriesMap = new Map<string, string>(categoriesRes.data?.map(c => [c.id, c.name]) || []);

    const hasStock = (recipeId: string): boolean => {
        const directIngredients = recipeIngredientsRes.data?.filter(ri => ri.recipe_id === recipeId) || [];
        for (const ing of directIngredients) {
            if ((ingredientsMap.get(ing.ingredient_id)?.stock ?? 0) < ing.quantity) {
                return false;
            }
        }
        
        const subRecipes = recipeSubRecipesRes.data?.filter(rsr => rsr.parent_recipe_id === recipeId) || [];
        for (const sub of subRecipes) {
            const childRecipe = allRecipesMap.get(sub.child_recipe_id);
            if (!childRecipe || !childRecipe.source_ingredient_id) {
                // Simplified logic: sub-recipes not linked to stock are considered unavailable in this check
                return false; 
            }
            if ((ingredientsMap.get(childRecipe.source_ingredient_id)?.stock ?? 0) < sub.quantity) {
                return false;
            }
        }
        return true;
    };

    const detailedMenu = recipes.map(recipe => ({
        ...recipe,
        category_name: categoriesMap.get(recipe.category_id) || null,
        disponivel_estoque: hasStock(recipe.id),
    }));

    return response.status(200).json(detailedMenu);
}

// --- Handler for PUT requests ---
async function handlePut(request: VercelRequest, response: VercelResponse, restaurantId: string) {
    const { external_code } = request.query;
    const { is_available } = request.body;

    if (!external_code || typeof external_code !== 'string') {
        return response.status(400).json({ error: { message: '`external_code` query parameter is required.' } });
    }
    if (is_available === undefined || typeof is_available !== 'boolean') {
        return response.status(400).json({ error: { message: '`is_available` (boolean) is required in the request body.' } });
    }

    const { data: updatedRecipe, error } = await supabase
        .from('recipes')
        .update({ is_available })
        .eq('user_id', restaurantId)
        .eq('external_code', external_code)
        .select()
        .single();
    
    if (error && error.code === 'PGRST116') {
        return response.status(404).json({ error: { message: `Recipe with external_code "${external_code}" not found.` } });
    }
    if (error) throw error;

    return response.status(200).json(updatedRecipe);
}
