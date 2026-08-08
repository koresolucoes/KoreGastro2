import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth, supabase } from '../utils/api-handler.js';
import { remember, invalidateCachePattern } from '../utils/redis.js';

export default withAuth(async function handler(req: any, res: any, restaurantId: string) {
    const { id, nocache } = req.query;

    if (req.method === 'GET') {
        if (id && typeof id === 'string') {
            const cacheKey = `ingredient:${restaurantId}:${id}`;
            const fetcher = async () => {
                const { data, error } = await supabase.from('ingredients').select('*, ingredient_categories(name), suppliers(name)').eq('user_id', restaurantId).eq('id', id).single();
                if (error) {
                    if (error.code === 'PGRST116') return null;
                    throw error;
                }
                return data;
            };

            const item = nocache === 'true' ? await fetcher() : await remember(cacheKey, 300, fetcher);
            if (!item) {
                return res.status(404).json({ type: "about:blank", title: "Not Found", status: 404, detail: `Ingredient with id "${id}" not found.` });
            }
            return res.status(200).json(item);
        }

        const listCacheKey = `ingredients:${restaurantId}`;
        const fetchList = async () => {
            const { data, error } = await supabase.from('ingredients').select('*, ingredient_categories(name), suppliers(name)').eq('user_id', restaurantId).order('name', { ascending: true });
            if (error) throw error;
            return data || [];
        };

        const ingredients = nocache === 'true' ? await fetchList() : await remember(listCacheKey, 300, fetchList);
        return res.status(200).json(ingredients);
    }

    if (req.method === 'POST') {
        const payload = { ...req.body, user_id: restaurantId };
        // Stock should probably be initialized to 0, or handled separately
        const { data, error } = await supabase.from('ingredients').insert(payload).select('*, ingredient_categories(name), suppliers(name)').single();
        if (error) throw error;
        
        await invalidateCachePattern(`ingredients:${restaurantId}`);
        return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
        if (!id || typeof id !== 'string') {
            return res.status(400).json({ success: false, error: 'Missing id for PUT' });
        }
        
        const { user_id, id: bodyId, ...payload } = req.body;
        const { data, error } = await supabase.from('ingredients').update(payload).eq('id', id).eq('user_id', restaurantId).select('*, ingredient_categories(name), suppliers(name)').single();
        if (error) throw error;

        await invalidateCachePattern(`ingredient:${restaurantId}:${id}`);
        await invalidateCachePattern(`ingredients:${restaurantId}`);
        return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
        if (!id || typeof id !== 'string') {
            return res.status(400).json({ success: false, error: 'Missing id for DELETE' });
        }
        
        const { error } = await supabase.from('ingredients').delete().eq('id', id).eq('user_id', restaurantId);
        if (error) throw error;

        await invalidateCachePattern(`ingredient:${restaurantId}:${id}`);
        await invalidateCachePattern(`ingredients:${restaurantId}`);
        return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    return res.status(405).json({ type: "about:blank", title: "Method Not Allowed", status: 405, detail: `Method ${req.method} Not Allowed` });
});
