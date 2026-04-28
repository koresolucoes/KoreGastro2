import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://illjaoognbolqzneguqf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function test() {
  const { data, error } = await supabase
    .from('modifier_groups')
    .select('*')
    .limit(1);

  console.log('modifier_groups:', error, data);
}
test();
