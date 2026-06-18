import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_ANON_KEY as string);

async function check() {
  const { data, error } = await supabase.from('orders').update({ notes: 'test anon' }).eq('id', 'ab7dfe8a-cc59-403b-a935-ec9d51c5b13a').select();
  console.log("verify update:", data, error);
}
check();
