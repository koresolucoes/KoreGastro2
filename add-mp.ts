import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL as string;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const supabase = createClient(url, key);

async function run() {
    const sql = `
        ALTER TABLE company_profiles
        ADD COLUMN IF NOT EXISTS mp_access_token TEXT,
        ADD COLUMN IF NOT EXISTS mp_public_key TEXT;
    `;
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    console.log("Migration result:", data, error);
}

run();
