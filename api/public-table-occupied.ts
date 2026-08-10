import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from './utils/redis.js';

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(503).json({ error: 'Service unavailable' });
  }

  const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const rateLimit = await checkRateLimit(`public-table:${clientIp}`, 120, 60);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(Math.ceil(rateLimit.resetMs / 1000)));
    return res.status(429).json({ error: 'Too many requests' });
  }

  try {
    if (req.method === 'GET') {
      const restaurantId = String(req.query.restaurantId || '').trim();
      const tableNumber = String(req.query.tableNumber || '').trim();
      if (!restaurantId || !tableNumber) {
        return res.status(400).json({ error: 'restaurantId and tableNumber are required' });
      }

      const { data: table, error } = await supabase
        .from('tables')
        .select('status')
        .eq('user_id', restaurantId)
        .eq('number', tableNumber)
        .maybeSingle();
      if (error) throw error;
      if (!table) return res.status(404).json({ error: 'Table not found' });

      return res.status(200).json({ status: table.status, occupied: table.status === 'OCUPADA' });
    }

    const token = String(req.body?.token || req.query.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Missing token' });

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('table_number, user_id')
      .eq('session_token', token)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order?.table_number || !order.user_id) {
      return res.status(404).json({ error: 'Active table session not found' });
    }

    const { error: updateError } = await supabase
      .from('tables')
      .update({ status: 'OCUPADA' })
      .eq('number', order.table_number)
      .eq('user_id', order.user_id);
    if (updateError) throw updateError;

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[API /public-table-occupied] Request failed:', error);
    return res.status(500).json({ error: 'Failed to process table status' });
  }
}
