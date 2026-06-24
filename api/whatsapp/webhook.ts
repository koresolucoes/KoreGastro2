import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI, Type, FunctionDeclaration, Chat } from "@google/genai";
import { v4 as uuidv4 } from "uuid";
import * as dotenv from "dotenv";
dotenv.config();

const supabaseUrl =
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseKey =
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

const supabase = createClient(supabaseUrl, supabaseKey);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// Create submit_public_order function declaration
const requestHumanHandoffFunc: FunctionDeclaration = {
  name: "request_human_handoff",
  description:
    "Pausa a automação e solicita transbordo para um atendente humano. Use se o cliente estiver frustrado, irritado, se a dúvida fugir do escopo ou se o cliente pedir explicitamente para falar com um atendente.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      reason: {
        type: Type.STRING,
        description: "O motivo do transbordo.",
      },
    },
    required: ["reason"],
  },
};

const submitOrderFunc: FunctionDeclaration = {
  name: "submit_public_order",
  description:
    "Submit a complete food order for delivery or takeout. Use ONLY when the user has finished choosing all items, selected a payment method, and provided a valid delivery address or takeout choice. DO NOT call this if the order was already submitted in previous messages.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      customer_name: {
        type: Type.STRING,
        description: "The name of the customer.",
      },
      address: {
        type: Type.STRING,
        description:
          "Full delivery address se for entrega. Coloque 'TAKEOUT' ou 'Retirada' se for retirar no local.",
      },
      payment_method: {
        type: Type.STRING,
        description:
          "Forma de pagamento (ex: 'Cartão de Crédito', 'Pix', 'Dinheiro com troco para 100').",
      },
      notes: {
        type: Type.STRING,
        description:
          "Anotações gerais do pedido ou observações do cliente (ex: Troco, ponto da carne, etc).",
      },
      customer_tags: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description:
          "Tags para classificar o cliente (ex: 'Vegano', 'VIP', 'Reclamou').",
      },
      items: {
        type: Type.ARRAY,
        description: "List of items the customer ordered",
        items: {
          type: Type.OBJECT,
          properties: {
            recipe_id: {
              type: Type.STRING,
              description: "UUID da receita do cardápio.",
            },
            quantity: {
              type: Type.NUMBER,
              description: "Quantidade solicitada.",
            },
            notes: {
              type: Type.STRING,
              description:
                "Instruções específicas para este item (ex: 'Meia mussarela meia calabresa', 'Sem cebola', 'Borda de catupiry').",
            },
          },
          required: ["recipe_id", "quantity"],
        },
      },
    },
    required: ["customer_name", "items", "payment_method", "address"],
  },
};

const manageReservationFunc: FunctionDeclaration = {
  name: "manage_reservation",
  description:
    "Gerencia reservas de mesas (checar disponibilidade, criar, cancelar, atualizar ou listar reservas do cliente).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: {
        type: Type.STRING,
        description: "Ação: 'CHECK_AVAILABILITY', 'CREATE', 'CANCEL', 'UPDATE' ou 'LIST_MY_RESERVATIONS'.",
      },
      date: {
        type: Type.STRING,
        description: "Data da reserva no formato YYYY-MM-DD (obrigatório para CHECK, CREATE, UPDATE).",
      },
      time: {
        type: Type.STRING,
        description: "Hora da reserva no formato HH:MM (obrigatório para CHECK, CREATE, UPDATE).",
      },
      party_size: {
        type: Type.NUMBER,
        description: "Número de pessoas (obrigatório para CHECK, CREATE, UPDATE).",
      },
      customer_name: {
        type: Type.STRING,
        description: "Nome do cliente (obrigatório para CREATE).",
      },
      reservation_id: {
        type: Type.STRING,
        description: "ID da reserva (obrigatório para CANCEL e UPDATE).",
      },
      notes: {
        type: Type.STRING,
        description: "Observações especiais (opcional).",
      },
    },
    required: ["action"],
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === "chefos_whatsapp_webhook_2024") {
      return res.status(200).send(challenge);
    }
    return res.status(403).end();
  }

  if (req.method === "POST") {
    try {
      const body = req.body;
      console.log("WhatsApp Webhook:", JSON.stringify(body));

      if (body.object !== "whatsapp_business_account") {
        return res.status(404).end();
      }

      const storeIdQuery = req.query.storeId as string | undefined;

      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (
            change.value &&
            change.value.messages &&
            change.value.messages[0]
          ) {
            await processMessage(change.value, storeIdQuery);
          }
        }
      }
      return res.status(200).send("EVENT_RECEIVED");
    } catch (error) {
      console.error("Webhook error:", error);
      // Don't fail the webhook processing itself for business logic errors
      return res.status(200).send("ERROR_HANDLED");
    }
  }

  return res.status(405).end();
}

