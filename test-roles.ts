import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);

async function run() {
  const { data: stores } = await supabase.from('stores').select('id, name, owner_id');
  console.log("Stores:", stores);

  const { data: roles } = await supabase.from('roles').select('id, name, user_id');
  console.log("Roles count:", roles?.length);

  const { data: perms } = await supabase.from('role_permissions').select('role_id, user_id, permission_key');
  console.log("Perms total:", perms?.length);
  const storesIds = stores?.map(s => s.id) || [];
  for (const sId of storesIds) {
      const p = perms?.filter(x => x.user_id === sId) || [];
      console.log("Store:", sId, "Permissions count:", p.length);
  }
}
run();
