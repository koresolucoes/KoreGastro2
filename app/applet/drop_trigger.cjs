import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL || '';
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(url, key);

async function check() {
    console.log("Removing fraud trigger if it exists...");
    
    // We can query pg_trigger to find it and drop it.
    const { data: d1, error: e1 } = await supabase.rpc('exec_sql', { 
        sql: `
        DO $$
        DECLARE
            trig record;
        BEGIN
            FOR trig IN 
                SELECT trigger_name, event_object_table as table_name
                FROM information_schema.triggers 
                WHERE trigger_name ILIKE '%fraud%' OR trigger_name ILIKE '%price%' OR trigger_name ILIKE '%valida%'
            LOOP
                EXECUTE 'DROP TRIGGER IF EXISTS ' || trig.trigger_name || ' ON ' || trig.table_name || ' CASCADE';
            END LOOP;
        END $$;
        `
    });
    console.log("Drops:", d1, e1);
}
check();
