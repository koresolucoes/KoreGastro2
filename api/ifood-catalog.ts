
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getIFoodAccessToken } from './ifood-webhook-lib/ifood-api.js';

const iFoodApiBaseUrl = process.env.IFOOD_API_URL || 'https://merchant-api.ifood.com.br';

export default async function handler(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Only POST requests are allowed to the proxy' });
    }

    try {
        const { method, endpoint, payload, isImageUpload, merchantId } = req.body;
        
        if (!method || !endpoint) {
            return res.status(400).json({ message: 'Missing "method" or "endpoint" in req body' });
        }

        // Use cached/centralized token retrieval
        const accessToken = await getIFoodAccessToken(merchantId);
        const fullUrl = endpoint.startsWith('http') ? endpoint : `${iFoodApiBaseUrl}${endpoint}`;
        
        let apiResponse;
        if (isImageUpload) {
            if (!payload || !payload.image) {
                return res.status(400).json({ message: 'Missing "image" (data URL) for image upload.' });
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
            return res.status(apiResponse.status).json(errorJson);
        }
        
        if (!responseBodyText) {
            return res.status(apiResponse.status).end();
        }
        
        try {
            const data = JSON.parse(responseBodyText);
            return res.status(apiResponse.status).json(data);
        } catch (e) {
            return res.status(500).json({ message: 'Failed to parse res from iFood API.' });
        }

    } catch (error: any) {
        console.error('[iFood Catalog Proxy] Fatal error:', error);
        return res.status(500).json({ message: error.message || 'An internal server error occurred.' });
    }
}
