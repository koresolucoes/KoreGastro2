import * as dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

fetch(`${url}/rest/v1/?apikey=${key}`)
  .then(res => res.json())
  .then(data => {
    console.log(JSON.stringify(data.definitions.whatsapp_chats, null, 2));
  })
  .catch(console.error);
