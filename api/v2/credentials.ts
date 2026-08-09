import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Missing config' });

  const supabase = createClient(supabaseUrl, supabaseKey);
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Missing token' });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const storeId = req.query.storeId || user.id;

  const { data: creds } = await supabase
    .from('store_integration_credentials')
    .select('external_api_key, mp_access_token, focusnfe_token, ifood_merchant_id, focusnfe_cert_valid_until')
    .eq('store_id', storeId)
    .single();

  if (!creds) {
    return res.status(200).json({ credentials: {} });
  }

  const masked = {
    external_api_key: creds.external_api_key ? '••••••••••••' + creds.external_api_key.slice(-4) : null,
    mp_access_token: creds.mp_access_token ? 'APP_USR-••••••••••••' + creds.mp_access_token.slice(-4) : null,
    focusnfe_token: creds.focusnfe_token ? '••••••••••••' + creds.focusnfe_token.slice(-4) : null,
    ifood_merchant_id: creds.ifood_merchant_id,
    focusnfe_cert_valid_until: creds.focusnfe_cert_valid_until,
    has_mp_integration: !!creds.mp_access_token,
    has_focusnfe_integration: !!creds.focusnfe_token,
  };

  return res.status(200).json({ credentials: masked });
}
