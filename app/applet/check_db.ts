import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL || '';
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(url, key);

async function check() {
    const { data: data1, error: err1 } = await supabase.rpc('exec_sql', { sql: "SELECT proname, prosrc FROM pg_proc WHERE prosrc ILIKE '%FRAUDE%';" });
    console.log('Result 1:', data1, err1);

    const { data: data2, error: err2 } = await supabase.rpc('exec_sql', { sql: "SELECT statement FROM pg_policies WHERE statement ILIKE '%FRAUDE%';" });
    console.log('Result 2:', data2, err2);
    
    // Sometimes there are no easy exec_sql functions. Let's see if we can just trigger it and view the error text if we couldn't get it
}
check();
