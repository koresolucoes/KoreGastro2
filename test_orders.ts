import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_ANON_KEY as string);

async function check() {
  const { data: order, error } = await supabase.from('orders').select('*').eq('session_token', 'af5990a6-432e-4545-879e-68d258bb66f7').single();
  console.log("Error:", error);
  console.log("Order fetched via anon:", order);
}
check();
