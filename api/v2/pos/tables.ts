import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth, supabase } from '../../utils/api-handler.js';
import { invalidateCachePattern } from '../../utils/redis.js';

export default withAuth(async function handler(req: any, res: any, restaurantId: string) {
    const { id, hallId, action } = req.query;

    if (req.method === 'POST') {
        if (action === 'upsert') {
            const { tables } = req.body;
            const tablesToUpsert = tables.map((t: any) => {
                let tId = t.id;
                if (tId?.startsWith("temp-")) {
                    tId = tId.replace("temp-", "");
                }
                const payload: any = {
                    user_id: restaurantId,
                    number: t.number,
                    hall_id: t.hall_id,
                    status: t.status || 'LIVRE',
                    x: t.x || 0,
                    y: t.y || 0,
                    width: t.width || 80,
                    height: t.height || 80,
                    employee_id: t.employee_id || null,
                    customer_count: t.customer_count || 0,
                    created_at: t.created_at || new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                if (tId) payload.id = tId;
                return payload;
            });
            const { error } = await supabase.from('tables').upsert(tablesToUpsert);
            if (error) return res.status(500).json({ error });
            return res.status(200).json({ success: true });
        }
    }

    if (req.method === 'PUT') {
        const updates = req.body;
        const { error } = await supabase.from('tables').update(updates).eq('id', id).eq('user_id', restaurantId);
        if (error) return res.status(500).json({ error });
        return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
        if (hallId) {
            const { error } = await supabase.from('tables').delete().eq('hall_id', hallId).eq('user_id', restaurantId);
            if (error) return res.status(500).json({ error });
            return res.status(200).json({ success: true });
        } else if (id) {
            const { error } = await supabase.from('tables').delete().eq('id', id).eq('user_id', restaurantId);
            if (error) return res.status(500).json({ error });
            return res.status(200).json({ success: true });
        }
        return res.status(400).json({ error: 'Missing id or hallId' });
    }

    res.setHeader('Allow', ['POST', 'PUT', 'DELETE']);
    return res.status(405).json({ error: 'Method Not Allowed' });
});