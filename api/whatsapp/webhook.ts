import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type, FunctionDeclaration, Chat } from "@google/genai";
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Create submit_public_order function declaration
const submitOrderFunc: FunctionDeclaration = {
  name: "submit_public_order",
  description: "Submit a complete food order for delivery or takeout. Use ONLY when the user has finished choosing all items, selected a payment method, and provided a valid delivery address or takeout choice.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      customer_name: {
        type: Type.STRING,
        description: "The name of the customer."
      },
      address: {
          type: Type.STRING,
          description: "Full delivery address if applicable. Put 'TAKEOUT' if the customer will pick it up."
      },
      payment_method: {
          type: Type.STRING,
          description: "How the customer plans to pay (e.g. 'Credit Card PIX', 'Cash on delivery')"
      },
      items: {
          type: Type.ARRAY,
          description: "List of items the customer ordered",
          items: {
              type: Type.OBJECT,
              properties: {
                  recipe_id: { type: Type.STRING, description: "The UUID of the product from the menu" },
                  quantity: { type: Type.NUMBER },
                  notes: { type: Type.STRING, description: "Special instructions for the item" }
              },
              required: ["recipe_id", "quantity"]
          }
      }
    },
    required: ["customer_name", "items", "payment_method", "address"]
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'GET') {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];
        
        if (mode === 'subscribe' && token === 'chefos_whatsapp_webhook_2024') {
            return res.status(200).send(challenge);
        }
        return res.status(403).end();
    }

    if (req.method === 'POST') {
        try {
            const body = req.body;
            console.log('WhatsApp Webhook:', JSON.stringify(body));

            if (body.object !== 'whatsapp_business_account') {
                return res.status(404).end();
            }

            const storeIdQuery = req.query.storeId as string | undefined;

            for (const entry of body.entry) {
                for (const change of entry.changes) {
                    if (change.value && change.value.messages && change.value.messages[0]) {
                        await processMessage(change.value, storeIdQuery);
                    }
                }
            }
            return res.status(200).send('EVENT_RECEIVED');
        } catch (error) {
            console.error('Webhook error:', error);
            // Don't fail the webhook processing itself for business logic errors
            return res.status(200).send('ERROR_HANDLED');
        }
    }
    
    return res.status(405).end();
}

