import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

export default async function handler(req: any, res: any) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server misconfiguration: Missing Supabase credentials' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    if (req.method === 'GET') {
      const token = req.query.token;
      if (!token) return res.status(400).json({ error: 'Missing token' });

      const { data: order, error } = await supabase
        .from('orders')
        .select('*, order_items(*, recipes(*))')
        .eq('session_token', token)
        .single();
      
      if (error) throw error;

      // Update table to occupied
      if (order && order.table_number && order.user_id) {
         try {
            await supabase.from('tables')
              .update({ status: 'OCUPADA' })
              .eq('number', order.table_number)
              .eq('user_id', order.user_id);
         } catch(e) {}
      }

      return res.status(200).json({ order });
    }
    
    if (req.method === 'POST') {
      const { orderId, updates, create, orderData, items, insertItems } = req.body || {};
      
      if (insertItems && insertItems.length > 0) {
         const { error: itemsError } = await supabase
             .from('order_items')
             .insert(insertItems);
         if (itemsError) throw itemsError;
         return res.status(201).json({ success: true, message: 'Items inserted' });
      }

      if (create) {
         // Logic for AI/Webhook to create order hitting this endpoint
         if (!orderData || !items) return res.status(400).json({ error: 'Missing orderData or items' });
         
         const { data: orderResponse, error: orderError } = await supabase
             .from('orders')
             .insert(orderData)
             .select('*')
             .single();
         if (orderError) throw orderError;

         if (items.length > 0) {
             const { error: itemsError } = await supabase
                 .from('order_items')
                 .insert(items);
             if (itemsError) throw itemsError;
         }
         
         return res.status(201).json({ success: true, order: orderResponse });
      }

      if (!orderId || !updates) return res.status(400).json({ error: 'Missing orderId or updates' });

      // Handle checkout/finalize
      if (updates.action === 'FINALIZE') {
          const { payments, tipAmount, total } = updates;
          
          // Get order
          const { data: order, error: orderError } = await supabase.from('orders').select('*').eq('id', orderId).single();
          if (orderError) throw orderError;
          
          // Call finalize_order_transaction RPC
          const { data: rpcResult, error: rpcError } = await supabase.rpc('finalize_order_transaction', {
              p_order_id: orderId,
              p_user_id: order.user_id,
              p_table_id: null, // we can leave table handling to the rpc if we don't have table_id, wait, the order has table_number, but to get table_id we'd need to query tables.
              p_payments: payments,
              p_closed_by_employee_id: null,
              p_tip_amount: tipAmount
          });

          if (rpcError) throw rpcError;
          
          // Also set table to LIVRE if we know it
          if (order.table_number) {
             await supabase.from('tables')
              .update({ status: 'LIVRE', employee_id: null, customer_count: 0 })
              .eq('number', order.table_number)
              .eq('user_id', order.user_id);
          }

          return res.status(200).json({ success: true });
      }

      // Handle discount
      if (updates.action === 'APPLY_DISCOUNT') {
          const { discountType, discountValue } = updates;
          const { error } = await supabase.from('orders')
              .update({ discount_type: discountType, discount_value: discountValue })
              .eq('id', orderId);
          if (error) throw error;
          return res.status(200).json({ success: true });
      }

      // Only allow safe updates like notes, customer_name from public checkout
      const allowedUpdates: any = {};
      if (updates.customer_name !== undefined) allowedUpdates.customer_name = updates.customer_name;
      if (updates.notes !== undefined) allowedUpdates.notes = updates.notes;

      if (Object.keys(allowedUpdates).length === 0) return res.status(400).json({ error: 'No valid updates' });

      const { data, error } = await supabase
        .from('orders')
        .update(allowedUpdates)
        .eq('id', orderId)
        .select()
        .single();

      if (error) throw error;

      // Update table status if requesting bill
      if (allowedUpdates.notes && allowedUpdates.notes.includes('[SOLICITOU FECHAMENTO DE CONTA]') && data && data.table_number && data.user_id) {
         await supabase.from('tables')
             .update({ status: 'PAGANDO' })
             .eq('number', data.table_number)
             .eq('user_id', data.user_id);
      }

      return res.status(200).json({ order: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('public-order API error:', error);
    return res.status(400).json({ error: error.message || 'Internal error' });
  }
}
