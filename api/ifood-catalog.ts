import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Buffer } from 'buffer';

const iFoodApiBaseUrl = process.env.IFOOD_API_URL || 'https://merchant-api.ifood.com.br';

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function getIFoodAccessToken(): Promise<string> {
    const now = Date.now();
    // Use token if it exists and is not expired (with a 60-second buffer)
    if (cachedToken && cachedToken.expiresAt > now + 60000) {
        console.log('[iFood Catalog Proxy] Using cached access token.');
        return cachedToken.accessToken;
    }

    console.log('[iFood Catalog Proxy] Requesting new access token...');
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
    
    // `expiresIn` is in seconds. Convert to a future timestamp in milliseconds.
    const expiresAt = now + (tokenData.expiresIn * 1000);

    cachedToken = {
        accessToken: tokenData.accessToken,
        expiresAt: expiresAt,
    };
    
    console.log('[iFood Catalog Proxy] New token cached successfully.');
    return tokenData.accessToken;
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
    // Set CORS headers for all responses
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET, PUT, PATCH, DELETE');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight OPTIONS request
    if (request.method === 'OPTIONS') {
        return response.status(204).end();
    }

    if (request.method !== 'POST') {
        return response.status(405).json({ message: 'Only POST requests are allowed to the proxy' });
    }

    try {
        const { method, endpoint, payload, isImageUpload } = request.body;
        const isImageRequest = payload?.isImageRequest;
        
        if (!method || !endpoint) {
            return response.status(400).json({ message: 'Missing "method" or "endpoint" in request body' });
        }

        const accessToken = await getIFoodAccessToken();
        const fullUrl = endpoint.startsWith('http') ? endpoint : `${iFoodApiBaseUrl}${endpoint}`;
        
        if (isImageRequest) {
            console.log(`[iFood Catalog Proxy] Received IMAGE request for URL: ${fullUrl}`);
            const imageApiResponse = await fetch(fullUrl, {
                method: 'GET', // Evidences are always GET
                headers: { 'Authorization': `Bearer ${accessToken}` },
            });

            if (!imageApiResponse.ok) {
                const errorText = await imageApiResponse.text();
                console.error(`[iFood Catalog Proxy] Image fetch from ${fullUrl} failed with status ${imageApiResponse.status}:`, errorText);
                return response.status(imageApiResponse.status).json({ message: `iFood image fetch failed: ${errorText}` });
            }
            console.log(`[iFood Catalog Proxy] Successfully fetched image from ${fullUrl}`);

            const imageBuffer = await imageApiResponse.arrayBuffer();
            const base64Image = Buffer.from(imageBuffer).toString('base64');
            const contentType = imageApiResponse.headers.get('content-type') || 'image/jpeg';
            
            console.log(`[iFood Catalog Proxy] Returning base64 image with content type: ${contentType}`);
            return response.status(200).json({ base64Image, contentType });
        }
        
        let apiResponse;
        if (isImageUpload) {
            // Logic for image upload using application/json (iFood Catalog API v2.0)
            if (!payload || !payload.image) {
                return response.status(400).json({ message: 'Missing "image" (data URL) for image upload.' });
            }
            
            apiResponse = await fetch(fullUrl, {
                method: 'POST', // Image upload is always POST
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
        } else {
            // Original logic for JSON payloads
            apiResponse = await fetch(fullUrl, {
                method,
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: payload ? JSON.stringify(payload) : null,
            });
        }

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