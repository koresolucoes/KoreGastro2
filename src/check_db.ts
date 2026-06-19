import * as dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

async function check() {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(url, key);
    
    // Add permission to all roles so the user can see it regardless
    const { data: roles } = await supabase.from('roles').select('id, name');
    if (roles && roles.length) {
       for (const role of roles) {
           await supabase.from('role_permissions').upsert({
               role_id: role.id,
               permission_key: '/whatsapp-chats'
           });
       }
    }
    
    const { data: plans } = await supabase.from('plans').select('id');
    if (plans && plans.length) {
       for (const plan of plans) {
           await supabase.from('plan_permissions').upsert({
               plan_id: plan.id,
               permission_key: '/whatsapp-chats'
           });
       }
    }
    console.log("Permissions added to all roles and plans.");
}
check();


