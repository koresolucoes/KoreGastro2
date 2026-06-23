import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
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
    "Submit a complete food order for delivery or takeout. Use ONLY when the user has finished choosing all items, selected a payment method, and provided a valid delivery address or takeout choice.",
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  try {
    if (!process.env.GEMINI_API_KEY && !process.env.VITE_GEMINI_API_KEY) {
      return res
        .status(200)
        .json({
          reply:
            "[Configuração Pendente] A chave da API do Gemini (GEMINI_API_KEY) não está configurada no servidor. Por favor, adicione-a no painel lateral de configurações.",
        });
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const { storeId, messageText, history = [] } = req.body;

    if (!storeId || !messageText) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    // Load Restaurant Menu
    const { data: menu } = await supabase
      .from("recipes")
      .select("id, name, price, description")
      .eq("user_id", storeId)
      .eq("is_available", true);

    const systemInstruction = `Você é o Assistente Virtual e Garçom IA deste restaurante.
Regras de Negócio Importantes:
1. NÃO aceite alterações ou personalizações em pratos promocionais.
2. Sempre seja educado, direto e chame o cliente pelo primeiro nome.
3. Se o cliente solicitar modificações complexas ("meia", "sem cebola", "troco para 100"), entenda e anote no campo 'notes' da tool.
4. Faça sugestões contextuais (Upsell/Cross-sell) caso faça sentido (ex: "Quer adicionar fritas por mais R$ 10?").
5. Responda a dúvidas frequentes (FAQ): Aceitamos Cartão, Pix, VR, VA e Dinheiro. Somos Pet-Friendly. O horário é das 18h às 23h.
6. Se o cliente se mostrar irritado, frustrado ou pedir explicitamente para falar com um atendente, chame a tool "request_human_handoff".
7. Este é o nosso cardápio de produtos disponíveis (NÃO invente itens):
${JSON.stringify(menu || [], null, 2)}

Seu objetivo:
Identificar o que o cliente quer, fazer upsell leve e fechar o pedido recolhendo:
- Nome do cliente
- Os itens solicitados
- O meio de pagamento (e troco se aplicável)
- O Endereço COMPLETO ou Retirada.

APENAS QUANDO e SOMENTE QUANDO tiver tudo, acione "submit_public_order" para fechar o pedido.`;

    // history format provided by client: [{ role: 'user' | 'model', text: string }]
    const contents = history.map((msg: any) => ({
      role: msg.role === "model" ? "model" : "user",
      parts: [{ text: msg.text }],
    }));

    const chatSession = ai.chats.create({
      model: "gemini-3.5-flash",
      config: {
        systemInstruction,
        tools: [
          { functionDeclarations: [submitOrderFunc, requestHumanHandoffFunc] },
        ],
        temperature: 0.2,
      },
      history: contents,
    });

    const response = await chatSession.sendMessage({ message: messageText });

    // Handle Function Call from AI
    const functionCalls = response.functionCalls;
    let replyText = response.text || "";

    if (functionCalls && functionCalls.length > 0) {
      for (const call of functionCalls) {
        if (call.name === "submit_public_order") {
          const args = call.args as any;
          // Create test order in Supabase
          try {
            await createOrder(storeId, args);
            replyText = `Ótimo! Seu pedido foi enviado para a cozinha com sucesso. Vamos preparar rapidinho! [PEDIDO DE TESTE CRIADO NO PAINEL]`;
          } catch (e) {
            console.error("Error creating order from tool:", e);
            replyText = "Houve um erro interno ao lançar seu pedido de teste.";
          }
        } else if (call.name === "request_human_handoff") {
          console.log("Test Chat Handoff Requested");
          replyText =
            replyText ||
            "Entendi. Aguarde um momento, vou transferir você para um de nossos atendentes. [SIMULAÇÃO DE TRANSBORDO]";
        }
      }
    }

    return res.status(200).json({ reply: replyText });
  } catch (error: any) {
    console.error("Test chat error:", error);

    let fallbackReply = "Desculpe, ocorreu um erro interno no backend.";
    if (error.message && error.message.includes("API key not valid")) {
      fallbackReply =
        "A chave de API do Gemini configurada é inválida (GEMINI_API_KEY). Por favor, corrija-a nas variáveis de ambiente.";
    }

    return res
      .status(200)
      .json({ reply: `[Erro do Sistema] ${fallbackReply}` });
  }
}

async function createOrder(storeId: string, args: any) {
  const orderId = uuidv4();

  let fullNotes = `[TESTE IA] Nome: ${args.customer_name || "Desconhecido"} | Pgto: ${args.payment_method || "Não inf."} | End: ${args.address || "Não inf."}`;
  if (args.notes) fullNotes += `\nObs: ${args.notes}`;
  if (args.customer_tags && args.customer_tags.length > 0)
    fullNotes += `\nTags Identificadas: ${args.customer_tags.join(", ")}`;

  const finalOrderData = {
    id: orderId,
    user_id: storeId,
    status: "OPEN",
    order_type:
      args.address && args.address.toUpperCase().includes("TAKEOUT")
        ? "External-Pickup"
        : "External-Delivery",
    notes: fullNotes,
    ifood_display_id: Math.floor(1000 + Math.random() * 9000).toString(),
    ifood_order_id: `test-ia-${orderId}`,
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
