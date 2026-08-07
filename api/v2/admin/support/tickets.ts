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

    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('support_tickets')
        .select(`
          *,
          messages:support_ticket_messages(*)
        `)
        .order('created_at', { ascending: false });

      if (error) {
         if (error.code === '42P01') { // table does not exist
             return res.status(200).json({ data: [] });
         }
         throw error;
      }
      
      // We need to fetch the client names
      const authUserIds = data.map((t: any) => t.client_id).filter((v: any, i: any, a: any) => a.indexOf(v) === i);
      let usersMap = new Map();
      if (authUserIds.length > 0) {
          const { data: authList, error: authListError } = await supabaseAdmin.auth.admin.listUsers();
          const users = authList?.users as any[];
          if (!authListError && users) {
              const profilesResult = await supabaseAdmin.from('profiles').select('id, full_name').in('id', authUserIds);
              const profiles = profilesResult.data || [];
              const profileMap = new Map(profiles.map((p: any) => [p.id, p]));
              users.forEach(u => {
                  usersMap.set(u.id, profileMap.get(u.id)?.full_name || u.user_metadata?.full_name || u.email);
              });
          }
      }

      const formattedData = data.map((t: any) => ({
          ...t,
          client_name: usersMap.get(t.client_id) || 'Cliente',
          messages: (t.messages || []).map((m: any) => ({
             sender: m.sender_type,
             text: m.text,
             time: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          })).sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      }));

      return res.status(200).json({ data: formattedData });
    } else if (req.method === 'POST') {
      const { client_id, store_name, subject, priority, messages } = req.body;

      const { data: ticket, error: ticketError } = await supabaseAdmin
        .from('support_tickets')
        .insert([{
          client_id,
          store_name: store_name || 'Geral',
          subject,
          priority: priority || 'Média',
          status: 'open'
        }])
        .select()
        .single();

      if (ticketError) {
         if (ticketError.code === '42P01') { // table does not exist
             return res.status(400).json({ error: 'Tables not created yet' });
         }
         throw ticketError;
      }

      if (messages && messages.length > 0) {
        const messageInserts = messages.map((m: any) => ({
           ticket_id: ticket.id,
           sender_id: user.id, // admin
           sender_type: 'admin',
           text: m.text
        }));
        await supabaseAdmin.from('support_ticket_messages').insert(messageInserts);
      }

      return res.status(201).json({ data: ticket });
    } else if (req.method === 'PUT') {
       const { id, updates } = req.body;
       const { data, error } = await supabaseAdmin
         .from('support_tickets')
         .update({ ...updates, updated_at: new Date().toISOString() })
         .eq('id', id)
         .select()
         .single();
       if (error) throw error;
       return res.status(200).json({ data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Error in support tickets endpoint:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
