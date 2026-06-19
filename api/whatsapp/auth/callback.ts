import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).end();
    }

    const { code, state, error, error_description } = req.query;
    
    // Support either query param or header/cookie for storeId (for this example, state carries storeId)
    const storeId = state as string;

    if (error) {
        return res.send(`
            <html><body>
                <h2>Error authenticating with Facebook</h2>
                <p>${error_description}</p>
                <script>
                    if (window.opener) {
                        window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: '${error_description}' }, '*');
                        window.close();
                    }
                </script>
            </body></html>
        `);
    }

    if (!code) {
        return res.status(400).send('Missing code');
    }

    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;

    if (!appId || !appSecret) {
        return res.status(500).send('Facebook App ID or Secret not configured');
    }

    try {
        // Construct redirect URI. Using Vercel's Host header or assuming standard
        // In local/preview, VERCEL_URL might not perfectly match the proxy, but host header is accurate
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        let redirectUri = `${protocol}://${host}/api/whatsapp/auth/callback`;

        // 1. Exchange code for token
        const tokenRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`);
        const tokenData = await tokenRes.json();

        if (tokenData.error) {
            console.error('FB Token error:', tokenData.error);
            throw new Error(tokenData.error.message || 'Failed to exchange token');
        }

        const accessToken = tokenData.access_token;

        // 2. Try to get businesses and WABA details (best effort for automatic setup)
        // Note: A real app might need the user to select which WABA to use if they have multiple.
        let wabaId = 'PENDING_CONFIG';
        let phoneId = 'PENDING_CONFIG';
        let phoneNumber = 'Pendente';

        try {
            const busRes = await fetch(`https://graph.facebook.com/v19.0/me/businesses?access_token=${accessToken}`);
            const busData = await busRes.json();
            const businessId = busData?.data?.[0]?.id;

            if (businessId) {
                const wabaRes = await fetch(`https://graph.facebook.com/v19.0/${businessId}/owned_whatsapp_business_accounts?access_token=${accessToken}`);
                const wabaData = await wabaRes.json();
                const foundWaba = wabaData?.data?.[0]?.id;

                if (foundWaba) {
                    wabaId = foundWaba;
                    const phoneRes = await fetch(`https://graph.facebook.com/v19.0/${wabaId}/phone_numbers?access_token=${accessToken}`);
                    const phoneData = await phoneRes.json();
                    
                    if (phoneData?.data?.[0]) {
                        phoneId = phoneData.data[0].id;
                        phoneNumber = phoneData.data[0].display_phone_number;
                    }
                }
            }
        } catch (fetchError) {
            console.warn('Could not auto-fetch WABA details:', fetchError);
        }

        // 3. Save to database using the passed state as storeId
        if (storeId) {
            await supabase.from('whatsapp_configs').upsert({
                store_id: storeId,
                waba_id: wabaId,
                phone_number_id: phoneId,
                access_token: accessToken,
                phone_number: phoneNumber,
                is_active: true
            });
        }

        // 4. Send success to popup parent
        return res.send(`
            <html><body>
                <h2>Conexão com WhatsApp concluída!</h2>
                <p>Você já pode fechar esta janela.</p>
                <script>
                    if (window.opener) {
                        window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                        window.close();
                    } else {
                        window.location.href = '/home';
                    }
                </script>
            </body></html>
        `);

    } catch (e: any) {
        console.error('FB OAuth Callback Error:', e);
        return res.status(500).send(`
            <html><body>
                <h2>Erro na integração</h2>
                <p>${e.message}</p>
                <script>
                    if (window.opener) {
                        window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: '${e.message.replace(/'/g, "\\'")}' }, '*');
                        setTimeout(() => window.close(), 3000);
                    }
                </script>
            </body></html>
        `);
    }
}
