
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { ALL_PERMISSION_KEYS } from '../../src/config/permissions.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder-key');

async function authenticateUser(req: VercelRequest): Promise<{ success: boolean; error?: any; status?: number }> {
    const authHeader = req.headers.authorization;
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

export default async function handler(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ type: "about:blank", title: "Method Not Allowed", status: 405, detail: 'Method Not Allowed' });
    }

    try {
        const auth = await authenticateUser(req);
        if (!auth.success) {
            return res.status(auth.status!).json({ error: auth.error });
        }
        
        return res.status(200).json(ALL_PERMISSION_KEYS);

    } catch (error: any) {
        console.error('[API /rh/permissoes-disponiveis] Fatal error:', error);
        return res.status(500).json({ type: "about:blank", title: "Internal Server Error", status: 500, detail: error.message || 'An internal server error occurred.' });
    }
}
