import type { VercelRequest, VercelResponse } from '@vercel/node';

const iFoodApiBaseUrl = 'https://merchant-api.ifood.com.br';

async function getIFoodAccessToken(): Promise<string> {
    const clientId = process.env.IFOOD_CLIENT_ID;
    const clientSecret = process.env.IFOOD_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('iFood client credentials are not configured on the server.');
    }

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
        console.error('[iFood Catalog Proxy] Failed to get access token:', errorText);
        throw new Error(`iFood authentication failed: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    return tokenData.accessToken;
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
    if (request.method !== 'POST') {
        return response.status(405).json({ message: 'Only POST requests are allowed' });
    }

    try {
        const { method, endpoint, payload } = request.body;
        
        if (!method || !endpoint) {
            return response.status(400).json({ message: 'Missing "method" or "endpoint" in request body' });
        }

        const accessToken = await getIFoodAccessToken();
        
        const apiResponse = await fetch(`${iFoodApiBaseUrl}${endpoint}`, {
            method,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: payload ? JSON.stringify(payload) : null,
        });

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            // Try to parse the error, but fall back to text if it's not JSON
            let errorJson;
            try {
                errorJson = JSON.parse(errorText);
            } catch (e) {
                errorJson = { message: errorText };
            }
            console.error(`[iFood Catalog Proxy] API call to ${endpoint} failed with status ${apiResponse.status}:`, errorText);
            return response.status(apiResponse.status).json(errorJson);
        }
        
        // Handle responses with no content
        if (apiResponse.status === 202 || apiResponse.status === 204) {
            return response.status(apiResponse.status).send('');
        }

        const data = await apiResponse.json();
        return response.status(200).json(data);

    } catch (error: any) {
        console.error('[iFood Catalog Proxy] Fatal error:', error);
        return response.status(500).json({ message: error.message || 'An internal server error occurred.' });
    }
}