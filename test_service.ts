import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);

async function check() {
  const { data: order, error } = await supabase
    .from('orders')
    .select('*, order_items(*, recipes(*))')
    .eq('session_token', 'baeaa559-1212-4b7a-a32c-dd0fb946a0a9');
  console.log("order:", order, "error:", error);
}
check();
