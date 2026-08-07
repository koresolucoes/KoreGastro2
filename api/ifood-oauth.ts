import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const iFoodApiBaseUrl = process.env.IFOOD_API_URL || 'https://merchant-api.ifood.com.br';
const clientId = process.env.IFOOD_CLIENT_ID;
const clientSecret = process.env.IFOOD_CLIENT_SECRET;

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-key'
);

export default async function handler(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (!clientId || !clientSecret) {
        return res.status(500).json({ message: 'iFood credentials not configured on the server.' });
    }

    try {
        const { action } = req.body || req.query;

        if (action === 'clientCredentials') {
            const params = new URLSearchParams();
            params.append('grantType', 'client_credentials');
            params.append('clientId', clientId);
            params.append('clientSecret', clientSecret);

            const iFoodRes = await fetch(`${iFoodApiBaseUrl}/authentication/v1.0/oauth/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params
            });

            if (!iFoodRes.ok) {
                const err = await iFoodRes.text();
                return res.status(iFoodRes.status).json({ message: `Failed to get token via client_credentials: ${err}` });
            }

            const tokenData = await iFoodRes.json();
            
            let tenantId = req.body.tenantId;

            if (tokenData.accessToken) {
                try {
                    const tokenParts = tokenData.accessToken.split('.');
                    if (tokenParts.length === 3) {
                        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString('utf8'));
                        if (payload.tenantId) {
                            tenantId = payload.tenantId;
                        }
                    }
                } catch (e) {
                    console.error('[iFood OAuth] Error parsing JWT', e);
                }
            }
            
            // If we don't have a specific tenantId from token or req body, fetch merchants
            if (!tenantId) {
                try {
                    const merchantRes = await fetch(`${iFoodApiBaseUrl}/merchant/v1.0/merchants`, {
                        headers: { 'Authorization': `Bearer ${tokenData.accessToken}` }
                    });
                    if (merchantRes.ok) {
                        const merchants = await merchantRes.json();
                        if (merchants && merchants.length > 0) {
                            tenantId = merchants[0].id;
                        }
                    }
                } catch(e) {
                    console.error('[iFood OAuth] Could not fetch merchants', e);
                }
            }
            
            tenantId = tenantId || 'default_tenant';

            const now = new Date();
            const expiresAt = new Date(now.getTime() + ((tokenData.expiresIn || 3600) * 1000));
            
            await supabase.from('system_cache').upsert({
                key: `ifood_access_token_${tenantId}`,
                value: tokenData.accessToken,
                expires_at: expiresAt.toISOString(),
                updated_at: new Date().toISOString()
            });

            return res.status(200).json({ success: true, tenantId, message: 'Autenticado via Client Credentials' });
        }

        if (action === 'userCode') {
            // Step 1: Request userCode
            const params = new URLSearchParams();
            params.append('clientId', clientId);

            const iFoodRes = await fetch(`${iFoodApiBaseUrl}/authentication/v1.0/oauth/userCode`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params
            });

            if (!iFoodRes.ok) {
                const err = await iFoodRes.text();
                return res.status(iFoodRes.status).json({ message: `Failed to get userCode: ${err}` });
            }

            const data = await iFoodRes.json();
            return res.status(200).json(data);
        }

        if (action === 'token') {
            // Step 2: Exchange authorizationCode for token
            const { authorizationCode, authorizationCodeVerifier } = req.body;

            if (!authorizationCode || !authorizationCodeVerifier) {
                return res.status(400).json({ message: 'Missing required parameters.' });
            }

            const params = new URLSearchParams();
            params.append('grantType', 'authorization_code');
            params.append('clientId', clientId);
            params.append('clientSecret', clientSecret);
            params.append('authorizationCode', authorizationCode);
            params.append('authorizationCodeVerifier', authorizationCodeVerifier);

            const iFoodRes = await fetch(`${iFoodApiBaseUrl}/authentication/v1.0/oauth/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params
            });

            if (!iFoodRes.ok) {
                const err = await iFoodRes.text();
                return res.status(iFoodRes.status).json({ message: `Failed to get token: ${err}` });
            }

            const tokenData = await iFoodRes.json();
            
            let tenantId = req.body.tenantId;

            // Extract tenantId from JWT if possible
            if (tokenData.accessToken) {
                try {
                    const tokenParts = tokenData.accessToken.split('.');
                    if (tokenParts.length === 3) {
                        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString('utf8'));
                        if (payload.tenantId) {
                            tenantId = payload.tenantId;
                        }
                    }
                } catch (e) {
                    console.error('[iFood OAuth] Error parsing JWT', e);
                }
            }

            if (!tenantId && tokenData.accessToken) {
                try {
                    const merchantRes = await fetch(`${iFoodApiBaseUrl}/merchant/v1.0/merchants`, {
                        headers: { 'Authorization': `Bearer ${tokenData.accessToken}` }
                    });
                    if (merchantRes.ok) {
                        const merchants = await merchantRes.json();
                        if (merchants && merchants.length > 0) {
                            tenantId = merchants[0].id;
                        }
                    }
                } catch(e) {
                    console.error('[iFood OAuth] Could not fetch merchants', e);
                }
            }

            tenantId = tenantId || 'default_tenant';
            
            // Save tokens to system_cache mapped to tenantId
            const now = new Date();
            const expiresAt = new Date(now.getTime() + (tokenData.expiresIn * 1000));
            
            // We'll store both access and refresh token in system_cache
            await supabase.from('system_cache').upsert({
                key: `ifood_access_token_${tenantId}`,
                value: tokenData.accessToken,
                expires_at: expiresAt.toISOString(),
                updated_at: new Date().toISOString()
            });

            if (tokenData.refreshToken) {
                await supabase.from('system_cache').upsert({
                    key: `ifood_refresh_token_${tenantId}`,
                    value: tokenData.refreshToken,
                    expires_at: new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000)).toISOString(), // approx 30 days
                    updated_at: new Date().toISOString()
                });
            }

            return res.status(200).json({ success: true, tenantId });
        }

        return res.status(400).json({ message: 'Invalid action.' });

    } catch (error: any) {
        console.error('[iFood OAuth]', error);
        return res.status(500).json({ message: error.message });
    }
}
