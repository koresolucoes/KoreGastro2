import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data, error } = await supabase.from('time_clock_entries').select('*').limit(1);
  console.log('Columns time_clock_entries:', data && data[0] ? Object.keys(data[0]) : (error || 'no data'));
}
main();
