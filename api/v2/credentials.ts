import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  serviceRoleKey || 'placeholder-key'
);

function setCorsHeaders(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin;
  const allowed = typeof origin === 'string' && (
    origin === 'https://app.chefos.online' ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:')
  );
  res.setHeader('Access-Control-Allow-Origin', allowed ? origin : 'https://app.chefos.online');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
}

async function accountCanAccessStore(accountId: string, storeId: string): Promise<boolean> {
  if (accountId === storeId) return true;
  const [ownedStore, delegatedAccess] = await Promise.all([
    supabase.from('stores').select('id').eq('id', storeId).eq('owner_id', accountId).maybeSingle(),
    supabase.from('unit_permissions').select('store_id').eq('store_id', storeId).eq('manager_id', accountId).maybeSingle()
  ]);
  return !!ownedStore.data || !!delegatedAccess.data;
}

function maskSecret(value: string | null, prefix = ''): string | null {
  return value ? `${prefix}${'•'.repeat(12)}${value.slice(-4)}` : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(503).json({ error: 'Service unavailable' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing session token' });
  const token = authHeader.slice('Bearer '.length).trim();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid session token' });

  const storeId = String(req.query.storeId || user.id).trim();
  if (!(await accountCanAccessStore(user.id, storeId))) {
    return res.status(403).json({ error: 'Access denied for this store' });
  }

  const { data: credentials, error } = await supabase
    .from('store_integration_credentials')
    .select('external_api_key, mp_access_token, focusnfe_token, ifood_merchant_id, focusnfe_cert_valid_until')
    .eq('store_id', storeId)
    .maybeSingle();
  if (error) {
    console.error('[API /v2/credentials] Query failed:', error);
    return res.status(500).json({ error: 'Failed to load credentials' });
  }
  if (!credentials) return res.status(200).json({ credentials: {} });

  return res.status(200).json({
    credentials: {
      external_api_key: maskSecret(credentials.external_api_key),
      mp_access_token: maskSecret(credentials.mp_access_token, 'APP_USR-'),
      focusnfe_token: maskSecret(credentials.focusnfe_token),
      ifood_merchant_id: credentials.ifood_merchant_id,
      focusnfe_cert_valid_until: credentials.focusnfe_cert_valid_until,
      has_mp_integration: !!credentials.mp_access_token,
      has_focusnfe_integration: !!credentials.focusnfe_token,
    }
  });
}
