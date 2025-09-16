import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendIFoodOrderAction, sendIFoodLogisticsAction } from './ifood-webhook-lib/ifood-api.js';

export default async function handler(request: VercelRequest, response: VercelResponse) {
  // Set CORS headers for all responses
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS request
  if (request.method === 'OPTIONS') {
    return response.status(204).end();
  }

  if (request.method !== 'POST') {
    return response.status(405).send({ message: 'Only POST requests are allowed' });
  }
  
  console.log('[Proxy] Received iFood action request from frontend.');

  try {
    const { action, orderId, details, isLogistics } = request.body;

    if (!action || !orderId) {
      return response.status(400).json({ message: 'Missing "action" or "orderId" in request body' });
    }
    
    if (isLogistics) {
      console.log(`[Proxy] Forwarding LOGISTICS action '${action}' for order '${orderId}' to iFood API.`);
      await sendIFoodLogisticsAction(orderId, action, details);
      console.log(`[Proxy] Logistics action for order '${orderId}' processed successfully.`);
      return response.status(202).json({ message: 'Logistics action processed successfully by iFood.' });
    }

    // --- Original Order Status Logic ---
    let apiAction: 'confirm' | 'dispatch' | 'readyToPickup' | 'requestCancellation' | null = null;
    let body: any = null;

    switch (action) {
      case 'confirm':
        apiAction = 'confirm';
        break;
      case 'dispatch':
        apiAction = 'dispatch';
        break;
      case 'readyToPickup':
        apiAction = 'readyToPickup';
        break;
      case 'cancel':
        apiAction = 'requestCancellation';
        body = {
          reason: details?.reason || 'CANCELAMENTO SOLICITADO PELO RESTAURANTE',
          cancellationCode: details?.code || '501'
        };
        break;
      default:
        return response.status(400).json({ message: `Invalid action provided: ${action}` });
    }
    
    if (!apiAction) {
       return response.status(400).json({ message: `Action '${action}' could not be mapped.` });
    }

    console.log(`[Proxy] Forwarding action '${apiAction}' for order '${orderId}' to iFood API.`);
    await sendIFoodOrderAction(orderId, apiAction, body);
    
    // Most iFood order actions return 202 Accepted with no body.
    console.log(`[Proxy] Action for order '${orderId}' processed successfully.`);
    return response.status(202).json({ message: 'Action processed successfully by iFood.' });

  } catch (error: any) {
    console.error('[Proxy] Error processing request:', error);
    // Try to parse iFood error message if it exists
    const errorMessage = error.message.includes('iFood API error:') 
      ? error.message 
      : 'An internal server error occurred.';
    return response.status(500).json({ message: errorMessage });
  }
}