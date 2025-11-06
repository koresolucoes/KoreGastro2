const iFoodApiBaseUrl = process.env.IFOOD_API_URL || 'https://merchant-api.ifood.com.br';

let cachedToken: { accessToken: string; expiresAt: number; } | null = null;

/**
 * Handles the OAuth flow and makes a signed request to the iFood Merchant API.
 * This is the central function for all outgoing iFood API calls.
 */
async function makeIFoodApiCall(endpoint: string, method: 'GET' | 'POST' = 'GET', body: any = null, options: { isImageRequest?: boolean } = {}) {
  console.log(`[iFood API] Initiating call to endpoint: ${endpoint}`);

  const clientId = process.env.IFOOD_CLIENT_ID;
  const clientSecret = process.env.IFOOD_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('[iFood API] CRITICAL: iFood environment variables not set.');
    throw new Error('Server configuration error: iFood credentials missing.');
  }

  // 1. Get Access Token (with Caching)
  const now = Date.now();
  let accessToken: string;

  // Use token if it exists and is not expired (with a 60-second buffer for safety)
  if (cachedToken && cachedToken.expiresAt > now + 60000) {
    console.log('[iFood API] Using cached access token.');
    accessToken = cachedToken.accessToken;
  } else {
    console.log('[iFood API] Requesting new access token...');
    const tokenParams = new URLSearchParams({
      grantType: 'client_credentials',
      clientId: clientId,
      clientSecret: clientSecret,
    });

    const tokenResponse = await fetch(`${iFoodApiBaseUrl}/authentication/v1.0/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams,
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[iFood API] Failed to get access token:', errorText);
      throw new Error(`iFood authentication failed: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    accessToken = tokenData.accessToken;

    // `expiresIn` is in seconds. Convert to a future timestamp in milliseconds.
    const expiresAt = now + (tokenData.expiresIn * 1000);
    cachedToken = { accessToken, expiresAt };
    console.log('[iFood API] New access token received and cached successfully.');
  }

  // 2. Make the authenticated API call
  const fullUrl = `${iFoodApiBaseUrl}${endpoint}`;
  console.log(`[iFood API] Making ${method} request to ${fullUrl}`);

  const apiResponse = await fetch(fullUrl, {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : null,
  });

  if (!apiResponse.ok) {
    const errorText = await apiResponse.text();
    console.error(`[iFood API] API call to ${endpoint} failed with status ${apiResponse.status}:`, errorText);
    throw new Error(`iFood API error (${apiResponse.status}): ${errorText}`);
  }

  console.log(`[iFood API] Call to ${endpoint} successful with status ${apiResponse.status}.`);
  
  if (options.isImageRequest) {
    const imageBuffer = await apiResponse.arrayBuffer();
    const contentType = apiResponse.headers.get('content-type') || 'image/jpeg';
    return { imageBuffer, contentType };
  }
  
  if (apiResponse.status === 201 || apiResponse.status === 202 || apiResponse.status === 204) {
    // Return an empty object for 201 Created to signify success, 
    // as some dispute actions return this status with a body we might parse later if needed.
    // For 202 and 204, there's no body.
    try {
        return await apiResponse.json();
    } catch (e) {
        return null; // No JSON body to parse
    }
  }
  
  return await apiResponse.json();
}

/**
 * Fetches the full order details from the iFood Merchant API, with retries for 404 errors.
 */
export async function getIFoodOrderDetails(orderId: string): Promise<any> {
  let lastError: any = null;
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const details = await makeIFoodApiCall(`/order/v1.0/orders/${orderId}`);
      return details;
    } catch (error: any) {
      lastError = error;
      if (error.message && error.message.includes('(404)')) {
        console.log(`[iFood API] Attempt ${attempt}: Order ${orderId} not found (404). Retrying in ${retryDelay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        // Fail fast on other errors (e.g., 401 Unauthorized, 500 Server Error)
        break;
      }
    }
  }

  throw new Error(`Failed to fetch iFood order details for ${orderId} after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Sends a status update action for a given order to the iFood API.
 */
export async function sendIFoodOrderAction(orderId: string, action: 'confirm' | 'dispatch' | 'readyToPickup' | 'requestCancellation', body: any = null): Promise<any> {
    const endpointMap = {
        confirm: `/order/v1.0/orders/${orderId}/confirm`,
        dispatch: `/order/v1.0/orders/${orderId}/dispatch`,
        readyToPickup: `/order/v1.0/orders/${orderId}/readyToPickup`,
        requestCancellation: `/order/v1.0/orders/${orderId}/requestCancellation`
    };
    
    const endpoint = endpointMap[action];
    if (!endpoint) {
        throw new Error(`Invalid iFood order action: ${action}`);
    }

    return makeIFoodApiCall(endpoint, 'POST', body);
}

/**
 * Sends a logistics action for a given order to the iFood Logistics API.
 */
export async function sendIFoodLogisticsAction(orderId: string, action: string, body: any = null): Promise<any> {
    const endpointMap: { [key: string]: string } = {
        assignDriver: `/logistics/v1.0/orders/${orderId}/assignDriver`,
        goingToOrigin: `/logistics/v1.0/orders/${orderId}/goingToOrigin`,
        arrivedAtOrigin: `/logistics/v1.0/orders/${orderId}/arrivedAtOrigin`,
        dispatch: `/logistics/v1.0/orders/${orderId}/dispatch`,
        arrivedAtDestination: `/logistics/v1.0/orders/${orderId}/arrivedAtDestination`,
        verifyDeliveryCode: `/logistics/v1.0/orders/${orderId}/verifyDeliveryCode`,
        // ADDED: Endpoint for validating pickup code, assuming it follows a similar path structure.
        validatePickupCode: `/order/v1.0/orders/${orderId}/validatePickupCode`,
    };

    const endpoint = endpointMap[action];
    if (!endpoint) {
        throw new Error(`Invalid iFood logistics action: ${action}`);
    }

    return makeIFoodApiCall(endpoint, 'POST', body);
}

/**
 * Sends a dispute action for a given dispute ID to the iFood Handshake API.
 */
export async function sendIFoodDisputeAction(disputeId: string, action: 'accept' | 'reject', body: any = null): Promise<any> {
    const endpointMap: { [key: string]: string } = {
        accept: `/order/v1.0/disputes/${disputeId}/accept`,
        reject: `/order/v1.0/disputes/${disputeId}/reject`,
    };

    const endpoint = endpointMap[action];
    if (!endpoint) {
        throw new Error(`Invalid iFood dispute action: ${action}`);
    }

    return makeIFoodApiCall(endpoint, 'POST', body);
}

/**
 * Sends a dispute alternative proposal for a given dispute ID to the iFood Handshake API.
 */
export async function sendIFoodDisputeAlternativeAction(disputeId: string, alternativeId: string, body: any = null): Promise<any> {
    const endpoint = `/order/v1.0/disputes/${disputeId}/alternatives/${alternativeId}`;
    return makeIFoodApiCall(endpoint, 'POST', body);
}

/**
 * Fetches an image (like a cancellation evidence) from the iFood API.
 */
export async function getIFoodImage(imageUrl: string): Promise<{ imageBuffer: ArrayBuffer, contentType: string }> {
  const endpointPath = new URL(imageUrl).pathname;
  return makeIFoodApiCall(endpointPath, 'GET', null, { isImageRequest: true });
}