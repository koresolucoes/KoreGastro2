const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('./src/supabase-config.json', 'utf8'));
const supabase = createClient(config.supabaseUrl, config.supabaseKey);

async function run() {
  const { data, error } = await supabase.rpc('get_function_def', {});
  // Cannot call internal Postgres functions easily.
  // Instead, maybe query from an existing view?
}
run();
