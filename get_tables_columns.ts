import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    // try to fetch one table
    const { data, error } = await supabase.from('tables').select('*').limit(1);
    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Data columns:", data && data.length > 0 ? Object.keys(data[0]) : "No tables found");
    }
}
main();
