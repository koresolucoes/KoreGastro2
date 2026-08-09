import type { VercelRequest, VercelResponse } from '@vercel/node';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { createClient } from '@supabase/supabase-js';

const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MERCADO_PAGO_ACCESS_TOKEN || '';
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-key'
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!mpAccessToken) {
    return res.status(500).json({ error: 'MercadoPago access token is missing in environment variables.' });
  }

  try {
    const { planId, planName, price, userEmail, userId } = req.body || {};

    if (!planId || !userId) {
      return res.status(400).json({ error: 'Missing required fields: planId and userId are required.' });
    }

    // Verify plan exists in database
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('*')
      .eq('id', planId)
      .maybeSingle();

    if (planError || !plan) {
      return res.status(400).json({ error: `Plan with ID ${planId} does not exist.` });
    }

    const client = new MercadoPagoConfig({ accessToken: mpAccessToken });
    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: [
          {
            id: plan.id,
            title: plan.name || planName || 'Assinatura ChefOS',
            quantity: 1,
            unit_price: Number(plan.price || price),
            currency_id: 'BRL',
          }
        ],
        payer: {
          email: userEmail,
        },
        external_reference: userId, // associate preference with the Supabase user
        back_urls: {
          success: 'https://app.chefos.online/settings/billing',
          failure: 'https://app.chefos.online/settings/billing',
          pending: 'https://app.chefos.online/settings/billing'
        },
        auto_return: 'approved',
      }
    });

    return res.status(200).json({ id: result.id, init_point: result.init_point });
  } catch (error: any) {
    console.error('[MercadoPago Preference API Error]', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
