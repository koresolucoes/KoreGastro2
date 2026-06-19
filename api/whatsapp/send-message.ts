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
        const { chatId, text } = req.body;
        if (!chatId || !text) return res.status(400).json({ error: 'Missing chatId or text' });

        // Get chat details
        const { data: chat, error: chatError } = await supabase
            .from('whatsapp_chats')
            .select('customer_phone, store_id')
            .eq('id', chatId)
            .single();

        if (chatError || !chat) throw new Error('Chat not found');

        // Get config
        const { data: config, error: configError } = await supabase
            .from('whatsapp_configs')
            .select('phone_number_id, access_token')
            .eq('store_id', chat.store_id)
            .eq('is_active', true)
            .single();

        if (configError || !config) throw new Error('Config not found for store');

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
        if (fbData.error) {
            console.error('FB API Error:', fbData.error);
            // We still proceed to save the message locally for tracking purposes (maybe as failed?)
        }

        const msgId = fbData.messages?.[0]?.id || `local-human-${Math.random()}`;

        // Save to DB
        const { data: insertData, error: insertError } = await supabase
            .from('whatsapp_messages')
            .insert({
                chat_id: chatId,
                wa_message_id: msgId,
                sender_type: 'human',
                content: text
            })
            .select()
            .single();

        if (insertError) throw insertError;

        // Update chat last message 
        await supabase.from('whatsapp_chats').update({ last_message_at: new Date().toISOString() }).eq('id', chatId);

        return res.status(200).json({ success: true, message: insertData });

    } catch (error: any) {
        console.error('Error sending WA message:', error);
        return res.status(500).json({ error: error.message });
    }
}
