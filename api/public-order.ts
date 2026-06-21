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
      return res.status(200).json({ order: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('public-order API error:', error);
    return res.status(400).json({ error: error.message || 'Internal error' });
  }
}
