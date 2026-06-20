import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);

async function run() {
  const { data: plans, error } = await supabase.from('plans').select('id, name, features:plan_features(permission_key)').eq('id', '2ba3e223-b3f6-482f-bea3-44b629acabb8');
  console.dir({plans, error}, { depth: null });
}
run();
