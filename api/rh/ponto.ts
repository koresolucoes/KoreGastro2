
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { TimeClockEntry } from '../../src/models/db.models.js';
import { authenticateStoreRequest, setStoreApiCorsHeaders } from '../utils/store-auth.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder-key');

async function authenticateUser(req: VercelRequest, restaurantId: string): Promise<{ success: boolean; error?: any; status?: number }> {
    const auth = await authenticateStoreRequest(req, restaurantId);
    return { success: auth.success, error: auth.error, status: auth.status };
}

export default async function handler(req: any, res: any) {
    setStoreApiCorsHeaders(req, res, ['GET', 'POST', 'PATCH']);

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
            case 'PATCH':
                await handlePatch(req, res, restaurantId);
                break;
            default:
                res.setHeader('Allow', ['GET', 'POST', 'PATCH']);
                res.status(405).json({ type: "about:blank", title: "Method Not Allowed", status: 405, detail: `Method ${req.method} Not Allowed` });
        }
    } catch (error: any) {
        console.error('[API /rh/ponto] Fatal error:', error);
        return res.status(500).json({ type: "about:blank", title: "Internal Server Error", status: 500, detail: error.message || 'An internal server error occurred.' });
    }
}

async function handleGet(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { data_inicio, data_fim, employeeId } = req.query;
    if (!data_inicio || !data_fim) {
        return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: '`data_inicio` and `data_fim` are required.' });
    }
    
    let query = supabase.from('time_clock_entries')
        .select('*')
        .eq('user_id', restaurantId)
        .gte('clock_in_time', new Date((data_inicio as string) + 'T00:00:00').toISOString())
        .lte('clock_in_time', new Date((data_fim as string) + 'T23:59:59').toISOString());
        
    if (employeeId) {
        query = query.eq('employee_id', employeeId as string);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return res.status(200).json(data || []);
}

async function handlePost(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    // This handler is now only for creating manual time entries (admin action).
    const entryData: Partial<TimeClockEntry> = req.body;
    if (!entryData.employee_id || !entryData.clock_in_time) {
        return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: '`employee_id` and `clock_in_time` are required.' });
    }
    const { data, error } = await supabase.from('time_clock_entries').insert({ ...entryData, user_id: restaurantId }).select().single();
    if (error) throw error;
    return res.status(201).json(data);
}

async function handlePatch(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
        return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: '`id` query parameter is required for PATCH.' });
    }
    
    const updateData: Partial<TimeClockEntry> = req.body;
    const { data, error } = await supabase
        .from('time_clock_entries')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', restaurantId)
        .select()
        .single();
        
    if (error) throw error;
    return res.status(200).json(data);
}
