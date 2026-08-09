import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as crypto from "crypto";
import { z } from "zod";
dotenv.config();

function extractToken(req: any): string | null {
  const queryToken = req.query?.token;
  if (queryToken && typeof queryToken === "string" && queryToken.trim()) return queryToken.trim();
  const bodyToken = req.body?.token || req.body?.session_token || req.body?.sessionToken;
  if (bodyToken && typeof bodyToken === "string" && bodyToken.trim()) return bodyToken.trim();
  const authHeader = req.headers?.authorization;
  if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) return authHeader.substring(7).trim();
  return null;
}

const CreateOrderSchema = z.object({
  orderData: z.object({
    user_id: z.string().uuid(),
    table_number: z.number().int().optional().nullable(),
    order_type: z.string().optional(),
    customer_id: z.string().uuid().optional().nullable(),
  }),
  items: z.array(z.object({
    recipe_id: z.string().uuid(),
    quantity: z.number().positive(),
    notes: z.string().optional()
  }))
});

export default async function handler(req: any, res: any) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: "Server misconfiguration: Missing Supabase credentials" });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    if (req.method === "GET") {
      const token = extractToken(req);
      if (!token) return res.status(400).json({ error: "Missing token" });
      const { data: order, error } = await supabase.from("orders").select("*, order_items(*, recipes(*))").eq("session_token", token).single();
      if (error || !order) return res.status(404).json({ error: "Pedido não encontrado ou sessão inválida" });
      if (order.table_number && order.user_id) {
        try {
          await supabase.from("tables").update({ status: "OCUPADA" }).eq("number", order.table_number).eq("user_id", order.user_id);
        } catch (e) {}
      }
      return res.status(200).json({ order });
    }

    if (req.method === "POST") {
      const { create, updates, insertItems, orderId } = req.body || {};

      if (create) {
        const parsed = CreateOrderSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: "Invalid payload", details: parsed.error });
        
        const { orderData, items } = parsed.data;
        
        // Use RPC to securely create order with items to avoid price manipulation and mass assignment
        // The RPC will correctly pull prices from the backend
        const { data: newOrder, error: rpcError } = await supabase.rpc("create_order_with_items", {
           p_restaurant_id: orderData.user_id,
           p_order_data: orderData,
           p_items: items,
           p_idempotency_key: crypto.randomUUID()
        });

        if (rpcError) {
          console.error("RPC Error:", rpcError);
          return res.status(400).json({ error: "Erro ao criar pedido" });
        }
        
        // Since we are bypassing standard insertion, set session token manually on the created order
        const sessionToken = crypto.randomUUID();
        await supabase.from("orders").update({ session_token: sessionToken }).eq("id", newOrder.id);
        newOrder.session_token = sessionToken;

        return res.status(201).json({ success: true, order: newOrder });
      }

      const token = extractToken(req);
      if (!token) return res.status(401).json({ error: "Sessão não informada ou inválida" });

      const { data: sessionOrder, error: sessionError } = await supabase.from("orders").select("*").eq("session_token", token).single();
      if (sessionError || !sessionOrder) return res.status(403).json({ error: "Pedido não autorizado" });

      if (orderId && orderId !== sessionOrder.id) return res.status(403).json({ error: "IDOR_DETECTED" });

      if (insertItems && Array.isArray(insertItems)) {
        // Implement insertion logic using backend prices
        // Since we removed raw item insertion to prevent price manipulation
        return res.status(403).json({ error: "Adição direta de itens não suportada por esta rota" });
      }

      if (!updates) return res.status(400).json({ error: "Missing updates" });

      if (updates.action === "GENERATE_PIX") {
         // Recalculate amount on backend
         const { data: oiData } = await supabase.from("order_items").select("quantity, price").eq("order_id", sessionOrder.id).neq("status", "CANCELADO");
         let total = 0;
         if (oiData) oiData.forEach(item => total += item.price * item.quantity);
         
         const { data: creds } = await supabase.from("store_integration_credentials").select("mp_access_token").eq("store_id", sessionOrder.user_id).single();
         const mpToken = creds?.mp_access_token || process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MERCADO_PAGO_ACCESS_TOKEN;
         if (!mpToken) return res.status(400).json({ error: "Mercado Pago não configurado" });

         if (total <= 0) return res.status(400).json({ error: "Valor inválido" });

         const fetchRes = await fetch("https://api.mercadopago.com/v1/payments", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${mpToken}`,
              "X-Idempotency-Key": `${sessionOrder.id}-${Date.now()}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              transaction_amount: total,
              description: `Pedido ${sessionOrder.id.substring(0, 8).toUpperCase()}`,
              payment_method_id: "pix",
              payer: { email: "cliente@email.com" },
            }),
         });
         const data = await fetchRes.json();
         if (!fetchRes.ok) throw new Error(data.message || "Erro MP");
         return res.status(200).json({ success: true, qr_code: data.point_of_interaction?.transaction_data?.qr_code, qr_code_base64: data.point_of_interaction?.transaction_data?.qr_code_base64, payment_id: data.id });
      }

      if (updates.action === "FINALIZE" || updates.action === "APPLY_DISCOUNT") {
         return res.status(403).json({ error: "Ações gerenciais não permitidas no endpoint público" });
      }

      const allowedUpdates: any = {};
      if (updates.customer_name !== undefined) allowedUpdates.customer_name = updates.customer_name;
      if (updates.notes !== undefined) allowedUpdates.notes = updates.notes;

      if (Object.keys(allowedUpdates).length === 0) return res.status(400).json({ error: "No valid updates" });

      const { data, error } = await supabase.from("orders").update(allowedUpdates).eq("id", sessionOrder.id).select().single();
      if (error) throw error;
      
      return res.status(200).json({ order: data });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Internal error" });
  }
}