async function processMessage(value: any, storeIdQuery?: string) {
    const message = value.messages[0];
    const customerPhone = message.from; // Sender ID
    const messageText = message.text?.body;
    if (!messageText) return;

    const phoneNumberId = value.metadata.phone_number_id;

    // 1. Get configs
    let configQuery = supabase
        .from('whatsapp_configs')
        .select('store_id, access_token')
        .eq('is_active', true);

    if (storeIdQuery) {
        configQuery = configQuery.eq('store_id', storeIdQuery);
    } else {
        configQuery = configQuery.eq('phone_number_id', phoneNumberId);
    }

    const { data: config } = await configQuery.single();

    if (!config) {
        console.error('No active WhatsApp config found for phone ID or store ID:', phoneNumberId, storeIdQuery);
        return;
    }

    const storeId = config.store_id;

    // 2. Fetch/Create Chat
    let { data: chat } = await supabase
        .from('whatsapp_chats')
        .select('*')
        .eq('store_id', storeId)
        .eq('customer_phone', customerPhone)
        .single();
        
    if (!chat) {
        // Find existing customer by phone or create new pseudo customer?
        const { data: customer } = await supabase
            .from('customers')
            .select('id')
            .eq('user_id', storeId)
            .eq('phone', customerPhone)
            .single();

        const { data: newChat } = await supabase.from('whatsapp_chats').insert({
            store_id: storeId,
            customer_phone: customerPhone,
            customer_id: customer?.id || null,
            status: 'active',
            last_message_at: new Date().toISOString()
        }).select().single();
        chat = newChat;
    } else {
        await supabase.from('whatsapp_chats').update({ last_message_at: new Date().toISOString() }).eq('id', chat.id);
    }

    // 3. Save incoming message
    await supabase.from('whatsapp_messages').insert({
        chat_id: chat.id,
        wa_message_id: message.id,
        sender_type: 'customer',
        content: messageText
    });

    // Handle Human Handoff Mode
    if (chat.status === 'human') {
        // Just store the message, do not invoke AI
        console.log(`Chat ${chat.id} is in HUMAN mode. Skipping Gemini.`);
        return;
    }

    // 4. Load Restaurant Menu and History
    const { data: menu } = await supabase.from('recipes')
        .select('id, name, price, description')
        .eq('user_id', storeId)
        .eq('is_available', true);

    const { data: history } = await supabase.from('whatsapp_messages')
        .select('sender_type, content')
        .eq('chat_id', chat.id)
        .order('created_at', { ascending: false })
        .limit(20);

    const messageHistory = (history || []).reverse().map((msg: any) => ({
        role: msg.sender_type === 'customer' ? 'user' : 'model',
        parts: [{ text: msg.content }]
    }));

    // Start with the latest message as the main content prompt to append.
    // However we've already appended it to history technically, but let's just make `contents` array.
    const contents = messageHistory;

    const systemInstruction = `Você é o Assistente Virtual e Garçom IA deste restaurante.
Regras de Negócio Importantes:
1. NÃO aceite alterações ou personalizações em pratos promocionais.
2. Sempre seja educado, direto e chame o cliente pelo primeiro nome se ele falar.
3. Este é o nosso cardápio de produtos disponíveis (NÃO invente itens que não estão aqui, referencie-os pelos UUIDs quando for fazer o pedido):
${JSON.stringify(menu || [], null, 2)}

Seu objetivo:
Identificar o que o cliente quer, informar o preço correto.
Para o pedido ser válido e fechado, você PRECISA recolher:
- O nome do cliente
- Os itens solicitados
- O meio de pagamento
- O Endereço de entrega COMPLETO (ou perguntar se é para retirar no local)

APENAS QUANDO e SOMENTE QUANDO você tiver todas as informações e o pedido estiver 100% FECHADO, você DEVE acionar a tool "submit_public_order".
Isso evita requisições fantasmas na Cozinha!
Ao acionar a tool, não precisa retornar uma mensagem longa, apenas agradeça (ex: Pedido confirmado com sucesso!) e feche o fluxo.`;

    const chatSession = ai.chats.create({
        model: "gemini-3.5-flash",
        config: {
            systemInstruction,
            tools: [{ functionDeclarations: [submitOrderFunc] }],
            temperature: 0.2
        },
        history: contents.slice(0, -1) // All except the very last one
    });

    const response = await chatSession.sendMessage({ message: contents[contents.length - 1]?.parts[0]?.text || "Hello" });

    // Handle Function Call from AI
    const functionCalls = response.functionCalls;
    let replyText = response.text || "";

    if (functionCalls && functionCalls.length > 0) {
        for (const call of functionCalls) {
            if (call.name === 'submit_public_order') {
                const args = call.args as any;
                // Create order in Supabase
                try {
                   await createOrder(storeId, args);
                   replyText = `Ótimo! Seu pedido foi enviado para a cozinha com sucesso. Vamos preparar rapidinho!`;
                } catch(e) {
                   console.error("Error creating order from tool:", e);
                   replyText = "Houve um erro interno ao lançar seu pedido, aguarde enquanto um atendente verifica.";
                }
            }
        }
    }

    if (replyText) {
        // Send reply to WhatsApp
        await sendWhatsAppMessage(customerPhone, replyText, config.access_token, phoneNumberId);

        // Save AI reply to DB
        await supabase.from('whatsapp_messages').insert({
            chat_id: chat.id,
            wa_message_id: 'bot-' + uuidv4(),
            sender_type: 'bot',
            content: replyText
        });
    }
}

async function createOrder(storeId: string, args: any) {
    const orderId = uuidv4();
    const finalOrderData = {
        id: orderId,
        user_id: storeId,
        status: 'OPEN',
        order_type: (args.address && args.address.toUpperCase().includes('TAKEOUT')) ? 'iFood-Takeout' : 'iFood-Delivery', // Use Delivery
        notes: `Nome: ${args.customer_name || 'Desconhecido'} | Pgto: ${args.payment_method || 'Não inf.'} | End: ${args.address || 'Não inf.'}`,
        ifood_display_id: Math.floor(1000 + Math.random() * 9000).toString(),
        ifood_order_id: `wa-${orderId}`
    };

    let orderItems = [];

    if (args.items && args.items.length > 0) {
       // Need to fetch original price
       const { data: recipes } = await supabase.from('recipes').select('id, price, name').in('id', args.items.map((i: any) => i.recipe_id));
       
       orderItems = args.items.map((item: any) => {
           const r = recipes?.find((x) => x.id === item.recipe_id);
           return {
             order_id: orderId,
             user_id: storeId,
             recipe_id: item.recipe_id,
             name: r ? r.name : 'Unknown Item',
             quantity: item.quantity,
             price: r ? r.price : 0,
             original_price: r ? r.price : 0,
             notes: item.notes || '',
             status: 'PENDENTE',
             status_timestamps: { 'PENDENTE': new Date().toISOString() },
             station_id: null
           };
       });
    }

    const { error: orderError } = await supabase
        .from('orders')
        .insert(finalOrderData);

    if (orderError) {
        console.error("Order Insert Error:", orderError);
        throw orderError;
    }

    if (orderItems.length > 0) {
        const { error: itemsError } = await supabase
            .from('order_items')
            .insert(orderItems);
        if (itemsError) {
             console.error("Items Insert Error:", itemsError);
             throw itemsError;
        }
    }
}

async function sendWhatsAppMessage(to: string, body: string, token: string, phoneNumberId: string) {
    // Official WhatsApp Cloud API Call
    try {
        await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to: to,
                type: "text",
                text: { body }
            })
        });
    } catch(e) {
        console.error("Error sending WA message", e);
    }
}
