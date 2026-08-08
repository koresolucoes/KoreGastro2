import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth, supabase } from '../utils/api-handler.js';
import { remember } from '../utils/redis.js';

export default withAuth(async function handler(req: any, res: any, restaurantId: string) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ type: "about:blank", title: "Method Not Allowed", status: 405, detail: `Method ${req.method} Not Allowed` });
    }

    const { id, nocache } = req.query;

    if (id && typeof id === 'string') {
        const cacheKey = `ingredient:${restaurantId}:${id}`;
        const fetcher = async () => {
            const { data, error } = await supabase.from('ingredients').select('*').eq('user_id', restaurantId).eq('id', id).single();
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
        const { data, error } = await supabase.from('ingredients').select('*').eq('user_id', restaurantId).order('name', { ascending: true });
        if (error) throw error;
        return data || [];
    };

    const ingredients = nocache === 'true' ? await fetchList() : await remember(listCacheKey, 300, fetchList);
    return res.status(200).json(ingredients);
});
