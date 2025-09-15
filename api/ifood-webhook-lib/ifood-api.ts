import { VercelResponse } from '@vercel/node';

/**
 * Retrieves an OAuth access token from the iFood API using client credentials.
 * @returns The access token string.
 */
async function getIFoodAccessToken(): Promise<string> {
  const clientId = process.env.IFOOD_CLIENT_ID;
  const clientSecret = process.env.IFOOD_CLIENT_SECRET;
  const iFoodApiBaseUrl = 'https://merchant-api.ifood.com.br';

  if (!clientId || !clientSecret) {
    throw new Error('iFood API credentials are not set.');
  }

  const tokenParams = new URLSearchParams();
  tokenParams.append('grantType', 'client_credentials');
  tokenParams.append('clientId', clientId);
  tokenParams.append('clientSecret', clientSecret);

  const tokenResponse = await fetch(`${iFoodApiBaseUrl}/authentication/v1.0/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParams,
  });

  if (!tokenResponse.ok) {
    throw new Error(`Failed to get iFood access token: ${await tokenResponse.text()}`);
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.accessToken;

  if (!accessToken) {
    throw new Error('Access token not found in iFood authentication response.');
  }

  return accessToken;
}

/**
 * Fetches the full order details from the iFood Merchant API.
 * Includes a retry mechanism for 404 errors to handle API race conditions.
 * @param orderId The ID of the iFood order.
 * @returns The full order details object.
 */
export async function getIFoodOrderDetails(orderId: string): Promise<any> {
  const accessToken = await getIFoodAccessToken();
  const iFoodApiBaseUrl = 'https://merchant-api.ifood.com.br';
  let lastError: any = null;
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const orderDetailsResponse = await fetch(`${iFoodApiBaseUrl}/order/v1.0/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (orderDetailsResponse.ok) {
      return await orderDetailsResponse.json();
    }

    lastError = await orderDetailsResponse.json();

    if (orderDetailsResponse.status === 404) {
      console.log(`Attempt ${attempt}: Order ${orderId} not found. Retrying in ${retryDelay / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    } else {
      break; // Fail fast on other errors
    }
  }

  throw new Error(`Failed to fetch iFood order details for ${orderId} after ${maxRetries} attempts: ${JSON.stringify(lastError)}`);
}
