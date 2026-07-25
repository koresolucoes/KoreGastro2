import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.from('pg_policies').select('*').eq('tablename', 'support_tickets');
  console.log("Error:", error);
  console.log("Policies:", data);
}
check();
