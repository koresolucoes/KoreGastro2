
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { authenticateStoreRequest, setStoreApiCorsHeaders } from '../utils/store-auth.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder-key');

// Helper para validar sessão do usuário e permissão na loja
async function authenticateUser(req: VercelRequest, restaurantId: string): Promise<{ success: boolean; error?: any; status?: number }> {
    const auth = await authenticateStoreRequest(req, restaurantId);
    return { success: auth.success, error: auth.error, status: auth.status };
}

export default async function handler(req: any, res: any) {
    setStoreApiCorsHeaders(req, res, ['GET', 'PUT']);

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    try {
        // 1. Obter ID da loja
        const restaurantId = (req.query.restaurantId || req.body.restaurantId) as string;
        if (!restaurantId) {
            return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: '`restaurantId` is required.' });
        }

        // 2. Autenticação Segura
        const auth = await authenticateUser(req, restaurantId);
        if (!auth.success) {
            return res.status(auth.status!).json({ error: auth.error });
        }

        switch (req.method) {
            case 'GET':
                await handleGet(req, res, restaurantId);
                break;
            case 'PUT':
                await handlePut(req, res, restaurantId);
                break;
            default:
                res.setHeader('Allow', ['GET', 'PUT']);
                res.status(405).json({ type: "about:blank", title: "Method Not Allowed", status: 405, detail: `Method ${req.method} Not Allowed` });
        }
    } catch (error: any) {
        console.error('[API /rh/cargos] Fatal error:', error);
        return res.status(500).json({ type: "about:blank", title: "Internal Server Error", status: 500, detail: error.message || 'An internal server error occurred.' });
    }
}

import { remember, invalidateCachePattern } from '../utils/redis.js';

async function handleGet(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id, subresource } = req.query;

    if (id && subresource === 'permissoes') {
        const roleId = id as string;
        const cacheKey = `role_permissions:${roleId}`;
        const permissions = await remember<string[]>(cacheKey, 300, async () => {
            const { data, error } = await supabase
                .from('role_permissions')
                .select('permission_key')
                .eq('role_id', roleId)
                .eq('user_id', restaurantId);
            
            if (error) throw error;
            return (data || []).map(p => p.permission_key);
        });
        
        return res.status(200).json(permissions);
    }

    const cacheKey = `roles:${restaurantId}`;
    const roles = await remember(cacheKey, 300, async () => {
        const { data, error } = await supabase.from('roles').select('*').eq('user_id', restaurantId);
        if (error) throw error;
        return data || [];
    });
    return res.status(200).json(roles);
}

async function handlePut(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id, subresource } = req.query;
    const { permissions } = req.body;

    if (id && subresource === 'permissoes' && Array.isArray(permissions)) {
        const roleId = id as string;

        // Delete existing permissions for the role
        const { error: deleteError } = await supabase.from('role_permissions').delete().eq('role_id', roleId).eq('user_id', restaurantId);
        if (deleteError) throw deleteError;

        // Insert new permissions if any
        if (permissions.length > 0) {
            const permissionsToInsert = permissions.map(key => ({
                role_id: roleId,
                permission_key: key,
                user_id: restaurantId,
            }));
            const { error: insertError } = await supabase.from('role_permissions').insert(permissionsToInsert);
            if (insertError) throw insertError;
        }

        // Invalidate cached role permissions
        await invalidateCachePattern(`role_permissions:${roleId}*`);
        await invalidateCachePattern(`roles:${restaurantId}*`);
        
        return res.status(200).json({ success: true, message: "Permissions updated." });
    }
    
    return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: 'Invalid req for PUT method.' });
}
