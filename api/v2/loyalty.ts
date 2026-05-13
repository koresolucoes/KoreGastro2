import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { withAuth, supabase } from '../utils/api-handler.js';

export default withAuth(async function handler(request: VercelRequest, response: VercelResponse, restaurantId: string) {
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
            response.status(405).json({ error: { message: `Method ${request.method} Not Allowed` } });
    }
});

async function handleGet(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { data: rewards, error: rewardsError } = await supabase
        .from('loyalty_rewards')
        .select('id, name, description, points_cost, reward_type, reward_value')
        .eq('user_id', restaurantId)
        .eq('is_active', true)
        .order('points_cost', { ascending: true });

    if (rewardsError) throw rewardsError;
    if (!rewards) return res.status(200).json([]);

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

    return res.status(200).json(formattedRewards);
}

const postLoyaltySchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    points_cost: z.number().min(1),
    reward_type: z.enum(['discount_percentage', 'discount_fixed', 'free_item']),
    reward_value: z.string().min(1),
    is_active: z.boolean().default(true)
});

async function handlePost(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const parsed = postLoyaltySchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
    }

    const { name, description, points_cost, reward_type, reward_value, is_active } = parsed.data;
    let finalRewardValue = reward_value;

    if (reward_type === 'free_item') {
        const { data: recipe, error: recipeError } = await supabase
            .from('recipes')
            .select('id')
            .eq('user_id', restaurantId)
            .eq('external_code', reward_value)
            .single();
        
        if (recipeError || !recipe) {
            return res.status(404).json({ error: { message: `Recipe with external_code "${reward_value}" not found.` } });
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

    return res.status(201).json(newReward);
}

const patchLoyaltySchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    points_cost: z.number().min(1).optional(),
    reward_type: z.enum(['discount_percentage', 'discount_fixed', 'free_item']).optional(),
    reward_value: z.string().min(1).optional(),
    is_active: z.boolean().optional()
}).refine(data => Object.keys(data).length > 0, {
    message: "No fields to update provided."
});

async function handlePatch(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: { message: 'A reward `id` is required in the query parameters.' } });
    }

    const parsed = patchLoyaltySchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
    }

    const updateData = parsed.data;
    const updatePayload: { [key: string]: any } = { ...updateData };

    if (updateData.reward_type === 'free_item' && updateData.reward_value) {
        const { data: recipe, error: recipeError } = await supabase
            .from('recipes')
            .select('id')
            .eq('user_id', restaurantId)
            .eq('external_code', updateData.reward_value)
            .single();
        
        if (recipeError || !recipe) {
            return res.status(404).json({ error: { message: `Recipe with external_code "${updateData.reward_value}" not found.` } });
        }
        updatePayload.reward_value = recipe.id;
    }

    const { data: updatedReward, error } = await supabase
        .from('loyalty_rewards')
        .update(updatePayload)
        .eq('id', id)
        .eq('user_id', restaurantId)
        .select()
        .single();

    if (error && error.code === 'PGRST116') {
        return res.status(404).json({ error: { message: `Reward with id "${id}" not found.` } });
    }
    if (error) throw error;
    
    return res.status(200).json(updatedReward);
}
