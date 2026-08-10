import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { checkRateLimit } from './redis.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  serviceRoleKey || 'placeholder-key'
);
const TokenSchema = z.string().uuid();

function setCorsHeaders(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin;
  const allowed = typeof origin === 'string' && (
    origin === 'https://app.chefos.online'
    || origin.startsWith('http://localhost:')
    || origin.startsWith('http://127.0.0.1:')
  );
  res.setHeader('Access-Control-Allow-Origin', allowed ? origin : 'https://app.chefos.online');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

export async function handlePublicTableAction(
  req: VercelRequest,
  res: VercelResponse,
  tableStatus: 'CHAMANDO_GARCOM' | 'PAGANDO',
  actionName: string
) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(503).json({ error: 'Service unavailable' });
  }

  const tokenResult = TokenSchema.safeParse(req.body?.token || req.query.token);
  if (!tokenResult.success) {
    return res.status(400).json({ error: 'A valid session token is required' });
  }

  const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const rateLimit = await checkRateLimit(`public-table-action:${actionName}:${clientIp}:${tokenResult.data}`, 20, 60);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(Math.ceil(rateLimit.resetMs / 1000)));
    return res.status(429).json({ error: 'Too many requests' });
  }

  try {
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('table_number,user_id')
      .eq('session_token', tokenResult.data)
      .eq('status', 'OPEN')
      .is('deleted_at', null)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order?.table_number || !order.user_id) {
      return res.status(404).json({ error: 'Active table session not found' });
    }

    const { data: table, error: updateError } = await supabase
      .from('tables')
      .update({ status: tableStatus })
      .eq('number', order.table_number)
      .eq('user_id', order.user_id)
      .select('id')
      .maybeSingle();
    if (updateError) throw updateError;
    if (!table) return res.status(404).json({ error: 'Table not found' });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error(`[API /${actionName}] Request failed:`, error);
    return res.status(500).json({ error: 'Failed to update table status' });
  }
}
