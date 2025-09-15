
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getIFoodAccessToken } from './ifood-webhook-lib/ifood-api';

const iFoodApiBaseUrl = 'https://merchant-api.ifood.com.br';

/**
 * This handler acts as a secure proxy for iFood API actions initiated from the frontend.
 * It receives an action from the client, authenticates with iFood on the server-side
 * using environment variables, and forwards the request to the appropriate iFood endpoint.
 * This avoids exposing client secrets and bypasses browser CORS restrictions.
 */
export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    return response.status(405).send({ message: 'Only POST requests are allowed' });
  }

  try {
    const { action, orderId, details } = request.body;

    if (!action || !orderId) {
      return response.status(400).json({ message: 'Missing "action" or "orderId" in request body' });
    }

    const accessToken = await getIFoodAccessToken();

    let endpoint = '';
    let body: any = null;
    const method = 'POST';

    switch (action) {
      case 'confirm':
        endpoint = `/order/v1.0/orders/${orderId}/confirm`;
        break;
      case 'dispatch':
        endpoint = `/order/v1.0/orders/${orderId}/dispatch`;
        break;
      case 'readyToPickup':
        endpoint = `/order/v1.0/orders/${orderId}/readyToPickup`;
        break;
      case 'cancel':
        endpoint = `/order/v1.0/orders/${orderId}/requestCancellation`;
        body = {
          reason: details?.reason || 'CANCELAMENTO SOLICITADO PELO RESTAURANTE',
          cancellationCode: details?.code || '501'
        };
        break;
      default:
        return response.status(400).json({ message: `Invalid action provided: ${action}` });
    }

    const iFoodResponse = await fetch(`${iFoodApiBaseUrl}${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : null
    });

    if (!iFoodResponse.ok) {
      const errorBodyText = await iFoodResponse.text();
      console.error(`iFood API Error (${iFoodResponse.status}) for action '${action}' on order '${orderId}':`, errorBodyText);
      // Forward the error from iFood to the frontend
      return response.status(iFoodResponse.status).json({ message: `iFood API error: ${errorBodyText}` });
    }

    // iFood often returns 202 Accepted. Forward the status.
    return response.status(iFoodResponse.status).json({ message: 'Action processed successfully by iFood.' });

  } catch (error: any) {
    console.error('[IFOOD_PROXY_ERROR]', error);
    return response.status(500).json({ message: error.message || 'An internal server error occurred.' });
  }
}
