import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '');

async function run() {
    const { data: recipes } = await supabase.from('recipes').select('*').limit(1);
    const recipe = recipes[0];
    
    // Test secondary insertion with 100% discount
    const { data, error } = await supabase.from('order_items').insert({
        order_id: '123e4567-e89b-12d3-a456-426614174000', // Need a valid order ID? We can fetch one.
    });
}
run();
