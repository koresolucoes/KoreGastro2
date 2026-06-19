import * as dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

async function check() {
    const spec = await fetch(`${url}/rest/v1/`, { headers: { 'apiKey': key } });
    const json = await spec.json();
    console.log(Object.keys(json.definitions.whatsapp_messages.properties));
}
check();
