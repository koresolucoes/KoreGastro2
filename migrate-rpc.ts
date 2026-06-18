import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);

async function run() {
  const sql = fs.readFileSync('fix_public_table_rpc2.sql', 'utf8');
  const { data, error } = await supabase.rpc('exec_sql', { sql });
  console.log("exec_sql result:", data, error);
}
run();
