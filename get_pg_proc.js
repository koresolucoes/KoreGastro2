const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function run() {
  const config = JSON.parse(fs.readFileSync('./src/supabase-config.json', 'utf8'));
  const supabase = createClient(config.supabaseUrl, config.supabaseKey);

  // We only have anon key. Can't read pg_proc.
  console.log('Cant do that from client');
}
run();
