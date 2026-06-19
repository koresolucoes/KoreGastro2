import * as dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

async function check() {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(url, key);
    
    // Find Gerente role
    const { data: roles } = await supabase.from('roles').select('id, name').eq('name', 'Gerente').limit(1);
    if (roles && roles.length) {
       for (const role of roles) {
           await supabase.from('role_permissions').upsert({
               role_id: role.id,
               permission_key: '/whatsapp-chats'
           });
       }
    }
}
check();
