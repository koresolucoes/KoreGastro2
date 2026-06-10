import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '');
async function run() {
    const { data, error } = await supabase.rpc('exec_sql', { sql: "SELECT proname, prosrc FROM pg_proc WHERE prosrc ILIKE '%inexistent%';" });
    console.log(data, error);
}
run();