async function processMessage(value: any, storeIdQuery?: string) {
  const message = value.messages[0];
  const customerPhone = message.from; // Sender ID
  let messageText = message.text?.body;
  const isAudio = message.type === "audio";

  // We can't return early if it's audio because we need the token first
  if (!messageText && !isAudio) return;

  const phoneNumberId = value.metadata.phone_number_id;

  // 1. Get configs
  let configQuery = supabase
    .from("whatsapp_configs")
    .select("store_id, access_token")
    .eq("is_active", true);

  if (storeIdQuery) {
    configQuery = configQuery.eq("store_id", storeIdQuery);
  } else {
    configQuery = configQuery.eq("phone_number_id", phoneNumberId);
  }

  const { data: config } = await configQuery.single();

  if (!config) {
    console.error(
      "No active WhatsApp config found for phone ID or store ID:",
      phoneNumberId,
      storeIdQuery,
    );
    return;
  }

  if (isAudio) {
    const audioId = message.audio.id;
    messageText = await transcribeWhatsAppAudio(audioId, config.access_token);
    if (!messageText) return; // Transcription failed or empty
  }

  const storeId = config.store_id;

  // 2. Fetch/Create Chat
  let { data: chat } = await supabase
    .from("whatsapp_chats")
    .select("*")
    .eq("store_id", storeId)
    .eq("customer_phone", customerPhone)
    .single();

  if (!chat) {
    // Find existing customer by phone or create new pseudo customer?
    let { data: customer } = await supabase
      .from("customers")
      .select("id")
      .eq("user_id", storeId)
      .eq("phone", customerPhone)
      .single();

    if (!customer) {
      const { data: newCustomer } = await supabase
        .from("customers")
        .insert({
          user_id: storeId,
          name: "Cliente WhatsApp",
          phone: customerPhone,
        })
        .select("id")
        .single();
      customer = newCustomer;
    }

    const { data: newChat, error: insertError } = await supabase
      .from("whatsapp_chats")
      .insert({
        store_id: storeId,
        customer_phone: customerPhone,
        customer_id: customer?.id || null,
        status: "bot",
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (insertError || !newChat) {
      console.error("Error creating chat:", insertError);
      return;
    }
    chat = newChat;
  } else {
    await supabase
      .from("whatsapp_chats")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", chat.id);
  }

  // 3. Save incoming message
  await supabase.from("whatsapp_messages").insert({
    chat_id: chat.id,
    wa_message_id: message.id,
    sender_type: "user",
    content: messageText,
  });

  // Handle Human Handoff Mode
  if (chat.status === "human") {
    // Just store the message, do not invoke AI
    console.log(`Chat ${chat.id} is in HUMAN mode. Skipping Gemini.`);
    return;
  }

  // 4. Load Restaurant Menu, History, and Customer Context
  const { data: menu } = await supabase
    .from("recipes")
    .select("id, name, price, description")
    .eq("user_id", storeId)
    .eq("is_available", true);

  const { data: history } = await supabase
    .from("whatsapp_messages")
    .select("sender_type, content, created_at")
    .eq("chat_id", chat.id)
    .order("created_at", { ascending: false })
    .limit(20);

  let customerContext = "";
  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("user_id", storeId)
    .eq("phone", customerPhone)
    .single();

  if (customer) {
    customerContext = `O cliente já está cadastrado.\nNome: ${customer.name}\nEndereço cadastrado: ${customer.address || "Não informado"}\nTelefone: ${customer.phone}\nPontos de Fidelidade: ${customer.loyalty_points || 0}\nTags/Anotações do cliente: ${customer.notes || "Nenhuma"}\n\nSe o cliente quiser entrega, confirme se é no endereço cadastrado. Pode sugerir que ele resgate pontos se tiver.`;

    const { data: pastOrders } = await supabase
      .from("orders")
      .select("notes, timestamp")
      .eq("customer_id", customer.id)
      .order("timestamp", { ascending: false })
      .limit(3);

    if (pastOrders && pastOrders.length > 0) {
      customerContext +=
        `\n\nÚltimos pedidos do cliente:\n` +
        pastOrders
          .map(
            (o: any) =>
              `- Pedido em ${new Date(o.timestamp).toLocaleDateString()}: ${o.notes || "Sem observações"}`,
          )
          .join("\n");
    }
  } else {
    customerContext = `Este é um cliente novo. Sem pontos de fidelidade.`;
  }

  const messageHistory = (history || []).reverse().map((msg: any) => {
    const date = new Date(msg.created_at);
    const timeStr = date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    return {
      role: msg.sender_type === "user" ? "user" : "model",
      parts: [{ text: `[${timeStr}] ${msg.content}` }],
    };
  });

  const contents = messageHistory;

  const systemInstruction = `Você é o Assistente Virtual e Garçom IA deste restaurante.
Regras de Negócio Importantes:
1. NÃO aceite alterações ou personalizações em pratos promocionais.
2. Sempre seja educado, direto e chame o cliente pelo primeiro nome.
3. Se o cliente solicitar modificações complexas ("meia", "sem cebola", "troco para 100"), entenda e anote no campo 'notes' da tool.
4. Faça sugestões contextuais (Upsell/Cross-sell) caso faça sentido (ex: "Quer adicionar fritas por mais R$ 10?").
5. Responda a dúvidas frequentes (FAQ): Aceitamos Cartão, Pix, VR, VA e Dinheiro. Somos Pet-Friendly. O horário é das 18h às 23h.
6. Se o cliente se mostrar irritado, frustrado ou pedir explicitamente para falar com um atendente, chame a tool "request_human_handoff".
7. IMPORTANTE: Nunca acione a tool "submit_public_order" para um pedido que já foi enviado/confirmado no histórico. Se o cliente iniciar uma nova conversa (ex: "Oi"), trate como um novo atendimento e NÃO reenvie itens do passado.
8. Se o cliente quiser reservar uma mesa, verifique a disponibilidade, confirme os detalhes e utilize a tool "manage_reservation" para criar ou gerenciar a reserva. O cliente também pode listar suas próprias reservas ou pedir para cancelar/alterar.
9. Este é o nosso cardápio de produtos disponíveis (NÃO invente itens):
${JSON.stringify(menu || [], null, 2)}

Contexto do Cliente:
${customerContext}

Seu objetivo:
Identificar o que o cliente quer (seja delivery, takeout ou reserva de mesa). 
- Para Pedidos: faça upsell leve e feche o pedido recolhendo Nome, Itens, Pagamento e Endereço/Retirada. Somente acione "submit_public_order" quando tiver tudo.
- Para Reservas de Mesa: obtenha Nome, Data (YYYY-MM-DD), Hora (HH:MM) e número de pessoas. Confirme a disponibilidade e só então efetive a reserva.`;

  const chatSession = ai.chats.create({
    model: "gemini-3.5-flash",
    config: {
      systemInstruction,
      tools: [
        { functionDeclarations: [submitOrderFunc, requestHumanHandoffFunc, manageReservationFunc] },
      ],
      temperature: 0.2,
    },
    history: contents.slice(0, -1), // All except the very last one
  });

  let response = await chatSession.sendMessage({
    message: contents[contents.length - 1]?.parts[0]?.text || "Hello",
  });

  let replyText = "";
  try {
    if (response.text) {
      replyText = response.text;
    }
  } catch (e) {
    // response.text can throw if there are no text parts
  }

  while (response.functionCalls && response.functionCalls.length > 0) {
    const functionResponses = [];

    for (const call of response.functionCalls) {
      if (call.name === "submit_public_order") {
        const args = call.args as any;
        try {
          await createOrder(storeId, args, chat.customer_id);
          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: { success: true, result: "Pedido criado com sucesso!" }
            }
          });
        } catch (e) {
          console.error("Error creating order from tool:", e);
          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: { success: false, error: "Erro interno ao criar pedido." }
            }
          });
        }
      } else if (call.name === "request_human_handoff") {
        await supabase
          .from("whatsapp_chats")
          .update({ status: "human" })
          .eq("id", chat.id);
        functionResponses.push({
          functionResponse: {
            name: call.name,
            response: { success: true, result: "Transferência para humano realizada." }
          }
        });
      } else if (call.name === "manage_reservation") {
        const args = call.args as any;
        try {
          const res = await handleReservation(storeId, customerPhone, args, chat.customer_id);
          functionResponses.push({ functionResponse: { name: call.name, response: res } });
        } catch (e: any) {
          console.error("Error managing reservation:", e);
          functionResponses.push({ functionResponse: { name: call.name, response: { success: false, error: e.message } } });
        }
      }
    }

    if (functionResponses.length > 0) {
      response = await chatSession.sendMessage({ message: functionResponses as any });
      try {
        if (response.text) {
          replyText = response.text;
        }
      } catch (e) {
        // Safe catch
      }
    } else {
      break;
    }
  }

  if (replyText) {
    // Send reply to WhatsApp
    await sendWhatsAppMessage(
      customerPhone,
      replyText,
      config.access_token,
      phoneNumberId,
    );

    // Save AI reply to DB
    await supabase.from("whatsapp_messages").insert({
      chat_id: chat.id,
      wa_message_id: "bot-" + uuidv4(),
      sender_type: "bot",
      content: replyText,
    });
  }
}

