import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

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
    response.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (request.method === 'OPTIONS') {
        return response.status(204).end();
    }

    try {
        const { restaurantId, error, status } = await authenticateAndGetRestaurantId(request);
        if (error) {
            return response.status(status!).json({ error });
        }

        switch (request.method) {
            case 'GET':
                await handleGet(request, response, restaurantId);
                break;
            case 'PUT':
                await handlePut(request, response, restaurantId);
                break;
            default:
                response.setHeader('Allow', ['GET', 'PUT']);
                response.status(405).json({ error: { message: `Method ${request.method} Not Allowed` } });
        }
    } catch (error: any) {
        console.error('[API /rh/cargos] Fatal error:', error);
        return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
    }
}

async function handleGet(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id, subresource } = req.query;

    if (id && subresource === 'permissoes') {
        const { data, error } = await supabase
            .from('role_permissions')
            .select('permission_key')
            .eq('role_id', id as string);
        
        if (error) throw error;
        const permissions = (data || []).map(p => p.permission_key);
        return res.status(200).json(permissions);
    }

    const { data, error } = await supabase.from('roles').select('*').eq('user_id', restaurantId);
    if (error) throw error;
    return res.status(200).json(data || []);
}

async function handlePut(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id, subresource } = req.query;
    const { permissions } = req.body;

    if (id && subresource === 'permissoes' && Array.isArray(permissions)) {
        // Delete existing permissions for the role
        const { error: deleteError } = await supabase.from('role_permissions').delete().eq('role_id', id as string);
        if (deleteError) throw deleteError;

        // Insert new permissions if any
        if (permissions.length > 0) {
            const permissionsToInsert = permissions.map(key => ({
                role_id: id as string,
                permission_key: key,
                user_id: restaurantId,
            }));
            const { error: insertError } = await supabase.from('role_permissions').insert(permissionsToInsert);
            if (insertError) throw insertError;
        }
        
        return res.status(200).json({ success: true, message: "Permissions updated." });
    }
    
    return res.status(400).json({ error: { message: 'Invalid request for PUT method.' } });
}
