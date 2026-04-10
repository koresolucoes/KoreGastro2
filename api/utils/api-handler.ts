import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client once
const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Define the type for our business logic handlers
export type ApiHandler = (req: VercelRequest, res: VercelResponse, restaurantId: string) => Promise<VercelResponse | void>;

/**
 * Middleware to handle CORS, Authentication, and Global Error Catching.
 * Reduces boilerplate in all API routes.
 */
export function withAuth(handler: ApiHandler) {
    return async (req: VercelRequest, res: VercelResponse) => {
        // 1. CORS Headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        // 2. Handle Preflight OPTIONS request
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        try {
            // 3. Authentication
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: { message: 'Authorization header is missing or invalid.' } });
            }
            
            const providedApiKey = authHeader.split(' ')[1];
            const restaurantId = (req.query.restaurantId || req.body?.restaurantId) as string;
            
            if (!restaurantId) {
                return res.status(400).json({ error: { message: '\`restaurantId\` is required in query or body.' } });
            }

            const { data: profile, error: profileError } = await supabase
                .from('company_profile')
                .select('external_api_key')
                .eq('user_id', restaurantId)
                .single();

            if (profileError || !profile || !profile.external_api_key) {
                return res.status(403).json({ error: { message: 'Invalid \`restaurantId\` or API key not configured.' } });
            }

            if (providedApiKey !== profile.external_api_key) {
                return res.status(403).json({ error: { message: 'Invalid API key.' } });
            }

            // 4. Execute the actual handler
            await handler(req, res, restaurantId);

        } catch (error: any) {
            console.error('[API Error]', error);
            
            // 5. Global Error Handling (Hiding internal DB errors)
            const message = error.message || 'An internal server error occurred.';
            
            // Mask Supabase specific errors
            if (message.includes('PGRST116')) {
                return res.status(404).json({ error: { message: 'Resource not found.' } });
            }
            if (message.includes('duplicate key value')) {
                return res.status(409).json({ error: { message: 'Resource already exists (Conflict).' } });
            }

            return res.status(500).json({ error: { message: 'Internal Server Error' } });
        }
    };
}
