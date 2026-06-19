import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).end();
    }

    const { redirectUri } = req.query;
    if (!redirectUri) {
        return res.status(400).json({ error: 'Missing redirectUri' });
    }

    const appId = process.env.FACEBOOK_APP_ID;
    if (!appId) {
        return res.status(500).json({ error: 'FACEBOOK_APP_ID not configured in environment variables' });
    }

    const params = new URLSearchParams({
        client_id: appId,
        redirect_uri: redirectUri as string,
        response_type: 'code',
        scope: 'whatsapp_business_management,whatsapp_business_messaging,business_management',
    });

    const url = `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
    
    return res.status(200).json({ url });
}
