import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth, supabase } from '../../utils/api-handler.js';
import { invalidateCachePattern } from '../../utils/redis.js';

export default withAuth(async function handler(req: any, res: any, restaurantId: string) {
    const { id } = req.query;

    if (req.method === 'GET') {
        const { data, error } = await supabase.from('halls').select('*').eq('user_id', restaurantId);
        if (error) return res.status(500).json({ error });
        return res.status(200).json(data);
    }

    if (req.method === 'POST') {
        const { name } = req.body;
        const { data: existing } = await supabase.from('halls').select().eq('user_id', restaurantId).eq('name', name).maybeSingle();
        if (existing) return res.status(200).json(existing);

        const { data, error } = await supabase.from('halls').insert({ name, user_id: restaurantId }).select().single();
        if (error) return res.status(500).json({ error });
        return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
        const { name } = req.body;
        const { error } = await supabase.from('halls').update({ name }).eq('id', id).eq('user_id', restaurantId);
        if (error) return res.status(500).json({ error });
        return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
        const { error } = await supabase.from('halls').delete().eq('id', id).eq('user_id', restaurantId);
        if (error) return res.status(500).json({ error });
        return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    return res.status(405).json({ error: 'Method Not Allowed' });
});