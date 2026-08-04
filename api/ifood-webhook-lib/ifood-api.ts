
import { createClient } from '@supabase/supabase-js';

const iFoodApiBaseUrl = process.env.IFOOD_API_URL || 'https://merchant-api.ifood.com.br';

// Initialize Supabase client for token caching
// Use fallback to VITE_ prefixed variables if standard ones are not available
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[iFood API] Missing Supabase environment variables. Token caching will fail.');
}

const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-key'
);

/**
 * Obtém um token de acesso válido, usando cache do banco de dados ou solicitando um novo.
 */
export async function getIFoodAccessToken(tenantId?: string): Promise<string> {
    const clientId = process.env.IFOOD_CLIENT_ID;
    const clientSecret = process.env.IFOOD_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('Server configuration error: iFood credentials missing.');
    }

    if (tenantId) {
        // DISTRIBUTED FLOW
        const accessCacheKey = `ifood_access_token_${tenantId}`;
        const refreshCacheKey = `ifood_refresh_token_${tenantId}`;
        const now = new Date();

        // 1. Try to get access token from cache
        const { data: cachedAccess } = await supabase
            .from('system_cache')
            .select('value, expires_at')
            .eq('key', accessCacheKey)
            .single();

        if (cachedAccess && new Date(cachedAccess.expires_at) > new Date(now.getTime() + 60000)) {
            console.log(`[iFood API] Using cached access token for tenant ${tenantId}.`);
            return cachedAccess.value;
        }

        // 2. Try to refresh token
        const { data: cachedRefresh } = await supabase
            .from('system_cache')
            .select('value')
            .eq('key', refreshCacheKey)
            .single();

        if (cachedRefresh && cachedRefresh.value) {
            console.log(`[iFood API] Refreshing token for tenant ${tenantId}...`);
            const tokenParams = new URLSearchParams({
                grantType: 'refresh_token',
                clientId: clientId,
                clientSecret: clientSecret,
                refreshToken: cachedRefresh.value
            });

            const tokenResponse = await fetch(`${iFoodApiBaseUrl}/authentication/v1.0/oauth/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: tokenParams,
            });

            if (tokenResponse.ok) {
                const tokenData = await tokenResponse.json();
                const accessToken = tokenData.accessToken;
                const expiresAt = new Date(now.getTime() + (tokenData.expiresIn * 1000));
                
                await supabase.from('system_cache').upsert({
                    key: accessCacheKey,
                    value: accessToken,
                    expires_at: expiresAt.toISOString(),
                    updated_at: new Date().toISOString()
                });

                if (tokenData.refreshToken) {
                    await supabase.from('system_cache').upsert({
                        key: refreshCacheKey,
                        value: tokenData.refreshToken,
                        expires_at: new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000)).toISOString(),
                        updated_at: new Date().toISOString()
                    });
                }
                
                return accessToken;
            } else {
                console.error(`[iFood API] Failed to refresh token for tenant ${tenantId}.`);
                // Fallthrough to error or maybe legacy flow if not fully migrated? 
                throw new Error('Failed to refresh iFood token. User must re-authenticate.');
            }
        }
        
        throw new Error('No valid token or refresh token found for this merchant. Please authorize the app in iFood.');
    }

    // LEGACY CENTRALIZED FLOW (Fallback if no tenantId provided)
    const cacheKey = 'ifood_access_token';
    const now = new Date();

    const { data: cached } = await supabase
        .from('system_cache')
        .select('value, expires_at')
        .eq('key', cacheKey)
        .single();

    if (cached && new Date(cached.expires_at) > new Date(now.getTime() + 60000)) {
        console.log('[iFood API] Using DB cached access token.');
        return cached.value;
    }

    console.log('[iFood API] Requesting new access token from iFood...');
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
    const accessToken = tokenData.accessToken;
    const expiresInSeconds = tokenData.expiresIn;
    
    const expiresAt = new Date(now.getTime() + (expiresInSeconds * 1000));

    await supabase.from('system_cache').upsert({
        key: cacheKey,
        value: accessToken,
        expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString()
    });

    console.log('[iFood API] New access token cached in DB.');
    return accessToken;
}

/**
 * Handles the OAuth flow and makes a signed request to the iFood Merchant API.
 */
async function makeIFoodApiCall(endpoint: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET', body: any = null, options: { isImageRequest?: boolean, tenantId?: string } = {}) {
  const fullUrl = endpoint.startsWith('http') ? endpoint : `${iFoodApiBaseUrl}${endpoint}`;
  console.log(`[iFood API] Initiating call to: ${fullUrl}`);

  // 1. Get Access Token (Centralized)
  const accessToken = await getIFoodAccessToken(options.tenantId);

  // 2. Make the authenticated API call
  const headers: any = {
      'Authorization': `Bearer ${accessToken}`
  };

  if (!options.isImageRequest) {
      headers['Content-Type'] = 'application/json';
  }

  const apiResponse = await fetch(fullUrl, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  if (!apiResponse.ok) {
    const errorText = await apiResponse.text();
    console.error(`[iFood API] API call failed with status ${apiResponse.status}:`, errorText);
    throw new Error(`iFood API error (${apiResponse.status}): ${errorText}`);
  }

  console.log(`[iFood API] Call successful with status ${apiResponse.status}.`);
  
  if (options.isImageRequest) {
    const imageBuffer = await apiResponse.arrayBuffer();
    const contentType = apiResponse.headers.get('content-type') || 'image/jpeg';
    return { imageBuffer, contentType };
  }
  
  if (apiResponse.status === 201 || apiResponse.status === 202 || apiResponse.status === 204) {
    try {
        const text = await apiResponse.text();
        return text ? JSON.parse(text) : null;
    } catch (e) {
        return null;
    }
  }
  
  return await apiResponse.json();
}

/**
 * Fetches the full order details from the iFood Merchant API, with retries for 404 errors.
 */
export async function getIFoodOrderDetails(orderId: string, tenantId?: string): Promise<any> {
  let lastError: any = null;
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const details = await makeIFoodApiCall(`/order/v1.0/orders/${orderId}`, 'GET', null, { tenantId });
      return details;
    } catch (error: any) {
      lastError = error;
      if (error.message && error.message.includes('(404)')) {
        console.log(`[iFood API] Attempt ${attempt}: Order ${orderId} not found (404). Retrying in ${retryDelay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        break;
      }
    }
  }

  throw new Error(`Failed to fetch iFood order details for ${orderId} after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Sends a status update action for a given order to the iFood API.
 */
export async function sendIFoodOrderAction(orderId: string, action: 'confirm' | 'dispatch' | 'readyToPickup' | 'requestCancellation', body: any = null, tenantId?: string): Promise<any> {
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

    return makeIFoodApiCall(endpoint, 'POST', body, { tenantId });
}

/**
 * Sends a logistics action for a given order to the iFood Logistics API.
 */
export async function sendIFoodLogisticsAction(orderId: string, action: string, body: any = null, tenantId?: string): Promise<any> {
    const endpointMap: { [key: string]: string } = {
        assignDriver: `/logistics/v1.0/orders/${orderId}/assignDriver`,
        goingToOrigin: `/logistics/v1.0/orders/${orderId}/goingToOrigin`,
        arrivedAtOrigin: `/logistics/v1.0/orders/${orderId}/arrivedAtOrigin`,
        dispatch: `/logistics/v1.0/orders/${orderId}/dispatch`,
        arrivedAtDestination: `/logistics/v1.0/orders/${orderId}/arrivedAtDestination`,
        verifyDeliveryCode: `/logistics/v1.0/orders/${orderId}/verifyDeliveryCode`,
        validatePickupCode: `/order/v1.0/orders/${orderId}/validatePickupCode`,
    };

    const endpoint = endpointMap[action];
    if (!endpoint) {
        throw new Error(`Invalid iFood logistics action: ${action}`);
    }

    return makeIFoodApiCall(endpoint, 'POST', body, { tenantId });
}

/**
 * Sends a dispute action for a given dispute ID to the iFood Handshake API.
 */
export async function sendIFoodDisputeAction(disputeId: string, action: 'accept' | 'reject', body: any = null, tenantId?: string): Promise<any> {
    const endpointMap: { [key: string]: string } = {
        accept: `/order/v1.0/disputes/${disputeId}/accept`,
        reject: `/order/v1.0/disputes/${disputeId}/reject`,
    };

    const endpoint = endpointMap[action];
    if (!endpoint) {
        throw new Error(`Invalid iFood dispute action: ${action}`);
    }

    return makeIFoodApiCall(endpoint, 'POST', body, { tenantId });
}

/**
 * Sends a dispute alternative proposal for a given dispute ID to the iFood Handshake API.
 */
export async function sendIFoodDisputeAlternativeAction(disputeId: string, alternativeId: string, body: any = null, tenantId?: string): Promise<any> {
    const endpoint = `/order/v1.0/disputes/${disputeId}/alternatives/${alternativeId}`;
    return makeIFoodApiCall(endpoint, 'POST', body, { tenantId });
}

/**
 * Fetches an image (like a cancellation evidence) from the iFood API.
 */
export async function getIFoodImage(imageUrl: string, tenantId?: string): Promise<{ imageBuffer: ArrayBuffer, contentType: string }> {
  const endpointPath = new URL(imageUrl).pathname;
  return makeIFoodApiCall(endpointPath, 'GET', null, { isImageRequest: true, tenantId });
}
