import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
}

const supabaseAdmin = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseServiceKey || 'placeholder-key', 
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user || !user.email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: adminData, error: adminError } = await supabaseAdmin
      .from('system_admins')
      .select('email')
      .eq('email', user.email)
      .single();

    if (adminError || !adminData) {
      return res.status(403).json({ error: 'Forbidden: User is not a system admin' });
    }

    const { ticket_id, text, status_update } = req.body;
    if (!ticket_id || !text) {
        return res.status(400).json({ error: 'ticket_id and text are required' });
    }

    const { data: message, error: msgError } = await supabaseAdmin
        .from('support_ticket_messages')
        .insert([{
            ticket_id,
            sender_id: user.id,
            sender_type: 'admin',
            text
        }])
        .select()
        .single();
        
    if (msgError) {
         if (msgError.code === '42P01') { // table does not exist
             return res.status(400).json({ error: 'Tables not created yet' });
         }
         throw msgError;
    }

    if (status_update) {
        await supabaseAdmin
            .from('support_tickets')
            .update({ status: status_update, updated_at: new Date().toISOString() })
            .eq('id', ticket_id);
    }

    return res.status(201).json({ data: message });
  } catch (error: any) {
    console.error('Error in support messages endpoint:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
