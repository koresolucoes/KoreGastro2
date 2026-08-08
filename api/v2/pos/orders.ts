import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth, supabase } from '../../utils/api-handler.js';
import { invalidateCachePattern } from '../../utils/redis.js';

export default withAuth(async function handler(req: any, res: any, restaurantId: string) {
    const { id, action } = req.query;

    if (req.method === 'POST') {
        const payload = { ...req.body, user_id: restaurantId, session_token: req.body.session_token || crypto.randomUUID() };
        const { data, error } = await supabase.from('orders').insert(payload).select('*, customers(*)').single();
        if (error) return res.status(500).json({ error });
        return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
        if (action === 'release') {
            const { tableId } = req.body;
            await supabase.from('tables').update({ status: 'LIVRE', employee_id: null, customer_count: 0 }).eq('id', tableId).eq('user_id', restaurantId);
            const { error } = await supabase.from('orders').delete().eq('id', id).eq('user_id', restaurantId);
            if (error) return res.status(500).json({ error });
            return res.status(200).json({ success: true });
        }
        
        const updates = req.body;
        const { error } = await supabase.from('orders').update(updates).eq('id', id).eq('user_id', restaurantId);
        if (error) return res.status(500).json({ error });
        return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
        const { data: order } = await supabase.from('orders').select('table_number').eq('id', id).eq('user_id', restaurantId).single();
        
        if (action === 'with-items') {
            await supabase.from('order_items').delete().eq('order_id', id).eq('user_id', restaurantId);
        }

        const { error } = await supabase.from('orders').delete().eq('id', id).eq('user_id', restaurantId);
        if (error) return res.status(500).json({ error });

        if (order && order.table_number > 0) {
            const { count } = await supabase.from('orders').select('*', { count: 'exact', head: true })
                .eq('table_number', order.table_number).eq('user_id', restaurantId).in('status', ['OPEN', 'PAYING']);
            if (count === 0) {
                await supabase.from('tables').update({ status: 'LIVRE', employee_id: null, customer_count: 0 })
                    .eq('number', order.table_number).eq('user_id', restaurantId);
            }
        }

        return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', ['POST', 'PUT', 'DELETE']);
    return res.status(405).json({ error: 'Method Not Allowed' });
});