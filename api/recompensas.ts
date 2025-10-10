import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { LoyaltyReward, LoyaltyRewardType } from '../src/models/db.models.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(request: VercelRequest, response: VercelResponse) {
  // CORS headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    return response.status(204).end();
  }

  try {
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
    
    // --- Method Routing ---
    switch (request.method) {
      case 'GET':
        await handleGet(request, response, restaurantId);
        break;
      case 'POST':
        await handlePost(request, response, restaurantId);
        break;
      case 'PATCH':
        await handlePatch(request, response, restaurantId);
        break;
      default:
        response.setHeader('Allow', ['GET', 'POST', 'PATCH']);
        return response.status(405).json({ error: { message: `Method ${request.method} Not Allowed` } });
    }

  } catch (error: any) {
    console.error('[API /recompensas] Fatal error:', error);
    return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
  }
}

// --- Handler for GET requests ---
async function handleGet(request: VercelRequest, response: VercelResponse, restaurantId: string) {
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
    }).filter(r => r.value !== null);

    return response.status(200).json(formattedRewards);
}

// --- Handler for POST requests ---
async function handlePost(request: VercelRequest, response: VercelResponse, restaurantId: string) {
    const { name, description, points_cost, reward_type, reward_value, is_active = true } = request.body as Partial<LoyaltyReward & { reward_type: LoyaltyRewardType }>;

    if (!name || points_cost === undefined || !reward_type || !reward_value) {
        return response.status(400).json({ error: { message: '`name`, `points_cost`, `reward_type`, and `reward_value` are required fields.' } });
    }

    let finalRewardValue = reward_value;

    if (reward_type === 'free_item') {
        const { data: recipe, error: recipeError } = await supabase
            .from('recipes')
            .select('id')
            .eq('user_id', restaurantId)
            .eq('external_code', reward_value)
            .single();
        
        if (recipeError || !recipe) {
            return response.status(404).json({ error: { message: `Recipe with external_code "${reward_value}" not found.` } });
        }
        finalRewardValue = recipe.id;
    }

    const { data: newReward, error: insertError } = await supabase
        .from('loyalty_rewards')
        .insert({
            user_id: restaurantId,
            name,
            description,
            points_cost,
            reward_type,
            reward_value: finalRewardValue,
            is_active
        })
        .select()
        .single();
    
    if (insertError) throw insertError;

    return response.status(201).json(newReward);
}

// --- Handler for PATCH requests ---
async function handlePatch(request: VercelRequest, response: VercelResponse, restaurantId: string) {
    const { id } = request.query;

    if (!id || typeof id !== 'string') {
        return response.status(400).json({ error: { message: 'A reward `id` is required in the query parameters.' } });
    }

    const { name, description, points_cost, reward_type, reward_value, is_active } = request.body;
    const updatePayload: { [key: string]: any } = {};
    
    if (name !== undefined) updatePayload.name = name;
    if (description !== undefined) updatePayload.description = description;
    if (points_cost !== undefined) updatePayload.points_cost = points_cost;
    if (is_active !== undefined) updatePayload.is_active = is_active;
    if (reward_type !== undefined) updatePayload.reward_type = reward_type;

    if (reward_type === 'free_item' && reward_value) {
        const { data: recipe, error: recipeError } = await supabase
            .from('recipes')
            .select('id')
            .eq('user_id', restaurantId)
            .eq('external_code', reward_value)
            .single();
        
        if (recipeError || !recipe) {
            return response.status(404).json({ error: { message: `Recipe with external_code "${reward_value}" not found.` } });
        }
        updatePayload.reward_value = recipe.id;
    } else if (reward_value !== undefined) {
        updatePayload.reward_value = reward_value;
    }

    if (Object.keys(updatePayload).length === 0) {
        return response.status(400).json({ error: { message: 'No fields to update provided.' } });
    }

    const { data: updatedReward, error } = await supabase
        .from('loyalty_rewards')
        .update(updatePayload)
        .eq('id', id)
        .eq('user_id', restaurantId)
        .select()
        .single();

    if (error && error.code === 'PGRST116') {
        return response.status(404).json({ error: { message: `Reward with id "${id}" not found.` } });
    }
    if (error) throw error;
    
    return response.status(200).json(updatedReward);
}