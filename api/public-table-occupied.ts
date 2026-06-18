import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

export default async function handler(req: any, res: any) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !supabaseKey) { return res.status(500).json({ error: 'Server misconfiguration' }); }
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const token = req.query.token;
    if (!token) return res.status(400).json({ error: 'Missing token' });

    const { data: order, error } = await supabase
      .from('orders')
      .select('table_number, user_id')
      .eq('session_token', token)
      .single();
    
    if (error) throw error;

    if (order && order.table_number && order.user_id) {
       await supabase.from('tables')
         .update({ status: 'OCUPADA' })
         .eq('number', order.table_number)
         .eq('user_id', order.user_id);
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
