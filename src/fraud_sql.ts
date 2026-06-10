import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function test() {
  const { data, error } = await supabase.rpc('exec_sql', { sql: "SELECT proname, prosrc FROM pg_proc WHERE prosrc ILIKE '%FRAUDE%';" });
  console.log('Result:', error, data);
}
test();
