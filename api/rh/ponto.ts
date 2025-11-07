import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { TimeClockEntry } from '../../src/models/db.models.js';

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
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
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
            case 'POST':
                await handlePost(request, response, restaurantId);
                break;
            case 'PATCH':
                await handlePatch(request, response, restaurantId);
                break;
            default:
                response.setHeader('Allow', ['GET', 'POST', 'PATCH']);
                response.status(405).json({ error: { message: `Method ${request.method} Not Allowed` } });
        }
    } catch (error: any) {
        console.error('[API /rh/ponto] Fatal error:', error);
        return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
    }
}

async function handleGet(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { data_inicio, data_fim, employeeId } = req.query;
    if (!data_inicio || !data_fim) {
        return res.status(400).json({ error: { message: '`data_inicio` and `data_fim` are required.' } });
    }
    
    let query = supabase.from('time_clock_entries')
        .select('*')
        .eq('user_id', restaurantId)
        .gte('clock_in_time', new Date(data_inicio as string).toISOString())
        .lte('clock_in_time', new Date(data_fim as string + 'T23:59:59').toISOString());
        
    if (employeeId) {
        query = query.eq('employee_id', employeeId as string);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return res.status(200).json(data || []);
}

async function handlePost(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    // This handler is now only for creating manual time entries.
    const entryData: Partial<TimeClockEntry> = req.body;
    if (!entryData.employee_id || !entryData.clock_in_time) {
        return res.status(400).json({ error: { message: '`employee_id` and `clock_in_time` are required.' } });
    }
    const { data, error } = await supabase.from('time_clock_entries').insert({ ...entryData, user_id: restaurantId }).select().single();
    if (error) throw error;
    return res.status(201).json(data);
}

async function handlePatch(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: { message: '`id` query parameter is required for PATCH.' } });
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