import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth, supabase } from '../utils/api-handler.js';
import { remember, invalidateCachePattern } from '../utils/redis.js';

export default withAuth(async function handler(req: any, res: any, restaurantId: string) {
    const { id, nocache } = req.query;

    if (req.method === 'GET') {
        if (id && typeof id === 'string') {
            const cacheKey = `recipe:${restaurantId}:${id}`;
            const fetcher = async () => {
                const { data, error } = await supabase.from('recipes').select('*').eq('store_id', restaurantId).eq('id', id).single();
                if (error) {
                    if (error.code === 'PGRST116') return null;
                    throw error;
                }
                return data;
            };

            const item = nocache === 'true' ? await fetcher() : await remember(cacheKey, 300, fetcher);
            if (!item) {
                return res.status(404).json({ type: "about:blank", title: "Not Found", status: 404, detail: `Recipe with id "${id}" not found.` });
            }
            return res.status(200).json(item);
        }

        const listCacheKey = `recipes:${restaurantId}`;
        const fetchList = async () => {
            const { data, error } = await supabase.from('recipes').select('*').eq('store_id', restaurantId).order('name', { ascending: true });
            if (error) throw error;
            return data || [];
        };

        const recipes = nocache === 'true' ? await fetchList() : await remember(listCacheKey, 300, fetchList);
        return res.status(200).json(recipes);
    }

    if (req.method === 'POST') {
        const payload = { ...req.body, store_id: restaurantId };
        const { data, error } = await supabase.from('recipes').insert(payload).select().single();
        if (error) throw error;
        
        await invalidateCachePattern(`recipes:${restaurantId}`);
        return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
        if (!id || typeof id !== 'string') {
            return res.status(400).json({ success: false, error: 'Missing id for PUT' });
        }
        
        const { store_id, id: bodyId, ...payload } = req.body;
        const { data, error } = await supabase.from('recipes').update(payload).eq('id', id).eq('store_id', restaurantId).select().single();
        if (error) throw error;

        await invalidateCachePattern(`recipe:${restaurantId}:${id}`);
        await invalidateCachePattern(`recipes:${restaurantId}`);
        return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
        if (!id || typeof id !== 'string') {
            return res.status(400).json({ success: false, error: 'Missing id for DELETE' });
        }
        
        await supabase.from('recipe_ingredients').delete().eq('recipe_id', id);
        await supabase.from('recipe_sub_recipes').delete().eq('parent_recipe_id', id);
        await supabase.from('recipe_sub_recipes').delete().eq('child_recipe_id', id);
        await supabase.from('recipe_preparations').delete().eq('recipe_id', id);
        await supabase.from('promotion_recipes').delete().eq('recipe_id', id);
        await supabase.from('order_items').delete().eq('recipe_id', id);

        const { error } = await supabase.from('recipes').delete().eq('id', id).eq('store_id', restaurantId);
        if (error) throw error;

        await invalidateCachePattern(`recipe:${restaurantId}:${id}`);
        await invalidateCachePattern(`recipes:${restaurantId}`);
        return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    return res.status(405).json({ type: "about:blank", title: "Method Not Allowed", status: 405, detail: `Method ${req.method} Not Allowed` });
});
