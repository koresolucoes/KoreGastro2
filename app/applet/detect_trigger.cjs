const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const url = process.env.VITE_SUPABASE_URL || '';
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(url, key);

async function check() {
    console.log("Detecting fraud trigger...");
    const { data: q1, error: eq1 } = await supabase.rpc('exec_sql', { sql: "SELECT trigger_name, event_object_table FROM information_schema.triggers" });
    if (q1) {
        console.log("Triggers:", q1.filter(t => t.trigger_name.toLowerCase().includes('fraud') || t.trigger_name.toLowerCase().includes('price') || t.trigger_name.toLowerCase().includes('valida')));
    }
}
check();
