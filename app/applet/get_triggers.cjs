const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const url = process.env.VITE_SUPABASE_URL || '';
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(url, key);

async function check() {
    const { data: data1, error: err1 } = await supabase.rpc('exec_sql', { sql: "SELECT proname, prosrc FROM pg_proc WHERE prosrc ILIKE '%FRAUDE%';" });
    console.log(JSON.stringify(data1, null, 2));
}
check();
