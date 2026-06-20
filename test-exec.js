import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(url, key);

async function test() {
    const { data, error } = await supabase.rpc('exec_sql', { sql: `
    SELECT
        c.conname AS constraint_name,
        n.nspname AS schema_name,
        cl.relname AS table_name,
        pg_get_constraintdef(c.oid) AS constraint_def
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_class foreign_cl ON foreign_cl.oid = c.confrelid
    WHERE c.contype = 'f'
      AND foreign_cl.relname = 'stores'
      AND NOT (pg_get_constraintdef(c.oid) ILIKE '%ON DELETE CASCADE%');
` });

    console.log('Result:', data);
    console.log('Error:', error);
}
test();
