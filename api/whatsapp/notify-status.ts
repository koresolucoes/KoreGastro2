import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).end();
    }

    try {
        console.log("NOTIFY STATUS CALLED", req.body);
        const { orderId, status } = req.body;
        if (!orderId || !status) return res.status(400).json({ error: 'Missing orderId or status' });

        // Get order details
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();

        console.log("ORDER DATA:", order?.id, "error:", orderError);

        if (orderError || !order) throw new Error('Order not found');
        
        if (!order.ifood_order_id?.startsWith('wa-') && !order.ifood_order_id?.startsWith('test-ia-')) {
            console.log("Not a whatsapp order:", order.ifood_order_id);
            // Not a WhatsApp order, skip
            return res.status(200).json({ success: true, message: 'Not a WhatsApp order' });
        }

        console.log("Finding whatsapp chat for customer:", order.customer_id, "store:", order.user_id);
        // Get chat by customer_id and store_id
        const { data: chat, error: chatError } = await supabase
            .from('whatsapp_chats')
            .select('id, store_id, customer_phone')
            .eq('store_id', order.user_id)
            .eq('customer_id', order.customer_id)
            .single();

        console.log("CHAT DATA:", chat?.id, "error:", chatError);

        if (chatError || !chat) {
             // Maybe no chat exists, ignore
             return res.status(200).json({ success: true, message: 'No chat found' });
        }

        // Generate message based on status
        let text = '';
        if (status === 'IN_PREPARATION') {
             text = `🎉 Oba! Seu pedido acabou de ser confirmado e já enviamos para a nossa cozinha preparar com todo o carinho! 🧑‍🍳✨`;
        } else if (status === 'READY_FOR_DISPATCH') {
             if (order.order_type?.includes('Takeout') || order.order_type?.includes('Pickup')) {
                  text = `🛵 Ei! Seu pedido já está PRONTO e esperando por você aqui no balcão! Venha buscar! 😉🍔`;
             } else {
                  text = `🛵 Ei! Seu pedido já está PRONTO e acabou de sair para entrega! O motoboy já está a caminho! Prepare a mesa! 🥳🍔`;
             }
        } else {
             return res.status(200).json({ success: true, message: 'Unhandled status' });
        }

        // Get config
        const { data: config, error: configError } = await supabase
            .from('whatsapp_configs')
            .select('phone_number_id, access_token')
            .eq('store_id', chat.store_id)
            .eq('is_active', true)
            .single();

        console.log("CONFIG:", !!config, "error:", configError);

        if (configError || !config) throw new Error('Config not found for store');

        console.log("Sending message to:", chat.customer_phone, "text:", text);
        // Send to Facebook
        const fbRes = await fetch(`https://graph.facebook.com/v19.0/${config.phone_number_id}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to: chat.customer_phone,
                type: "text",
                text: { body: text }
            })
        });

        const fbData = await fbRes.json();
        const msgId = fbData?.messages?.[0]?.id || `local-human-${Math.random()}`;
        console.log("FB Res:", fbData);

        // Save to DB
        await supabase
            .from('whatsapp_messages')
            .insert({
                chat_id: chat.id,
                wa_message_id: msgId,
                sender_type: 'bot',
                content: text
            });

        return res.status(200).json({ success: true });
    } catch (error: any) {
        console.error('Error sending WA status notification:', error);
        return res.status(500).json({ error: error.message });
    }
}
