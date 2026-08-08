import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth, supabase } from '../utils/api-handler.js';
import { remember, invalidateCachePattern } from '../utils/redis.js';

export default withAuth(async function handler(req: any, res: any, restaurantId: string) {
    const { id, nocache } = req.query;

    if (req.method === 'GET') {
        const listCacheKey = `suppliers:${restaurantId}`;
        const fetchList = async () => {
            const { data, error } = await supabase.from('suppliers').select('*').eq('user_id', restaurantId).order('name', { ascending: true });
            if (error) throw error;
            return data || [];
        };

        const suppliers = nocache === 'true' ? await fetchList() : await remember(listCacheKey, 300, fetchList);
        return res.status(200).json(suppliers);
    }

    if (req.method === 'POST') {
        const payload = { ...req.body, user_id: restaurantId };
        const { data, error } = await supabase.from('suppliers').insert(payload).select().single();
        if (error) throw error;
        
        await invalidateCachePattern(`suppliers:${restaurantId}`);
        return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
        if (!id || typeof id !== 'string') {
            return res.status(400).json({ success: false, error: 'Missing id for PUT' });
        }
        
        const { user_id, id: bodyId, ...payload } = req.body;
        const { data, error } = await supabase.from('suppliers').update(payload).eq('id', id).eq('user_id', restaurantId).select().single();
        if (error) throw error;

        await invalidateCachePattern(`suppliers:${restaurantId}`);
        return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
        if (!id || typeof id !== 'string') {
            return res.status(400).json({ success: false, error: 'Missing id for DELETE' });
        }
        
        const { error } = await supabase.from('suppliers').delete().eq('id', id).eq('user_id', restaurantId);
        if (error) throw error;

        await invalidateCachePattern(`suppliers:${restaurantId}`);
        return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    return res.status(405).json({ type: "about:blank", title: "Method Not Allowed", status: 405, detail: `Method ${req.method} Not Allowed` });
});