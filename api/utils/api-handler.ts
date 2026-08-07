import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Logger } from './logger.js';

// Initialize Supabase client once
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    Logger.error('Missing Supabase environment variables');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-key'
);

// Define the type for our business logic handlers
export type ApiHandler = (req: VercelRequest, res: VercelResponse, restaurantId: string) => Promise<VercelResponse | void>;

/**
 * Middleware to handle CORS, Authentication, Correlation IDs, Latency Metrics, and Global Error Catching.
 * Reduces boilerplate in all API routes.
 */
export function withAuth(handler: ApiHandler) {
    return async (req: VercelRequest, res: VercelResponse) => {
        const startTime = Date.now();
        const traceId = (req.headers['x-request-id'] || req.headers['x-trace-id'] || ('trace_' + Math.random().toString(36).substring(2, 10))) as string;
        
        // 1. CORS & Observability Headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID, X-Trace-ID');
        res.setHeader('X-Trace-ID', traceId);

        // 2. Handle Preflight OPTIONS request
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        let restaurantId = (req.query.restaurantId || req.body?.restaurantId) as string || 'unknown';

        try {
            // 3. Authentication
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                Logger.warn('Unauthorized API Request: Missing Bearer token', {
                    endpoint: req.url,
                    method: req.method,
                    traceId,
                    restaurantId
                });
                return res.status(401).json({ type: "about:blank", title: "Unauthorized", status: 401, detail: 'Authorization header is missing or invalid.' });
            }
            
            const providedApiKey = authHeader.split(' ')[1];
            
            if (!restaurantId || restaurantId === 'unknown') {
                return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: '`restaurantId` is required in query or body.' });
            }

            const { data: profile, error: profileError } = await supabase
                .from('company_profile')
                .select('external_api_key')
                .eq('user_id', restaurantId)
                .single();

            if (profileError || !profile || !profile.external_api_key) {
                Logger.warn('Invalid restaurantId or unconfigured API key', {
                    endpoint: req.url,
                    method: req.method,
                    traceId,
                    restaurantId
                });
                return res.status(403).json({ type: "about:blank", title: "Forbidden", status: 403, detail: 'Invalid `restaurantId` or API key not configured.' });
            }

            if (providedApiKey !== profile.external_api_key) {
                Logger.warn('API Key mismatch attempt', {
                    endpoint: req.url,
                    method: req.method,
                    traceId,
                    restaurantId
                });
                return res.status(403).json({ type: "about:blank", title: "Forbidden", status: 403, detail: 'Invalid API key.' });
            }

            // 4. Check Admin routes
            if (req.url && req.url.includes('/admin/')) {
                const { data: userData } = await supabase.auth.admin.getUserById(restaurantId);
                if (userData && userData.user && userData.user.email) {
                    const { data: adminData } = await supabase
                        .from('system_admins')
                        .select('email')
                        .eq('email', userData.user.email)
                        .maybeSingle();
                    if (!adminData) {
                        return res.status(403).json({ type: "about:blank", title: "Forbidden", status: 403, detail: 'Forbidden: System Admin access required.' });
                    }
                } else {
                    return res.status(403).json({ type: "about:blank", title: "Forbidden", status: 403, detail: 'Forbidden: Could not verify system admin status.' });
                }
            }

            // 5. Execute the actual handler
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
            
            // 5. Global Error Handling (Hiding internal DB errors)
            const message = error.message || 'An internal server error occurred.';
            
            // Mask Supabase specific errors
            if (message.includes('PGRST116')) {
                return res.status(404).json({ type: "about:blank", title: "Not Found", status: 404, detail: 'Resource not found.' });
            }
            if (message.includes('duplicate key value')) {
                return res.status(409).json({ type: "about:blank", title: "Conflict", status: 409, detail: 'Resource already exists (Conflict).' });
            }

            return res.status(500).json({ type: "about:blank", title: "Internal Server Error", status: 500, detail: 'Internal Server Error' });
        }
    };
}

