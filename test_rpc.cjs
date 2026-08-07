const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://x.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'x';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.rpc('adjust_stock_by_lot', {
      p_ingredient_id: '123',
      p_quantity_change: 0,
      p_reason: 'test',
      p_user_id: '123'
  });
  console.log(error);
}
run();
