import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { ALL_PERMISSION_KEYS } from '../../src/config/permissions.js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function authenticateAndGetRestaurantId(request: VercelRequest): Promise<{ restaurantId: string; error?: { message: string }; status?: number }> {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { restaurantId: '', error: { message: 'Authorization header is missing or invalid.' }, status: 401 };
    }
    const providedApiKey = authHeader.split(' ')[1];
    const restaurantId = (request.query.restaurantId || request.body.restaurantId) as string;
    if (!restaurantId) {
        return { restaurantId: '', error: { message: '`restaurantId` is required.' }, status: 400 };
    }
    const { data: profile, error: profileError } = await supabase
      .from('company_profile')
      .select('external_api_key')
      .eq('user_id', restaurantId)
      .single();
    if (profileError || !profile || !profile.external_api_key) {
        return { restaurantId, error: { message: 'Invalid `restaurantId` or API key not configured.' }, status: 403 };
    }
    if (providedApiKey !== profile.external_api_key) {
        return { restaurantId, error: { message: 'Invalid API key.' }, status: 403 };
    }
    return { restaurantId };
}


export default async function handler(request: VercelRequest, response: VercelResponse) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (request.method === 'OPTIONS') {
        return response.status(204).end();
    }
    
    if (request.method !== 'GET') {
        response.setHeader('Allow', ['GET']);
        return response.status(405).json({ error: { message: 'Method Not Allowed' } });
    }

    try {
        const { error, status } = await authenticateAndGetRestaurantId(request);
        if (error) {
            return response.status(status!).json({ error });
        }
        
        return response.status(200).json(ALL_PERMISSION_KEYS);

    } catch (error: any) {
        console.error('[API /rh/permissoes-disponiveis] Fatal error:', error);
        return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
    }
}
