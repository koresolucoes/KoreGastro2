import { createClient } from '@supabase/supabase-js';
import { environment } from './src/config/environment';

const supabase = createClient(environment.supabaseUrl, environment.supabaseAnonKey);

async function test() {
  const { data, error } = await supabase.from('tables').select('*').limit(1);
  console.log("Existing columns:", Object.keys(data?.[0] || {}));
  
  if (data && data.length > 0) {
    const testTable = { ...data[0], seats: 4 };
    const { error: upsertError } = await supabase.from('tables').upsert([testTable]);
    if (upsertError) console.error("Upsert error:", upsertError);
    else console.log("Upsert with seats SUCCESS");
  }
}
test();
