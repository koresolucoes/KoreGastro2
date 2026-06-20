import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);

async function run() {
  const { data: subs } = await supabase.from('subscriptions').select('*');
  console.log("Subscriptions:");
  console.dir(subs, { depth: null });
}
run();
