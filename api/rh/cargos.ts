
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Helper para validar sessão do usuário e permissão na loja
async function authenticateUser(request: VercelRequest, restaurantId: string): Promise<{ success: boolean; error?: any; status?: number }> {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { success: false, error: { message: 'Missing or invalid Authorization header.' }, status: 401 };
    }
    const token = authHeader.split(' ')[1];

    // 1. Validar JWT
    // Using cast to any to fix type error 'Property getUser does not exist...'
    const { data: { user }, error: authError } = await (supabase.auth as any).getUser(token);
    if (authError || !user) {
        return { success: false, error: { message: 'Invalid or expired token.' }, status: 401 };
    }

    // 2. Verificar Permissão na Loja (Dono ou Gestor)
    if (user.id !== restaurantId) {
        const { data: perm } = await supabase
            .from('unit_permissions')
            .select('id')
            .eq('manager_id', user.id)
            .eq('store_id', restaurantId)
            .single();
        
        if (!perm) {
            return { success: false, error: { message: 'You do not have permission to access this store.' }, status: 403 };
        }
    }

    return { success: true };
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (request.method === 'OPTIONS') {
        return response.status(204).end();
    }

    try {
        // 1. Obter ID da loja
        const restaurantId = (request.query.restaurantId || request.body.restaurantId) as string;
        if (!restaurantId) {
            return response.status(400).json({ error: { message: '`restaurantId` is required.' } });
        }

        // 2. Autenticação Segura
        const auth = await authenticateUser(request, restaurantId);
        if (!auth.success) {
            return response.status(auth.status!).json({ error: auth.error });
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