async function handleReservation(
  storeId: string,
  customerPhone: string,
  args: any,
  customerId: string | null
) {
  const { action, date, time, party_size, customer_name, reservation_id, notes } = args;

  if (action === "LIST_MY_RESERVATIONS") {
    let q = supabase.from("reservations").select("*").eq("user_id", storeId);
    if (customerId) {
      q = q.eq("customer_id", customerId);
    } else {
      q = q.eq("customer_phone", customerPhone);
    }
    const { data } = await q.order("reservation_time", { ascending: true });
    return { success: true, reservations: data || [] };
  }

  if (action === "CHECK_AVAILABILITY") {
    if (!date || !time || !party_size) {
      return { success: false, error: "date, time e party_size são obrigatórios." };
    }
    // Simplification: just return available and tell AI to confirm with user.
    return { success: true, available: true, message: "A princípio temos disponibilidade. O atendente pode confirmar posteriormente se precisar." };
  }

  if (action === "CREATE") {
    if (!date || !time || !party_size || !customer_name) {
      return { success: false, error: "date, time, party_size e customer_name são obrigatórios." };
    }
    const reservationTime = new Date(`${date}T${time}:00-03:00`);
    const { data, error } = await supabase.from("reservations").insert({
      user_id: storeId,
      customer_id: customerId,
      customer_phone: customerPhone,
      customer_name,
      party_size,
      reservation_time: reservationTime.toISOString(),
      status: "PENDING",
      notes: notes || null
    }).select().single();
    
    if (error) throw error;
    return { success: true, reservation: data };
  }

  if (action === "UPDATE") {
    if (!reservation_id) return { success: false, error: "reservation_id é obrigatório." };
    const updates: any = {};
    if (date && time) updates.reservation_time = new Date(`${date}T${time}:00-03:00`).toISOString();
    if (party_size) updates.party_size = party_size;
    if (notes) updates.notes = notes;

    const { data, error } = await supabase.from("reservations").update(updates).eq("id", reservation_id).eq("user_id", storeId).select().single();
    if (error) throw error;
    return { success: true, reservation: data };
  }

  if (action === "CANCEL") {
    if (!reservation_id) return { success: false, error: "reservation_id é obrigatório." };
    const { data, error } = await supabase.from("reservations").update({ status: "CANCELLED", cancellation_reason: notes || "Cancelado pelo cliente via WhatsApp" }).eq("id", reservation_id).eq("user_id", storeId).select().single();
    if (error) throw error;
    return { success: true, reservation: data };
  }

  return { success: false, error: "Ação inválida." };
}

