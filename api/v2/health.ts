import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Logger } from '../utils/logger.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-key'
);

export interface HealthCheckItem {
  status: 'ok' | 'degraded' | 'error';
  latencyMs?: number;
  message?: string;
  details?: Record<string, any>;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Trace-ID');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const startTime = Date.now();
  const traceId = (req.headers['x-trace-id'] as string) || 'health_' + Date.now();
  const checks: Record<string, HealthCheckItem> = {};

  // 1. Database Connectivity & Query Latency
  try {
    const dbStart = Date.now();
    const { data, error } = await supabase.from('plans').select('id').limit(1);
    const dbLatency = Date.now() - dbStart;
    
    if (error && !error.message.includes('PGRST116')) {
      checks.database = { 
        status: 'error', 
        latencyMs: dbLatency, 
        message: `Database error: ${error.message}` 
      };
    } else {
      checks.database = { 
        status: dbLatency > 1200 ? 'degraded' : 'ok', 
        latencyMs: dbLatency,
        message: dbLatency > 1200 ? 'High database latency detected (>1200ms)' : 'Database operational'
      };
    }
  } catch (err: any) {
    checks.database = { status: 'error', message: err?.message || 'Database connection failed' };
  }

  // 2. Auth Service Status
  try {
    const authStart = Date.now();
    const { error } = await supabase.auth.getSession();
    const authLatency = Date.now() - authStart;
    if (error) {
      checks.auth = { status: 'degraded', latencyMs: authLatency, message: error.message };
    } else {
      checks.auth = { status: 'ok', latencyMs: authLatency, message: 'Auth service active' };
    }
  } catch (err: any) {
    checks.auth = { status: 'error', message: err?.message || 'Auth check failed' };
  }

  // 3. Storage Bucket Ping
  try {
    const storageStart = Date.now();
    const { error } = await supabase.storage.listBuckets();
    const storageLatency = Date.now() - storageStart;
    if (error) {
      checks.storage = { status: 'degraded', latencyMs: storageLatency, message: error.message };
    } else {
      checks.storage = { status: 'ok', latencyMs: storageLatency, message: 'Storage service accessible' };
    }
  } catch (err: any) {
    checks.storage = { status: 'degraded', message: err?.message || 'Storage check unavailable' };
  }

  // 4. Core Environment & Secrets Integrity
  const missingCoreEnv: string[] = [];
  if (!process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) missingCoreEnv.push('SUPABASE_URL');
  if (!process.env.GEMINI_API_KEY) missingCoreEnv.push('GEMINI_API_KEY');

  checks.environment = {
    status: missingCoreEnv.length > 0 ? 'degraded' : 'ok',
    message: missingCoreEnv.length > 0 
      ? `Missing core variables: ${missingCoreEnv.join(', ')}` 
      : 'All primary environment secrets present'
  };

  // 5. External Integrations Configuration
  const integrationsList = {
    mercadoPago: !!process.env.MERCADOPAGO_ACCESS_TOKEN,
    focusNFe: !!process.env.FOCUS_NFE_TOKEN,
    iFood: !!(process.env.IFOOD_CLIENT_ID || process.env.IFOOD_CLIENT_SECRET),
    cielo: !!process.env.CIELO_MERCHANT_ID,
    whatsApp: !!(process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_PHONE_ID)
  };

  const configuredCount = Object.values(integrationsList).filter(Boolean).length;
  checks.integrations = {
    status: 'ok',
    message: `${configuredCount}/5 external integrations configured`,
    details: integrationsList
  };

  const totalLatencyMs = Date.now() - startTime;
  const isError = Object.values(checks).some(c => c.status === 'error');
  const isDegraded = Object.values(checks).some(c => c.status === 'degraded') || totalLatencyMs > 2500;

  const overallStatus = isError ? 'unhealthy' : (isDegraded ? 'degraded' : 'healthy');
  const httpStatus = isError ? 503 : (isDegraded ? 207 : 200);

  const responseBody = {
    status: overallStatus,
    app: 'ChefOS',
    version: '2.1.0',
    timestamp: new Date().toISOString(),
    traceId,
    latencyMs: totalLatencyMs,
    sloStatus: totalLatencyMs < 2000 ? 'MEETS_SLO' : 'SLO_BREACH_WARNING',
    checks,
    system: {
      nodeVersion: process.version,
      uptimeSeconds: Math.floor(process.uptime()),
      memoryUsageMB: Math.round(process.memoryUsage().rss / 1024 / 1024)
    }
  };

  if (isError) {
    Logger.error('Health check reported UNHEALTHY status', undefined, { traceId, latencyMs: totalLatencyMs, checks });
  } else if (isDegraded) {
    Logger.warn('Health check reported DEGRADED status', { traceId, latencyMs: totalLatencyMs, checks });
  }

  return res.status(httpStatus).json(responseBody);
}

