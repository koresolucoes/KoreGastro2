import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.example' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const sql = `
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE proname IN (
      SELECT tgfoid::regproc::text 
      FROM pg_trigger 
      WHERE tgrelid = 'public.order_items'::regclass
    )
  `;

  const { data, error } = await supabase.rpc('exec_sql', { sql });
  console.log('Error:', error);
  console.log('Data:', data);
}

run();
