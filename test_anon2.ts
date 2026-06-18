import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_ANON_KEY as string);

async function check() {
  const { data, error } = await supabase.from('orders').select('session_token').limit(20);
  console.log(data);
}
check();
