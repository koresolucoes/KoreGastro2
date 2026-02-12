
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getIFoodAccessToken } from './ifood-webhook-lib/ifood-api.js';

const iFoodApiBaseUrl = process.env.IFOOD_API_URL || 'https://merchant-api.ifood.com.br';

export default async function handler(request: VercelRequest, response: VercelResponse) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (request.method === 'OPTIONS') {
        return response.status(204).end();
    }

    if (request.method !== 'POST') {
        return response.status(405).json({ message: 'Only POST requests are allowed to the proxy' });
    }

    try {
        const { method, endpoint, payload, isImageUpload } = request.body;
        
        if (!method || !endpoint) {
            return response.status(400).json({ message: 'Missing "method" or "endpoint" in request body' });
        }

        // Use cached/centralized token retrieval
        const accessToken = await getIFoodAccessToken();
        const fullUrl = endpoint.startsWith('http') ? endpoint : `${iFoodApiBaseUrl}${endpoint}`;
        
        let apiResponse;
        if (isImageUpload) {
            if (!payload || !payload.image) {
                return response.status(400).json({ message: 'Missing "image" (data URL) for image upload.' });
            }
            
            apiResponse = await fetch(fullUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
        } else {
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
                errorJson = responseBodyText ? JSON.parse(responseBodyText) : { message: `iFood API returned status ${apiResponse.status}.` };
            } catch (e) {
                errorJson = { message: responseBodyText };
            }
            console.error(`[iFood Catalog Proxy] API call to ${endpoint} failed:`, responseBodyText);
            return response.status(apiResponse.status).json(errorJson);
        }
        
        if (!responseBodyText) {
            return response.status(apiResponse.status).end();
        }
        
        try {
            const data = JSON.parse(responseBodyText);
            return response.status(apiResponse.status).json(data);
        } catch (e) {
            return response.status(500).json({ message: 'Failed to parse response from iFood API.' });
        }

    } catch (error: any) {
        console.error('[iFood Catalog Proxy] Fatal error:', error);
        return response.status(500).json({ message: error.message || 'An internal server error occurred.' });
    }
}
