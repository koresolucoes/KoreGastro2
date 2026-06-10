import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function test() {
  const { data, error } = await supabase.rpc('exec_sql', { sql: "SELECT trigger_name, event_object_table, action_statement FROM information_schema.triggers WHERE event_object_table = 'order_items';" });
  console.log('Result:', error, data);
}
test();
