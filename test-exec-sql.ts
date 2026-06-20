import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);

async function run() {
  const sql = `SELECT 1;`;
  const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql });
  if (error) {
    const { data: d2, error: e2 } = await supabase.rpc('exec_sql', { sql });
    console.log("fallback", d2, e2);
  } else {
    console.log("exec_sql result:", data, error);
  }
}
run();
