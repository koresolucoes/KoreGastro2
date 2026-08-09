import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[MercadoPago Webhook] Missing Supabase environment variables.');
}

const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseServiceKey || 'placeholder-key'
);

/**
 * Validates Mercado Pago HMAC-SHA256 x-signature header if secret is configured.
 */
function verifyMercadoPagoSignature(
  req: any,
  dataId: string,
  secret: string
): boolean {
  try {
    const xSignature = req.headers['x-signature'] || req.headers['X-Signature'];
    const xRequestId = req.headers['x-request-id'] || req.headers['X-Request-Id'] || req.headers['x-req-id'];

    if (!xSignature || !xRequestId) {
      return false;
    }

    const parts = String(xSignature).split(',');
    let ts = '';
    let hashV1 = '';

    for (const part of parts) {
      const [key, value] = part.split('=').map(s => s?.trim());
      if (key === 'ts') ts = value;
      if (key === 'v1') hashV1 = value;
    }

    if (!ts || !hashV1) {
      return false;
    }

    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const computedHash = crypto
      .createHmac('sha256', secret)
      .update(manifest)
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(computedHash), Buffer.from(hashV1));
  } catch (err) {
    console.error('[MercadoPago Webhook] Signature verification error:', err);
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-signature, x-req-id, x-request-id');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    return res.status(200).send('OK');
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const payload = req.body || {};
    
    // Extract payment resource ID
    const paymentId = 
      payload.data?.id || 
      payload.id || 
      req.query?.id || 
      req.query?.['data.id'];

    const action = payload.action || payload.type || '';
    const isPaymentEvent = 
      action.includes('payment') || 
      payload.type === 'payment' || 
      !!paymentId;

    if (!paymentId || !isPaymentEvent) {
      return res.status(200).json({ message: 'Ignored non-payment event' });
    }

    const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MERCADO_PAGO_ACCESS_TOKEN || '';
    if (!mpAccessToken) {
      console.error('[MercadoPago Webhook] MERCADOPAGO_ACCESS_TOKEN is missing in environment.');
      return res.status(500).json({ error: 'MercadoPago access token missing' });
    }

    // Webhook Signature Verification (if secret is configured)
    const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET || process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    if (webhookSecret) {
      const isValid = verifyMercadoPagoSignature(req, String(paymentId), webhookSecret);
      if (!isValid) {
        console.warn(`[MercadoPago Webhook] Signature verification failed for paymentId ${paymentId}`);
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
    } else {
      console.log(`[MercadoPago Webhook] MERCADOPAGO_WEBHOOK_SECRET not set. Using direct Mercado Pago API verification.`);
    }

    // Source of Truth: Fetch payment data directly from Mercado Pago API
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mpAccessToken}` }
    });

    if (!mpRes.ok) {
      const errText = await mpRes.text();
      console.error(`[MercadoPago Webhook] Failed to fetch payment ${paymentId} from Mercado Pago:`, errText);
      return res.status(400).json({ error: 'Failed to fetch payment details from provider', details: errText });
    }

    const paymentData = await mpRes.json();
    const userId = paymentData.external_reference;
    const mpStatus = paymentData.status; // 'approved', 'rejected', 'pending', etc.
    const isApproved = mpStatus === 'approved';

    // Validate external_reference (userId)
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      console.warn(`[MercadoPago Webhook] Payment ${paymentId} missing or invalid external_reference.`);
      return res.status(400).json({ error: 'Invalid or missing external_reference in payment' });
    }

    // Extract planId from items or metadata
    const planId = paymentData.additional_info?.items?.[0]?.id || paymentData.metadata?.plan_id;
    if (!planId) {
      console.warn(`[MercadoPago Webhook] Payment ${paymentId} missing planId in items or metadata.`);
      return res.status(400).json({ error: 'Missing planId in payment data' });
    }

    // Validate plan exists in database
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('*')
      .eq('id', planId)
      .maybeSingle();

    if (planError || !plan) {
      console.warn(`[MercadoPago Webhook] Plan ${planId} not found in database.`);
      return res.status(400).json({ error: 'Plan associated with payment does not exist' });
    }

    // Amount validation
    const transactionAmount = Number(paymentData.transaction_amount || 0);
    const planPrice = Number(plan.price || 0);
    if (isApproved && planPrice > 0 && transactionAmount < planPrice - 0.01) {
      console.warn(`[MercadoPago Webhook] Payment amount ${transactionAmount} is less than plan price ${planPrice}.`);
      return res.status(400).json({ error: 'Payment amount is less than expected plan price' });
    }

    // Idempotency check via subscription_invoices
    const { data: existingInvoice } = await supabase
      .from('subscription_invoices')
      .select('*')
      .eq('mp_payment_id', String(paymentId))
      .maybeSingle();

    if (existingInvoice && existingInvoice.status === mpStatus) {
      console.log(`[MercadoPago Webhook] Payment ${paymentId} with status ${mpStatus} already processed. Idempotent return.`);
      return res.status(200).json({ 
        message: 'Event already processed', 
        idempotent: true, 
        invoice_id: existingInvoice.id 
      });
    }

    // Find existing subscription for user
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    let targetSubscriptionId = existingSub?.id;

    if (isApproved) {
      // Calculate current_period_end safely
      let baseDate = new Date();
      if (existingSub?.current_period_end && new Date(existingSub.current_period_end) > new Date() && !existingInvoice) {
        baseDate = new Date(existingSub.current_period_end);
      }
      const newPeriodEnd = new Date(baseDate);
      newPeriodEnd.setDate(newPeriodEnd.getDate() + 30); // 1 month extension

      const subPayload: any = {
        user_id: userId,
        plan_id: plan.id,
        status: 'active',
        current_period_end: newPeriodEnd.toISOString(),
        mercado_pago_subscription_id: String(paymentId),
        updated_at: new Date().toISOString()
      };

      if (existingSub) {
        subPayload.id = existingSub.id;
      }

      // Upsert subscription preserving UNIQUE(user_id)
      const { data: subData, error: subError } = await supabase
        .from('subscriptions')
        .upsert(subPayload, { onConflict: 'user_id' })
        .select('id')
        .single();

      if (subError) {
        console.error('[MercadoPago Webhook] Subscription persistence error:', subError);
        return res.status(500).json({ error: 'Failed to persist subscription', details: subError.message });
      }

      targetSubscriptionId = subData.id;
    } else if (existingSub && (mpStatus === 'rejected' || mpStatus === 'cancelled')) {
      console.log(`[MercadoPago Webhook] Payment ${paymentId} failed with status ${mpStatus} for user ${userId}.`);
    }

    // Persist/Update Invoice in subscription_invoices
    if (targetSubscriptionId) {
      const invoicePayload: any = {
        user_id: userId,
        subscription_id: targetSubscriptionId,
        mp_payment_id: String(paymentId),
        mp_preapproval_id: paymentData.preapproval_id || null,
        amount: transactionAmount,
        status: mpStatus,
        payment_method_id: paymentData.payment_method_id || null,
        payment_type_id: paymentData.payment_type_id || null,
        invoice_url: paymentData.transaction_details?.external_resource_url || null,
        paid_at: isApproved ? (paymentData.date_approved || new Date().toISOString()) : null,
        created_at: existingInvoice?.created_at || new Date().toISOString()
      };

      if (existingInvoice) {
        invoicePayload.id = existingInvoice.id;
      }

      const { error: invError } = await supabase
        .from('subscription_invoices')
        .upsert(invoicePayload);

      if (invError) {
        console.error('[MercadoPago Webhook] Invoice persistence error:', invError);
        return res.status(500).json({ error: 'Failed to persist subscription invoice', details: invError.message });
      }
    }

    console.log(`[MercadoPago Webhook] Payment ${paymentId} successfully processed for user ${userId}. Status: ${mpStatus}`);
    return res.status(200).json({
      message: 'Payment processed successfully',
      status: mpStatus,
      userId,
      planId: plan.id,
      paymentId: String(paymentId)
    });

  } catch (error: any) {
    console.error('[MercadoPago Webhook] Unhandled exception:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}
