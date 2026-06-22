import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Missing credentials' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const sql = `
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE prosrc ILIKE '%detectada%' OR prosrc ILIKE '%Tentativa de injeção%';
  `;

  const { data, error } = await supabase.rpc('exec_sql', { sql });
  
  if (error) {
     return res.status(500).json({ success: false, error });
  }

  return res.status(200).json({ success: true, data });
}
