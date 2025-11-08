import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { LeaveRequestType } from '../../src/models/db.models.js';

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
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
            default:
                response.setHeader('Allow', ['GET', 'POST']);
                response.status(405).json({ error: { message: `Method ${request.method} Not Allowed` } });
        }
    } catch (error: any) {
        console.error('[API /rh/ausencias] Fatal error:', error);
        return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
    }
}

async function handleGet(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { employeeId, start_date, end_date } = req.query;

    let query = supabase
        .from('leave_requests')
        .select('*, employees(name)')
        .eq('user_id', restaurantId);
    
    if (employeeId) query = query.eq('employee_id', employeeId as string);
    if (start_date) query = query.gte('start_date', start_date as string);
    if (end_date) query = query.lte('end_date', end_date as string);

    query = query.order('start_date', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    return res.status(200).json(data || []);
}

async function handlePost(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { employeeId, request_type, start_date, end_date, reason } = req.body;
    
    if (!employeeId || !request_type || !start_date || !end_date) {
        return res.status(400).json({ error: { message: '`employeeId`, `request_type`, `start_date`, and `end_date` are required.' } });
    }

    const validTypes: LeaveRequestType[] = ['Férias', 'Folga', 'Falta Justificada', 'Atestado'];
    if (!validTypes.includes(request_type)) {
        return res.status(400).json({ error: { message: `Invalid \`request_type\`. Must be one of: ${validTypes.join(', ')}` } });
    }

    const { data: newRequest, error } = await supabase
        .from('leave_requests')
        .insert({
            user_id: restaurantId,
            employee_id: employeeId,
            request_type: request_type,
            start_date: start_date,
            end_date: end_date,
            reason: reason || null,
            status: 'Pendente'
        })
        .select()
        .single();
    
    if (error) throw error;
    return res.status(201).json(newRequest);
}