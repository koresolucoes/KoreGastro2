
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

        const responseBodyText = await apiResponse.text();

        if (!apiResponse.ok) {
            let errorJson;
            try {
                errorJson = responseBodyText ? JSON.parse(responseBodyText) : { message: `iFood API returned status ${apiResponse.status} with an empty body.` };
            } catch (e) {
                errorJson = { message: responseBodyText };
            }
            console.error(`[iFood Catalog Proxy] API call to ${endpoint} failed with status ${apiResponse.status}:`, responseBodyText);
            return response.status(apiResponse.status).json(errorJson);
        }
        
        // If the body is empty (common for 201, 202, 204), send an empty response with the correct status code.
        if (!responseBodyText) {
            return response.status(apiResponse.status).end();
        }
        
        // If a body exists, parse and send it as JSON.
        try {
            const data = JSON.parse(responseBodyText);
            return response.status(apiResponse.status).json(data);
        } catch (e) {
            console.error(`[iFood Catalog Proxy] Could not parse JSON from successful iFood response. Body:`, responseBodyText);
            // This is an unexpected state; the API returned a non-JSON body on success.
            // We return a 500 error because our application expects JSON.
            return response.status(500).json({ message: 'Failed to parse response from iFood API.' });
        }

    } catch (error: any) {
        console.error('[iFood Catalog Proxy] Fatal error:', error);
        return response.status(500).json({ message: error.message || 'An internal server error occurred.' });
    }
}
