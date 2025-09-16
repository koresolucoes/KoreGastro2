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
            let errorJson;
            try {
                // Only attempt to parse JSON if there's content to parse.
                errorJson = errorText ? JSON.parse(errorText) : { message: `iFood API returned status ${apiResponse.status} with an empty body.` };
            } catch (e) {
                // If parsing fails, use the raw text as the message.
                errorJson = { message: errorText };
            }
            console.error(`[iFood Catalog Proxy] API call to ${endpoint} failed with status ${apiResponse.status}:`, errorText);
            return response.status(apiResponse.status).json(errorJson);
        }
        
        // Handle successful responses with no content (e.g., 202 Accepted, 204 No Content).
        if (apiResponse.status === 202 || apiResponse.status === 204) {
            return response.status(apiResponse.status).end();
        }

        // For all other successful responses, parse JSON and forward it.
        const data = await apiResponse.json();
        // Forward the original success status code (e.g., 200 OK, 201 Created).
        return response.status(apiResponse.status).json(data);

    } catch (error: any) {
        console.error('[iFood Catalog Proxy] Fatal error:', error);
        return response.status(500).json({ message: error.message || 'An internal server error occurred.' });
    }
}
