import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(request: VercelRequest, response: VercelResponse) {
  // CORS headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    return response.status(204).end();
  }
  
  if (request.method !== 'GET') {
    response.setHeader('Allow', ['GET']);
    return response.status(405).json({ error: { message: 'Method Not Allowed' } });
  }

  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.status(401).json({ error: { message: 'Authorization header is missing or invalid.' } });
    }
    const providedApiKey = authHeader.split(' ')[1];

    const restaurantId = request.query.restaurantId as string;

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
    const { data: rewards, error: rewardsError } = await supabase
        .from('loyalty_rewards')
        .select('id, name, description, points_cost, reward_type, reward_value')
        .eq('user_id', restaurantId)
        .eq('is_active', true)
        .order('points_cost', { ascending: true });

    if (rewardsError) throw rewardsError;
    if (!rewards) return response.status(200).json([]);

    const freeItemRecipeIds = rewards
        .filter(r => r.reward_type === 'free_item')
        .map(r => r.reward_value);

    let recipeCodeMap = new Map<string, string | null>();
    if (freeItemRecipeIds.length > 0) {
        const { data: recipes, error: recipesError } = await supabase
            .from('recipes')
            .select('id, external_code')
            .in('id', freeItemRecipeIds);
        if (recipesError) throw recipesError;
        recipeCodeMap = new Map(recipes?.map(r => [r.id, r.external_code]) || []);
    }

    const formattedRewards = rewards.map(reward => {
        let value = reward.reward_value;
        if (reward.reward_type === 'free_item') {
            value = recipeCodeMap.get(reward.reward_value) || null;
        }
        return {
            id: reward.id,
            name: reward.name,
            description: reward.description,
            points_cost: reward.points_cost,
            type: reward.reward_type,
            value: value,
        };
    }).filter(r => r.value !== null); // Filter out free items whose recipe was not found or had no external code

    return response.status(200).json(formattedRewards);

  } catch (error: any) {
    console.error('[API /recompensas] Fatal error:', error);
    return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
  }
}