import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);

async function check() {
  const { data: menuItems } = await supabase.from('menu_items').select('id, user_id, is_active');
  console.log("Items user_id:", menuItems);
}
check();