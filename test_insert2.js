import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://illjaoognbolqzneguqf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function test() {
  const { data, error } = await supabase
    .from('orders')
    .insert({
      table_number: 0,
      customer_name: "Test",
      order_type: 'QuickSale',
      status: 'OPEN',
      notes: "Test"
    })
    .select()
    .single();

  console.log('Without user_id:', error);
}
test();
