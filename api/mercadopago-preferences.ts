import type { VercelRequest, VercelResponse } from '@vercel/node';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { createClient } from '@supabase/supabase-js';

const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MERCADO_PAGO_ACCESS_TOKEN || '';

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    return response.status(405).send({ error: 'Method Not Allowed' });
  }

  if (!mpAccessToken) {
    return response.status(500).send({ error: 'MercadoPago access token is missing in .env.' });
  }

  try {
    const { planId, planName, price, userEmail, userId } = request.body;

    const client = new MercadoPagoConfig({ accessToken: mpAccessToken });
    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: [
          {
            id: planId,
            title: planName,
            quantity: 1,
            unit_price: Number(price),
            currency_id: 'BRL',
          }
        ],
        payer: {
          email: userEmail,
        },
        external_reference: userId, // associate preference with the Supabase user
        back_urls: {
          success: 'https://app.chefos.online/settings/billing', // Redirect here upon success
          failure: 'https://app.chefos.online/settings/billing',
          pending: 'https://app.chefos.online/settings/billing'
        },
        auto_return: 'approved',
      }
    });

    return response.status(200).send({ id: result.id, init_point: result.init_point });
  } catch (error: any) {
    console.error('[MercadoPago API]', error);
    return response.status(500).send({ error: 'Internal Server Error', details: error.message });
  }
}
