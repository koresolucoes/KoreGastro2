import { supabase } from './src/services/supabase-client.ts';

async function run() {
  const { data: cols, error: err } = await supabase
    .from('company_profile' as any)
    .select('*')
    .limit(1);
  console.log("Cols:", cols);
  console.log("Err:", err);
}
run();
