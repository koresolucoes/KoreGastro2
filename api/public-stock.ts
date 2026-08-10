import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from './utils/redis.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  serviceRoleKey || 'placeholder-key'
);

function setCorsHeaders(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin;
  const allowed = typeof origin === 'string' && (
    origin === 'https://app.chefos.online' ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:')
  );
  res.setHeader('Access-Control-Allow-Origin', allowed ? origin : 'https://app.chefos.online');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(503).json({ error: 'Service unavailable' });
  }

  const restaurantId = String(req.query.restaurantId || req.query.userId || '').trim();
  if (!restaurantId) return res.status(400).json({ error: 'Missing restaurantId' });

  const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const rateLimit = await checkRateLimit(`public-stock:${restaurantId}:${clientIp}`, 120, 60);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(Math.ceil(rateLimit.resetMs / 1000)));
    return res.status(429).json({ error: 'Too many requests' });
  }

  try {
    const [ingredientsResult, stationStocksResult, recipeIngredientsResult] = await Promise.all([
      supabase.from('ingredients').select('id, stock').eq('user_id', restaurantId),
      supabase.from('station_stocks').select('ingredient_id, quantity').eq('user_id', restaurantId),
      supabase
        .from('recipe_ingredients')
        .select('recipe_id, ingredient_id, quantity, correction_factor')
        .eq('user_id', restaurantId),
    ]);

    const queryError = ingredientsResult.error || stationStocksResult.error || recipeIngredientsResult.error;
    if (queryError) throw queryError;

    const stockMap = new Map<string, number>(
      (ingredientsResult.data || []).map((ingredient) => [ingredient.id, Number(ingredient.stock || 0)]),
    );
    for (const stationStock of stationStocksResult.data || []) {
      stockMap.set(
        stationStock.ingredient_id,
        (stockMap.get(stationStock.ingredient_id) || 0) + Number(stationStock.quantity || 0)
      );
    }

    const recipeIngredientsMap = new Map<string, typeof recipeIngredientsResult.data>();
    for (const recipeIngredient of recipeIngredientsResult.data || []) {
      const entries = recipeIngredientsMap.get(recipeIngredient.recipe_id) || [];
      entries.push(recipeIngredient);
      recipeIngredientsMap.set(recipeIngredient.recipe_id, entries);
    }

    const outOfStockRecipeIds: string[] = [];
    for (const [recipeId, ingredients] of recipeIngredientsMap.entries()) {
      const unavailable = (ingredients || []).some((ingredient) => {
        const factor = Number(ingredient.correction_factor) > 0 ? Number(ingredient.correction_factor) : 1;
        return (stockMap.get(ingredient.ingredient_id) || 0) < Number(ingredient.quantity) * factor;
      });
      if (unavailable) outOfStockRecipeIds.push(recipeId);
    }

    res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=30');
    return res.status(200).json({ outOfStockRecipeIds });
  } catch (error) {
    console.error('[API /public-stock] Query failed:', error);
    return res.status(500).json({ error: 'Failed to calculate public stock' });
  }
}
