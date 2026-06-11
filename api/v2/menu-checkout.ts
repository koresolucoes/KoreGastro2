import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth, supabase } from '../utils/api-handler.js';
import { v4 as uuidv4 } from 'uuid';
import { triggerWebhook } from '../webhook-emitter.js';

export default withAuth(async function handler(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } });
    }

    try {
        const { orderData, items } = req.body;

        if (!orderData || !items || !Array.isArray(items)) {
            return res.status(400).json({ error: { message: 'Invalid payload: requires orderData and items array' } });
        }

        const orderId = uuidv4();
        
        // Ensure the table_number is set properly
        const finalOrderData = {
            ...orderData,
            id: orderId,
            user_id: restaurantId,
            status: 'OPEN',
        };

        const { data: orderResponse, error: orderError } = await supabase
            .from('orders')
            .insert(finalOrderData)
            .select('*')
            .single();

        if (orderError) throw orderError;

        const orderItems = items.map((item: any) => ({
             ...item,
             order_id: orderId,
             user_id: restaurantId,
             status_timestamps: { 'PENDENTE': new Date().toISOString() },
             status: 'PENDENTE'
        }));

        const { error: itemsError } = await supabase
            .from('order_items')
            .insert(orderItems);

        if (itemsError) throw itemsError;

        // Trigger real-time webhooks or other processes
        await triggerWebhook(restaurantId, 'order.created', orderResponse).catch(console.error);

        return res.status(201).json({ success: true, orderId: orderId, order: orderResponse });

    } catch (error: any) {
        console.error('[Menu Checkout API Error]', error);
        return res.status(500).json({ error: { message: 'Internal Server Error', details: error.message } });
    }
});
