import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth, supabase } from '../../utils/api-handler.js';

export default withAuth(async function handler(req: any, res: any, restaurantId: string) {
    const { action } = req.query;

    if (req.method === 'POST') {
        if (action === 'add-items') {
            const { items, tableId, employeeId } = req.body;
            
            const { data: inserted, error } = await supabase.from('order_items').insert(items).select();
            if (error) return res.status(500).json({ error });

            if (tableId) {
                await supabase.from('tables').update({ status: 'OCUPADA', employee_id: employeeId }).eq('id', tableId).eq('user_id', restaurantId);
            }

            return res.status(200).json(inserted);
        }

        if (action === 'upsert') {
            const { items } = req.body;
            if (!items || !Array.isArray(items)) {
                return res.status(400).json({ error: 'items array is required' });
            }
            const itemsToUpsert = items.map(item => ({ ...item, user_id: restaurantId }));
            const { error } = await supabase.from('order_items').upsert(itemsToUpsert);
            if (error) return res.status(500).json({ error });
            return res.status(200).json({ success: true });
        }
        if (action === 'split') {
            const { itemsToInsert, itemsToUpdate, sourceTable, destinationTable, orderId, destOrderId, deleteSourceOrder } = req.body;

            if (destOrderId) {
                await supabase.from('tables').upsert([
                    { ...destinationTable, user_id: restaurantId, status: 'OCUPADA' }
                ]);
            } else {
                await supabase.from('tables').upsert([
                    { ...destinationTable, user_id: restaurantId, status: 'OCUPADA', employee_id: sourceTable.employee_id, customer_count: sourceTable.customer_count || 1 }
                ]);
            }

            if (itemsToUpdate && itemsToUpdate.length > 0) {
                const { error } = await supabase.from('order_items').upsert(itemsToUpdate);
                if (error) return res.status(500).json({ error });
            }
            if (itemsToInsert && itemsToInsert.length > 0) {
                const { error } = await supabase.from('order_items').insert(itemsToInsert);
                if (error) return res.status(500).json({ error });
            }

            if (deleteSourceOrder) {
                await supabase.from('orders').delete().eq('id', orderId).eq('user_id', restaurantId);
                await supabase.from('tables').update({ status: 'LIVRE', employee_id: null, customer_count: 0 }).eq('id', sourceTable.id).eq('user_id', restaurantId);
            }

            return res.status(200).json({ success: true });
        }
    }

    if (req.method === 'PUT') {
        const { itemIds, updates, updateOrderIdsForDelivery } = req.body;

        if (itemIds && updates) {
            const itemsUpdates = itemIds.map((id: string) => ({ id, user_id: restaurantId, ...updates }));
            const { error } = await supabase.from('order_items').upsert(itemsUpdates);
            if (error) return res.status(500).json({ error });
            
            return res.status(200).json({ success: true, updatedOrderIds: updateOrderIdsForDelivery || [] });
        }
    }

    res.setHeader('Allow', ['POST', 'PUT']);
    return res.status(405).json({ error: 'Method Not Allowed' });
});