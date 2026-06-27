import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[MercadoPago Webhook] Missing Supabase environment variables.');
}

const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-key'
);

export default async function handler(request: VercelRequest, response: VercelResponse) {
  // CORS configuration
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-signature, x-request-id');

  if (request.method === 'OPTIONS') {
    return response.status(204).end();
  }

  // Allow GET for ping/validation 
  if (request.method === 'GET') {
    return response.status(200).send('OK');
  }

  if (request.method !== 'POST') {
    return response.status(405).send({ error: 'Method Not Allowed' });
  }

  try {
    const payload = request.body || {};
    console.log('[MercadoPago Webhook] Payload received:', JSON.stringify(payload));
    
    const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MERCADO_PAGO_ACCESS_TOKEN || '';
    if (!mpAccessToken) {
       console.warn('[MercadoPago Webhook] MERCADOPAGO_ACCESS_TOKEN is missing. Cannot fetch full resource data.');
    }

    if (payload.action === 'payment.updated' || payload.action === 'payment.created' || payload.type === 'payment') {
      const paymentId = payload.data?.id;
      if (paymentId && mpAccessToken) {
         try {
           const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
             headers: { Authorization: `Bearer ${mpAccessToken}` }
           });
           
           if (paymentRes.ok) {
             const paymentData = await paymentRes.json();
             // Get user context from external_reference
             const userId = paymentData.external_reference;
             const isApproved = paymentData.status === 'approved';
             
             if (userId && isApproved) {
               // Get what plan they bought from the items array
               const planId = paymentData.additional_info?.items?.[0]?.id;
               if (planId) {
                  // Upsert subscription logic
                  console.log(`[MercadoPago Webhook] Payment approved! Activating plan ${planId} for user ${userId}.`);
                  
                  const endPeriod = new Date();
                  endPeriod.setMonth(endPeriod.getMonth() + 1); // simplistic 1-month logic for basic preference
                  
                  // Invalidate other active subscriptions
                  await supabase.from('subscriptions').update({ status: 'canceled' }).eq('user_id', userId);
                  
                  // Insert newly approved subscription
                  const { error: subError } = await supabase.from('subscriptions').insert({
                     user_id: userId,
                     plan_id: planId,
                     status: 'active',
                     current_period_end: endPeriod.toISOString(),
                     mercado_pago_subscription_id: paymentId, // just linking payment ref
                  });
                  
                  if (subError) console.error('[MercadoPago Webhook] DB Error:', subError);
               }
             }
           }
         } catch (e) {
           console.error('[MercadoPago Webhook] Failed to process payment API fetch:', e);
         }
      }
    } 

    return response.status(200).send({ message: 'Success' });
  } catch (error: any) {
    console.error('[MercadoPago Webhook] Error:', error);
    return response.status(500).send({ error: 'Internal Server Error' });
  }
}

