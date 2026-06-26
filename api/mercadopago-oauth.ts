import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MP_CLIENT_ID = process.env.MERCADO_PAGO_CLIENT_ID!;
const MP_CLIENT_SECRET = process.env.MERCADO_PAGO_CLIENT_SECRET!;
const REDIRECT_URI = process.env.VITE_PUBLIC_URL ? `${process.env.VITE_PUBLIC_URL}/api/mercadopago-oauth` : 'http://localhost:3000/api/mercadopago-oauth';

export default async function (req: Request, res: Response) {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.status(400).send('Missing code or state parameter.');
  }

  // The state parameter should ideally be the user_id (the active unit / store id)
  const userId = state as string;

  try {
    const response = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        client_id: MP_CLIENT_ID,
        client_secret: MP_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: REDIRECT_URI
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Mercado Pago OAuth error:', data);
      return res.status(400).send(`Error authenticating with Mercado Pago: ${data.message || 'Unknown error'}`);
    }

    const { access_token, refresh_token, public_key, user_id: mp_user_id } = data;

    // Update the company_profile in the database with these tokens
    const { error: dbError } = await supabase
      .from('company_profile')
      .update({
        mp_access_token: access_token,
        mp_refresh_token: refresh_token,
        mp_public_key: public_key,
        mp_user_id: mp_user_id
      })
      .eq('user_id', userId);

    if (dbError) {
      console.error('Database error updating tokens:', dbError);
      return res.status(500).send('Error saving Mercado Pago credentials.');
    }

    // Redirect the user back to the settings page with a success message
    res.redirect('/settings?tab=pagamentos&mp_success=true');

  } catch (error: any) {
    console.error('Error in MP OAuth callback:', error);
    res.status(500).send('Internal Server Error.');
  }
}