async function createOrder(
  storeId: string,
  args: any,
  customerId: string | null,
) {
  const orderId = uuidv4();

  // Add extra order notes and tags
  let fullNotes = `Nome: ${args.customer_name || "Desconhecido"} | Pgto: ${args.payment_method || "Não inf."} | End: ${args.address || "Não inf."}`;
  if (args.notes) {
    fullNotes += `\nObs: ${args.notes}`;
  }

  if (
    customerId &&
    args.customer_tags &&
    Array.isArray(args.customer_tags) &&
    args.customer_tags.length > 0
  ) {
    // Fetch current customer notes
    const { data: c } = await supabase
      .from("customers")
      .select("notes")
      .eq("id", customerId)
      .single();
    let existingNotes = c?.notes || "";
    const tagsString = args.customer_tags
      .map((t: string) => `[${t}]`)
      .join(" ");

    // Append tags if not already there
    for (const t of args.customer_tags) {
      if (!existingNotes.includes(`[${t}]`)) {
        existingNotes += ` [${t}]`;
      }
    }
    await supabase
      .from("customers")
      .update({ notes: existingNotes.trim() })
      .eq("id", customerId);
  }

  const finalOrderData = {
    id: orderId,
    user_id: storeId,
    customer_id: customerId,
    status: "OPEN",
    order_type:
      args.address && args.address.toUpperCase().includes("TAKEOUT")
        ? "External-Pickup"
        : "External-Delivery",
    notes: fullNotes,
    ifood_display_id: Math.floor(1000 + Math.random() * 9000).toString(),
    ifood_order_id: `wa-${orderId}`,
    table_number: 0,
  };

  let orderItems = [];

  const { data: stations } = await supabase
    .from("stations")
    .select("id")
    .eq("user_id", storeId)
    .order("created_at", { ascending: true });
  let fallbackStationId = null;
  if (stations && stations.length > 0) {
    fallbackStationId = stations[0].id;
  }

  if (args.items && args.items.length > 0) {
    // Need to fetch original price
    const { data: recipes } = await supabase
      .from("recipes")
      .select("id, price, name")
      .in(
        "id",
        args.items.map((i: any) => i.recipe_id),
      );

    orderItems = args.items.map((item: any) => {
      const r = recipes?.find((x) => x.id === item.recipe_id);
      return {
        order_id: orderId,
        user_id: storeId,
        recipe_id: item.recipe_id,
        name: r ? r.name : "Unknown Item",
        quantity: item.quantity,
        price: r ? r.price : 0,
        original_price: r ? r.price : 0,
        notes: item.notes || "",
        status: "PENDENTE",
        status_timestamps: { PENDENTE: new Date().toISOString() },
        station_id: fallbackStationId,
      };
    });
  }

  const { error: orderError } = await supabase
    .from("orders")
    .insert(finalOrderData);

  if (orderError) {
    console.error("Order Insert Error:", orderError);
    throw orderError;
  }

  if (orderItems.length > 0) {
    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItems);
    if (itemsError) {
      console.error("Items Insert Error:", itemsError);
      throw itemsError;
    }
  }
}

async function sendWhatsAppMessage(
  to: string,
  body: string,
  token: string,
  phoneNumberId: string,
) {
  // Official WhatsApp Cloud API Call
  try {
    await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: { body },
      }),
    });
  } catch (e) {
    console.error("Error sending WA message", e);
  }
}

async function transcribeWhatsAppAudio(
  mediaId: string,
  accessToken: string,
): Promise<string | null> {
  try {
    const mediaRes = await fetch(
      `https://graph.facebook.com/v19.0/${mediaId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    const mediaData = await mediaRes.json();

    if (!mediaData.url) {
      console.error("Failed to get media URL:", mediaData);
      return null;
    }

    const audioRes = await fetch(mediaData.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const arrayBuffer = await audioRes.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = mediaData.mime_type || "audio/ogg";

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Você é um assistente de transcrição. Transcreva este áudio exatamente como foi dito. Se houver instruções de pedido, transcreva literalmente. Não adicione comentários, apenas o texto do áudio.",
            },
            { inlineData: { data: base64Audio, mimeType } },
          ],
        },
      ],
    });

    return response.text;
  } catch (e) {
    console.error("Error transcribing audio:", e);
    return null;
  }
}
