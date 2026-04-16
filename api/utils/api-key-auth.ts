import { VercelRequest } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder-key');

export async function validateApiKey(request: VercelRequest): Promise<{ restaurantId: string | null, error?: { message: string }, status?: number }> {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { restaurantId: null, error: { message: 'Authorization header is missing or invalid.' }, status: 401 };
    }
    
    const providedApiKey = authHeader.split(' ')[1];
    const restaurantId = (request.query.restaurantId || request.body.restaurantId) as string;
    
    if (!restaurantId) {
        return { restaurantId: null, error: { message: '`restaurantId` is required.' }, status: 400 };
    }

    const { data: profile, error: profileError } = await supabase
        .from('company_profile')
        .select('external_api_key')
        .eq('user_id', restaurantId)
        .single();

    if (profileError || !profile || !profile.external_api_key) {
        return { restaurantId: null, error: { message: 'Invalid `restaurantId` or API key not configured.' }, status: 403 };
    }

    if (providedApiKey !== profile.external_api_key) {
        return { restaurantId: null, error: { message: 'Invalid API key.' }, status: 403 };
    }
    
    return { restaurantId };
}
