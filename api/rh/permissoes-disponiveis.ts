
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { ALL_PERMISSION_KEYS } from '../../src/config/permissions.js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function authenticateUser(request: VercelRequest): Promise<{ success: boolean; error?: any; status?: number }> {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { success: false, error: { message: 'Missing or invalid Authorization header.' }, status: 401 };
    }
    const token = authHeader.split(' ')[1];
    
    // Simples verificação se o token é válido para qualquer usuário, pois a lista de permissões é estática e global.
    const { data: { user }, error: authError } = await (supabase.auth as any).getUser(token);
    if (authError || !user) {
        return { success: false, error: { message: 'Invalid or expired token.' }, status: 401 };
    }

    return { success: true };
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
        const auth = await authenticateUser(request);
        if (!auth.success) {
            return response.status(auth.status!).json({ error: auth.error });
        }
        
        return response.status(200).json(ALL_PERMISSION_KEYS);

    } catch (error: any) {
        console.error('[API /rh/permissoes-disponiveis] Fatal error:', error);
        return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
    }
}
