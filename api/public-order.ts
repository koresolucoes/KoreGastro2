import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as crypto from "crypto";
dotenv.config();

function extractToken(req: any): string | null {
  const queryToken = req.query?.token;
  if (queryToken && typeof queryToken === "string" && queryToken.trim()) {
    return queryToken.trim();
  }

  const bodyToken =
    req.body?.token || req.body?.session_token || req.body?.sessionToken;
  if (bodyToken && typeof bodyToken === "string" && bodyToken.trim()) {
    return bodyToken.trim();
  }

  const authHeader = req.headers?.authorization;
  if (
    authHeader &&
    typeof authHeader === "string" &&
    authHeader.startsWith("Bearer ")
  ) {
    return authHeader.substring(7).trim();
  }

  return null;
}

export default async function handler(req: any, res: any) {
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!supabaseUrl || !supabaseKey) {
    return res
      .status(500)
      .json({ error: "Server misconfiguration: Missing Supabase credentials" });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    if (req.method === "GET") {
      const token = extractToken(req);
      if (!token) return res.status(400).json({ error: "Missing token" });

      const { data: order, error } = await supabase
        .from("orders")
        .select("*, order_items(*, recipes(*))")
        .eq("session_token", token)
        .single();

      if (error || !order) {
        return res
          .status(404)
          .json({ error: "Pedido não encontrado ou sessão inválida" });
      }

      // Update table to occupied
      if (order.table_number && order.user_id) {
        try {
          await supabase
            .from("tables")
            .update({ status: "OCUPADA" })
            .eq("number", order.table_number)
            .eq("user_id", order.user_id);
        } catch (e) {}
      }

      return res.status(200).json({ order });
    }

    if (req.method === "POST") {
      const { orderId, updates, create, orderData, items, insertItems } =
        req.body || {};

      // Creation of new online delivery orders
      if (create) {
        if (!orderData || !items)
          return res.status(400).json({ error: "Missing orderData or items" });

        const sanitizedOrderData = {
          ...orderData,
          status: orderData.status || "PENDENTE",
          session_token: orderData.session_token || crypto.randomUUID(),
        };

        const { data: orderResponse, error: orderError } = await supabase
          .from("orders")
          .insert(sanitizedOrderData)
          .select("*")
          .single();

        if (orderError || !orderResponse) {
          return res.status(400).json({ error: "Erro ao criar pedido" });
        }

        if (items && items.length > 0) {
          const sanitizedItems = items.map((item: any) => ({
            ...item,
            order_id: orderResponse.id,
            user_id: orderResponse.user_id,
          }));

          const { error: itemsError } = await supabase
            .from("order_items")
            .insert(sanitizedItems);

          if (itemsError) {
            return res
              .status(400)
              .json({ error: "Erro ao inserir itens no pedido criado" });
          }
        }

        return res.status(201).json({ success: true, order: orderResponse });
      }

      // ALL OTHER POST OPERATIONS REQUIRE VALID SESSION TOKEN
      const token = extractToken(req);
      if (!token) {
        return res
          .status(401)
          .json({ error: "Sessão não informada ou inválida" });
      }

      // Resolve session token to authorized order
      const { data: sessionOrder, error: sessionError } = await supabase
        .from("orders")
        .select("*")
        .eq("session_token", token)
        .single();

      if (sessionError || !sessionOrder) {
        return res
          .status(403)
          .json({ error: "Pedido não encontrado ou sessão não autorizada" });
      }

      // IDOR protection: if orderId is supplied in body, it must match sessionOrder.id
      if (orderId && orderId !== sessionOrder.id) {
        return res
          .status(403)
          .json({ error: "Operação não autorizada para este pedido" });
      }

      // 1) Insert items into authorized order
      if (insertItems && Array.isArray(insertItems) && insertItems.length > 0) {
        const sanitizedInsertItems = insertItems.map((item: any) => {
          if (item.order_id && item.order_id !== sessionOrder.id) {
            throw new Error("IDOR_DETECTED");
          }
          return {
            ...item,
            order_id: sessionOrder.id,
            user_id: sessionOrder.user_id,
          };
        });

        const { error: itemsError } = await supabase
          .from("order_items")
          .insert(sanitizedInsertItems);

        if (itemsError) {
          return res
            .status(400)
            .json({ error: "Erro ao adicionar itens ao pedido" });
        }

        return res
          .status(201)
          .json({ success: true, message: "Items inserted" });
      }

      if (!updates) {
        return res.status(400).json({ error: "Missing updates or action" });
      }

      // 2) GENERATE_PIX for authorized order
      if (updates.action === "GENERATE_PIX") {
        const { amount } = updates;

        if (!amount || typeof amount !== "number" || amount <= 0) {
          return res.status(400).json({ error: "Valor inválido para o PIX" });
        }

        const { data: creds } = await supabase
          .from("store_integration_credentials")
          .select("mp_access_token")
          .eq("store_id", sessionOrder.user_id)
          .single();

        const mpToken =
          creds?.mp_access_token ||
          process.env.MERCADOPAGO_ACCESS_TOKEN ||
          process.env.MERCADO_PAGO_ACCESS_TOKEN;

        if (!mpToken) {
          return res.status(400).json({
            error:
              "Mercado Pago não configurado para esta loja. Entre em contato com o restaurante.",
          });
        }

        const applicationFee = 1.0;

        const fetchRes = await fetch(
          "https://api.mercadopago.com/v1/payments",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${mpToken}`,
              "X-Idempotency-Key": `${sessionOrder.id}-${Date.now()}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              transaction_amount: amount,
              description: `Pedido ${sessionOrder.id.substring(0, 8).toUpperCase()}`,
              payment_method_id: "pix",
              application_fee: applicationFee,
              payer: {
                email: "cliente@email.com",
              },
            }),
          },
        );

        const data = await fetchRes.json();
        if (!fetchRes.ok) {
          throw new Error(data.message || "Erro ao gerar PIX no Mercado Pago");
        }

        return res.status(200).json({
          success: true,
          qr_code: data.point_of_interaction?.transaction_data?.qr_code,
          qr_code_base64:
            data.point_of_interaction?.transaction_data?.qr_code_base64,
          payment_id: data.id,
        });
      }

      // 3) FINALIZE authorized order
      if (updates.action === "FINALIZE") {
        const { payments, tipAmount } = updates;

        let tableId = null;
        if (sessionOrder.table_number) {
          const { data: tableData } = await supabase
            .from("tables")
            .select("id")
            .eq("number", sessionOrder.table_number)
            .eq("user_id", sessionOrder.user_id)
            .single();

          if (tableData) {
            tableId = tableData.id;

            const { count } = await supabase
              .from("orders")
              .select("*", { count: "exact", head: true })
              .eq("table_number", sessionOrder.table_number)
              .eq("user_id", sessionOrder.user_id)
              .neq("id", sessionOrder.id)
              .in("status", ["OPEN", "PAYING"]);

            if (count && count > 0) {
              tableId = null;
            }
          }
        }

        const { error: rpcError } = await supabase.rpc(
          "finalize_order_transaction",
          {
            p_order_id: sessionOrder.id,
            p_user_id: sessionOrder.user_id,
            p_table_id: tableId,
            p_payments: payments || [],
            p_closed_by_employee_id: null,
            p_tip_amount: tipAmount || 0,
          },
        );

        if (rpcError) throw rpcError;

        return res.status(200).json({ success: true });
      }

      // 4) APPLY DISCOUNT on authorized order
      if (updates.action === "APPLY_DISCOUNT") {
        const { discountType, discountValue } = updates;

        const { error } = await supabase
          .from("orders")
          .update({
            discount_type: discountType,
            discount_value: discountValue,
          })
          .eq("id", sessionOrder.id);

        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      // 5) Standard updates (customer_name, notes)
      const allowedUpdates: any = {};
      if (updates.customer_name !== undefined)
        allowedUpdates.customer_name = updates.customer_name;
      if (updates.notes !== undefined) allowedUpdates.notes = updates.notes;

      if (Object.keys(allowedUpdates).length === 0)
        return res.status(400).json({ error: "No valid updates" });

      const { data, error } = await supabase
        .from("orders")
        .update(allowedUpdates)
        .eq("id", sessionOrder.id)
        .select()
        .single();

      if (error) throw error;

      if (
        allowedUpdates.notes &&
        allowedUpdates.notes.includes("[SOLICITOU FECHAMENTO DE CONTA]") &&
        sessionOrder.table_number &&
        sessionOrder.user_id
      ) {
        await supabase
          .from("tables")
          .update({ status: "PAGANDO" })
          .eq("number", sessionOrder.table_number)
          .eq("user_id", sessionOrder.user_id);
      }

      return res.status(200).json({ order: data });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error: any) {
    if (error?.message === "IDOR_DETECTED") {
      return res
        .status(403)
        .json({ error: "Operação não autorizada para este pedido" });
    }
    console.error(
      "public-order API error:",
      error?.message || "Internal error",
    );
    return res.status(400).json({ error: error?.message || "Internal error" });
  }
}
