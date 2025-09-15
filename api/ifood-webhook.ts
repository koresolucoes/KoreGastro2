import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

import { getIFoodOrderDetails } from './ifood-webhook-lib/ifood-api.js';
import { getRawBody, verifySignature, getOrderIdFromPayload } from './ifood-webhook-lib/ifood-utils.js';
import { logWebhookEvent, updateLogStatus, findUserByMerchantId, processPlacedOrder, cancelOrderInDb, confirmOrderInDb, dispatchOrderInDb, concludeOrderInDb } from './ifood-webhook-lib/db-helpers.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    return response.status(405).send({ error: 'Method Not Allowed' });
  }

  const ifoodSecret = process.env.IFOOD_CLIENT_SECRET;
  if (!ifoodSecret) {
    console.error('IFOOD_CLIENT_SECRET is not set.');
    return response.status(500).send({ error: 'Server configuration error.' });
  }
  
  let logId: string | null = null;
  const rawBody = await getRawBody(request);
  let payload: any;

  try {
    payload = JSON.parse(rawBody.toString('utf-8'));
    // Use the helper for logging, as it's not critical path for API calls
    const orderIdForLogging = getOrderIdFromPayload(payload);
    logId = await logWebhookEvent(supabase, payload, orderIdForLogging);

    const signature = request.headers['x-ifood-signature'] as string;
    if (!verifySignature(signature, rawBody, ifoodSecret)) {
      console.warn('Invalid signature received.');
      if (logId) await updateLogStatus(supabase, logId, 'ERROR_INVALID_SIGNATURE');
      return response.status(401).send({ error: 'Invalid signature.' });
    }
    
    const eventCode = payload.fullCode || payload.code;
    if (eventCode === 'KEEPALIVE') {
      if (logId) await updateLogStatus(supabase, logId, 'SUCCESS_KEEPALIVE');
      return response.status(202).send({ message: 'Accepted' });
    }

    const merchantId = payload.merchant?.id || payload.merchantId;
    if (!merchantId) {
       if (logId) await updateLogStatus(supabase, logId, 'ERROR_NO_MERCHANT_ID');
       return response.status(400).send({ error: 'Merchant ID missing.' });
    }

    const userId = await findUserByMerchantId(supabase, merchantId);
    if (!userId) {
        if (logId) await updateLogStatus(supabase, logId, 'ERROR_MERCHANT_NOT_FOUND', `Merchant ID ${merchantId} not found.`);
        return response.status(404).send({ error: 'Merchant not found' });
    }
    if(logId) await updateLogStatus(supabase, logId, 'PROCESSING', undefined, undefined, userId);
    
    // --- Event Routing ---
    if (eventCode === 'PLACED') {
      let fullOrderPayload = payload;
      // If it's a minimal notification (no items), we need to fetch the full details.
      if (!payload.items) {
          const orderIdToFetch = payload.orderId;
          if (!orderIdToFetch || typeof orderIdToFetch !== 'string') {
              throw new Error("PLACED event is missing a valid 'orderId'.");
          }
          
          try {
              fullOrderPayload = await getIFoodOrderDetails(orderIdToFetch);
              if (logId) await updateLogStatus(supabase, logId, 'FETCHED_DETAILS', undefined, fullOrderPayload);
          } catch (fetchError: any) {
              if (logId) await updateLogStatus(supabase, logId, 'ERROR_FETCH_DETAILS', fetchError.message);
              // Acknowledge receipt even if fetch fails, as per iFood docs, to avoid retries.
              return response.status(202).send({ message: 'Accepted, but failed to fetch details.' });
          }
      }
      // processPlacedOrder is smart enough to handle the full payload (fetched or original).
      await processPlacedOrder(supabase, userId, fullOrderPayload, logId);
      if (logId) await updateLogStatus(supabase, logId, 'SUCCESS_CREATED');
    
    } else if (eventCode === 'CONFIRMED') {
      const orderIdToConfirm = getOrderIdFromPayload(payload);
      if (!orderIdToConfirm) throw new Error("CONFIRMED event is missing a valid 'orderId'.");
      await confirmOrderInDb(supabase, orderIdToConfirm);
      if (logId) await updateLogStatus(supabase, logId, 'SUCCESS_CONFIRMED');

    } else if (eventCode === 'DISPATCHED' || eventCode === 'READY_FOR_PICKUP') {
      const orderIdToDispatch = getOrderIdFromPayload(payload);
      if (!orderIdToDispatch) throw new Error("DISPATCHED/READY_FOR_PICKUP event is missing a valid 'orderId'.");
      await dispatchOrderInDb(supabase, orderIdToDispatch);
      if (logId) await updateLogStatus(supabase, logId, `SUCCESS_${eventCode}`);

    } else if (eventCode === 'CONCLUDED') {
      const orderIdToConclude = getOrderIdFromPayload(payload);
      if (!orderIdToConclude) throw new Error("CONCLUDED event is missing a valid 'orderId'.");
      await concludeOrderInDb(supabase, orderIdToConclude);
      if (logId) await updateLogStatus(supabase, logId, 'SUCCESS_CONCLUDED');
    
    } else if (eventCode === 'CANCELLED') {
        const orderIdToCancel = payload.orderId;
        if (!orderIdToCancel || typeof orderIdToCancel !== 'string') {
          throw new Error("CANCELLED event is missing a valid 'orderId'.");
        }
        await cancelOrderInDb(supabase, orderIdToCancel);
        if (logId) await updateLogStatus(supabase, logId, 'SUCCESS_CANCELLED');
    
    } else {
        // For other events we don't handle explicitly
        if (logId) await updateLogStatus(supabase, logId, 'SUCCESS_UNHANDLED_EVENT');
    }

    return response.status(202).send({ message: 'Event received successfully.' });

  } catch (error: any) {
    console.error('Error processing webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (logId) await updateLogStatus(supabase, logId, 'ERROR_FATAL', errorMessage);
    
    if (error instanceof SyntaxError) {
        return response.status(400).send({ error: 'Invalid JSON payload.' });
    }
    return response.status(500).send({ error: 'Internal Server Error' });
  }
}