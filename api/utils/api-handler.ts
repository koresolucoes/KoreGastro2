import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Logger } from './logger.js';
import { validateApiKey } from './api-key-auth.js';
import { checkRateLimit } from './redis.js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('placeholder')) {
    Logger.error('Missing or placeholder Supabase environment variables');
    if (process.env.NODE_ENV === 'production') {
        throw new Error('FATAL: Configuração do Supabase ausente ou inválida em produção.');
    }
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-key'
);

// Define the type for our business logic handlers
export type ApiHandler = (req: VercelRequest, res: VercelResponse, restaurantId: string) => Promise<VercelResponse | void>;

const MAX_REQUESTS_PER_WINDOW = 120; // 120 requests per minute per restaurant/key

/**
 * Configure standard CORS headers restricted to app.chefos.online and authorized dev environments.
 */
export function setCorsHeaders(req: VercelRequest, res: VercelResponse) {
    const allowedOrigins = [
        'https://app.chefos.online',
        'http://app.chefos.online',
        process.env.FRONTEND_URL
    ].filter(Boolean);

    const requestOrigin = (req.headers.origin || req.headers.referer) as string | undefined;

    let originToSet: string | null = null;
    if (requestOrigin) {
        try {
            const url = new URL(requestOrigin);
            const host = url.hostname;
            if (
                host === 'app.chefos.online' ||
                host.endsWith('.chefos.online') ||
                host === 'localhost' ||
                host === '127.0.0.1' ||
                host.endsWith('.run.app') ||
                allowedOrigins.includes(requestOrigin)
            ) {
                originToSet = requestOrigin;
            }
        } catch {
            // Invalid origin URL
        }
    }

    if (originToSet) {
        res.setHeader('Access-Control-Allow-Origin', originToSet);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
        res.setHeader('Access-Control-Allow-Origin', 'https://app.chefos.online');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, X-Request-ID, X-Trace-ID, x-restaurant-id');
}

/**
 * Middleware to handle CORS, Authentication, Rate Limiting, Correlation IDs, Latency Metrics, and Global Error Catching.
 * Reduces boilerplate in all API routes.
 */
export function withAuth(handler: ApiHandler) {
    return async (req: VercelRequest, res: VercelResponse) => {
        const startTime = Date.now();
        const traceId = (req.headers['x-req-id'] || req.headers['x-trace-id'] || ('trace_' + Math.random().toString(36).substring(2, 10))) as string;
        
        // 1. CORS Headers
        setCorsHeaders(req, res);

        // 2. Preflight OPTIONS
        if (req.method === 'OPTIONS') {
            return res.status(204).end();
        }

        // 3. Authentication via API Key
        const authResult = await validateApiKey(req);
        if (!authResult.isValid || !authResult.restaurantId) {
            Logger.warn('Unauthorized API Request', {
                endpoint: req.url,
                method: req.method,
                traceId,
                error: authResult.error?.message
            });
            return res.status(authResult.status || 401).json({
                success: false,
                error: authResult.error?.message || 'Chave de API inválida ou não fornecida.'
            });
        }

        const restaurantId = authResult.restaurantId;

        // Rate limit check based on hashed API Key (or fallback to IP + restaurantId)
        const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';
        const limitKey = authResult.apiKeyHash
            ? `apikey:${authResult.apiKeyHash.slice(0, 16)}`
            : `ip:${clientIp}_${restaurantId}`;

        const { allowed, remaining, resetMs, isRedis } = await checkRateLimit(limitKey, MAX_REQUESTS_PER_WINDOW, 60);

        res.setHeader('X-RateLimit-Limit', MAX_REQUESTS_PER_WINDOW);
        res.setHeader('X-RateLimit-Remaining', remaining);
        res.setHeader('X-RateLimit-Reset', Math.ceil(resetMs / 1000));
        res.setHeader('X-RateLimit-Provider', isRedis ? 'Upstash-Redis' : 'Memory-Fallback');

        if (!allowed) {
            res.setHeader('Retry-After', Math.ceil(resetMs / 1000));
            Logger.warn('Rate limit exceeded', { endpoint: req.url, clientIp, restaurantId, traceId });
            return res.status(429).json({
                success: false,
                error: 'Muitas requisições. Tente novamente em alguns segundos.'
            });
        }

        try {
            // 4. Execute the actual handler
            await handler(req, res, restaurantId);

            const latencyMs = Date.now() - startTime;
            Logger.info('API Request completed', {
                endpoint: req.url,
                method: req.method,
                restaurantId,
                traceId,
                latencyMs,
                statusCode: res.statusCode || 200
            });

        } catch (error: any) {
            const latencyMs = Date.now() - startTime;
            Logger.error('[API Error]', error, {
                endpoint: req.url,
                method: req.method,
                restaurantId,
                traceId,
                latencyMs
            });
            
            // Mask Supabase / Internal DB errors
            const message = error.message || 'Erro interno no servidor.';
            if (message.includes('PGRST116')) {
                return res.status(404).json({ success: false, error: 'Recurso não encontrado.' });
            }
            if (message.includes('duplicate key value')) {
                return res.status(409).json({ success: false, error: 'Recurso já existente (Conflito).' });
            }

            return res.status(500).json({ success: false, error: 'Erro interno no servidor.' });
        }
    };
}


