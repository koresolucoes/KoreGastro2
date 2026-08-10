
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { authenticateStoreRequest, setStoreApiCorsHeaders } from '../utils/store-auth.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder-key');

async function authenticateUser(req: VercelRequest, restaurantId: string): Promise<{ success: boolean; error?: any; status?: number }> {
    const auth = await authenticateStoreRequest(req, restaurantId);
    return { success: auth.success, error: auth.error, status: auth.status };
}

export default async function handler(req: any, res: any) {
    setStoreApiCorsHeaders(req, res, ['GET', 'POST']);

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    try {
        const restaurantId = (req.query.restaurantId || req.body.restaurantId) as string;
        if (!restaurantId) {
            return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: '`restaurantId` is required.' });
        }

        const auth = await authenticateUser(req, restaurantId);
        if (!auth.success) {
            return res.status(auth.status!).json({ error: auth.error });
        }

        switch (req.method) {
            case 'GET':
                await handleGet(req, res, restaurantId);
                break;
            case 'POST':
                await handlePost(req, res, restaurantId);
                break;
            default:
                res.setHeader('Allow', ['GET', 'POST']);
                res.status(405).json({ type: "about:blank", title: "Method Not Allowed", status: 405, detail: `Method ${req.method} Not Allowed` });
        }
    } catch (error: any) {
        console.error('[API /rh/escalas] Fatal error:', error);
        return res.status(500).json({ type: "about:blank", title: "Internal Server Error", status: 500, detail: error.message || 'An internal server error occurred.' });
    }
}

async function handleGet(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { data_inicio, data_fim } = req.query;
    if (!data_inicio || !data_fim) {
        return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: '`data_inicio` and `data_fim` are required.' });
    }

    const { data, error } = await supabase
        .from('schedules')
        .select('*, shifts(*, employees(name))')
        .eq('user_id', restaurantId)
        .gte('week_start_date', data_inicio as string)
        .lte('week_start_date', data_fim as string);

    if (error) throw error;
    return res.status(200).json(data || []);
}

async function handlePost(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id, subresource } = req.query;
    const { publish } = req.body;

    if (id && subresource === 'publicar' && typeof publish === 'boolean') {
        const { error } = await supabase
            .from('schedules')
            .update({ is_published: publish })
            .eq('id', id as string)
            .eq('user_id', restaurantId);

        if (error) throw error;
        return res.status(200).json({ success: true, message: `Schedule ${id} publish state set to ${publish}.` });
    }
    
    return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: 'Invalid req for POST method.' });
}
