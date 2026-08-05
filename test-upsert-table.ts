import { config } from 'dotenv';
config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function run() {
    const { data: user } = await supabase.auth.signInWithPassword({
        email: 'koresoluciones@gmail.com', // wait, let's just insert with service role key if available? No, anon key is fine. Wait, RLS might block anon key.
    });
    console.log(user);
}
run();
