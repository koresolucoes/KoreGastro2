import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.from('whatsapp_chats').insert({
      store_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', // Dummy uuid
      customer_phone: '5511999999999',
      status: 'active',
  }).select();
  console.log("ERROR:", error);
}
test();
