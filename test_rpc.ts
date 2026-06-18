import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);

async function run() {
  const { data, error } = await supabase.rpc('update_table_order', { 
    p_order_id: 'd13f6483-c574-492e-a118-b0f3b73f493c', 
    p_customer_name: null,
    p_notes: 'TEST'
  });
  console.log(data, error);
}
run();
