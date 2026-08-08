import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth, supabase } from '../utils/api-handler.js';
import { remember, invalidateCachePattern } from '../utils/redis.js';

export default withAuth(async function handler(req: any, res: any, restaurantId: string) {
    const { id, nocache } = req.query;

    if (req.method === 'GET') {
        const listCacheKey = `purchase-orders:${restaurantId}`;
        const fetchList = async () => {
            const { data, error } = await supabase.from('purchase_orders')
                .select('*, suppliers(name), purchase_order_items(*, ingredients(name, unit))')
                .eq('user_id', restaurantId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        };

        const orders = nocache === 'true' ? await fetchList() : await remember(listCacheKey, 300, fetchList);
        return res.status(200).json(orders);
    }

    if (req.method === 'POST') {
        const { items, ...orderData } = req.body;
        const payload = { ...orderData, user_id: restaurantId };
        
        const { data: order, error } = await supabase.from('purchase_orders').insert(payload).select().single();
        if (error) throw error;
        
        if (items && items.length > 0) {
            const itemsToInsert = items.map((item: any) => ({
                ...item,
                purchase_order_id: order.id,
                user_id: restaurantId
            }));
            const { error: itemsError } = await supabase.from('purchase_order_items').insert(itemsToInsert);
            if (itemsError) {
                await supabase.from('purchase_orders').delete().eq('id', order.id);
                throw itemsError;
            }
        }
        
        await invalidateCachePattern(`purchase-orders:${restaurantId}`);
        return res.status(201).json(order);
    }

    if (req.method === 'PUT') {
        if (!id || typeof id !== 'string') {
            return res.status(400).json({ success: false, error: 'Missing id for PUT' });
        }
        
        const { items, ...orderData } = req.body;
        
        const { data, error } = await supabase.from('purchase_orders').update(orderData).eq('id', id).eq('user_id', restaurantId).select().single();
        if (error) throw error;

        if (items !== undefined) {
            await supabase.from('purchase_order_items').delete().eq('purchase_order_id', id);
            
            if (items.length > 0) {
                const itemsToInsert = items.map((item: any) => ({
                    ...item,
                    purchase_order_id: id,
                    user_id: restaurantId
                }));
                const { error: itemsError } = await supabase.from('purchase_order_items').insert(itemsToInsert);
                if (itemsError) throw itemsError;
            }
        }

        await invalidateCachePattern(`purchase-orders:${restaurantId}`);
        return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
        if (!id || typeof id !== 'string') {
            return res.status(400).json({ success: false, error: 'Missing id for DELETE' });
        }
        
        await supabase.from('purchase_order_items').delete().eq('purchase_order_id', id);
        const { error } = await supabase.from('purchase_orders').delete().eq('id', id).eq('user_id', restaurantId);
        if (error) throw error;

        await invalidateCachePattern(`purchase-orders:${restaurantId}`);
        return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    return res.status(405).json({ type: "about:blank", title: "Method Not Allowed", status: 405, detail: `Method ${req.method} Not Allowed` });
});