import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
    console.log('Adding prep_time_in_minutes to recipe_preparations...');
    
    // Using an RPC call if they have one, or trying to do it directly usually isn't possible from client.
    // However, if we just execute a query via postgres rest? No, supabase JS doesn't do DDL.
    // Let's check if there is an rpc 'exec_sql'.
    const { data: rpcSchema, error: rpcError } = await supabase.rpc('exec_sql', { sql: 'ALTER TABLE recipe_preparations ADD COLUMN IF NOT EXISTS prep_time_in_minutes NUMERIC;' });
    
    if (rpcError) {
        console.error('Error with exec_sql RPC:', rpcError);
        console.log('We might not have exec_sql. In AI Studio, the DB migrations are usually applied via a script or by the user.');
    } else {
        console.log('Successfully added prep_time_in_minutes via exec_sql!');
    }
}

run();
