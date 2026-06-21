import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);

async function run() {
  const { data: q1, error: e1 } = await supabase.from('plan_features').select('*').limit(1);
  const { data: q2, error: e2 } = await supabase.from('plan_permissions').select('*').limit(1);
  console.dir({ q1, e1, q2, e2 }, { depth: null });
}
run();
