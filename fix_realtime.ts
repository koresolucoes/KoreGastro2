import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fix() {
  const { data, error } = await supabase.rpc('execute_sql', { sql: 'ALTER PUBLICATION supabase_realtime ADD TABLE notifications;' });
  console.log("RPC result:", { data, error });
}
fix();
