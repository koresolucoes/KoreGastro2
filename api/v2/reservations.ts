import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function authenticateRequest(request: VercelRequest): Promise<{ restaurantId?: string; error?: { message: string }; status?: number }> {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { error: { message: 'Authorization header is missing or invalid.' }, status: 401 };
    }
    const providedApiKey = authHeader.split(' ')[1];
    const restaurantId = (request.query.restaurantId || request.body.restaurantId) as string;
    if (!restaurantId) {
        return { error: { message: '`restaurantId` is required.' }, status: 400 };
    }
    const { data: profile, error: profileError } = await supabase.from('company_profile').select('external_api_key').eq('user_id', restaurantId).single();
    if (profileError || !profile || !profile.external_api_key) {
        return { error: { message: 'Invalid `restaurantId` or API key not configured.' }, status: 403 };
    }
    if (providedApiKey !== profile.external_api_key) {
        return { error: { message: 'Invalid API key.' }, status: 403 };
    }
    return { restaurantId };
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    return response.status(204).end();
  }

  try {
    const authResult = await authenticateRequest(request);
    if (authResult.error) {
        return response.status(authResult.status!).json({ error: authResult.error });
    }
    const restaurantId = authResult.restaurantId!;

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
      case 'DELETE':
        await handleDelete(request, response, restaurantId);
        break;
      default:
        response.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
        response.status(405).json({ error: { message: `Method ${request.method} Not Allowed` } });
    }
  } catch (error: any) {
    console.error('[API /v2/reservations] Fatal error:', error);
    return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id, action, start_date, end_date } = req.query;

    if (action === 'availability') {
        return await handleGetAvailability(req, res, restaurantId);
    }

    if (id && typeof id === 'string') {
        const { data, error } = await supabase.from('reservations').select('*').eq('user_id', restaurantId).eq('id', id).single();
        if (error) {
            if (error.code === 'PGRST116') return res.status(404).json({ error: { message: `Reservation with id "${id}" not found.` } });
            throw error;
        }
        return res.status(200).json(data);
    }
    
    if (start_date && end_date) {
        const { data, error } = await supabase.from('reservations').select('*').eq('user_id', restaurantId)
            .gte('reservation_time', new Date(start_date as string).toISOString())
            .lte('reservation_time', new Date(end_date as string + 'T23:59:59').toISOString())
            .order('reservation_time', { ascending: true });
        if (error) throw error;
        return res.status(200).json(data || []);
    }
    
    return res.status(400).json({ error: { message: 'Missing required query parameters. Use `?action=availability`, `?id=...`, or `?start_date=...&end_date=...`.' } });
}

async function handleGetAvailability(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { date, party_size } = req.query;
    if (!date || typeof date !== 'string' || !party_size || isNaN(Number(party_size))) {
        return res.status(400).json({ error: { message: '`date` (YYYY-MM-DD) and `party_size` (number) are required.' } });
    }
    
    const { data: settings, error: settingsError } = await supabase.from('reservation_settings').select('*').eq('user_id', restaurantId).eq('is_enabled', true).single();
    if (settingsError || !settings) {
        return res.status(404).json({ error: { message: 'Reservation system not enabled for this restaurant.' } });
    }

    const partySizeNum = Number(party_size);
    if (partySizeNum < settings.min_party_size || partySizeNum > settings.max_party_size) {
        return res.status(400).json({ error: { message: `Party size must be between ${settings.min_party_size} and ${settings.max_party_size}.` } });
    }
    
    const startOfDay = new Date(date); startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(date); endOfDay.setUTCHours(23, 59, 59, 999);
    const { data: reservations, error } = await supabase.from('reservations').select('reservation_time').eq('user_id', restaurantId).gte('reservation_time', startOfDay.toISOString()).lte('reservation_time', endOfDay.toISOString()).in('status', ['PENDING', 'CONFIRMED']);
    if (error) throw error;

    const dayOfWeek = startOfDay.getUTCDay();
    const daySettings = settings.weekly_hours?.find((d: any) => d.day_of_week === dayOfWeek);
    if (!daySettings || daySettings.is_closed) return res.status(200).json({ availability: [] });

    const availableSlots: string[] = [];
    const opening = new Date(`1970-01-01T${daySettings.opening_time}Z`);
    let closing = new Date(`1970-01-01T${daySettings.closing_time}Z`);
    if (closing <= opening) closing.setDate(closing.getDate() + 1);

    const existingTimes = new Set(reservations.map(r => new Date(r.reservation_time).toISOString().substring(11, 16)));
    let current = opening;
    while (current < closing) {
        const timeStr = `${String(current.getUTCHours()).padStart(2, '0')}:${String(current.getUTCMinutes()).padStart(2, '0')}`;
        if (!existingTimes.has(timeStr)) {
            availableSlots.push(timeStr);
        }
        current = new Date(current.getTime() + settings.booking_duration_minutes * 60000);
    }
    return res.status(200).json({ availability: availableSlots });
}

async function handlePost(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { customer_name, party_size, reservation_time, notes, customer_phone, customer_email } = req.body;
    if (!customer_name || !party_size || !reservation_time) {
        return res.status(400).json({ error: { message: '`customer_name`, `party_size`, and `reservation_time` are required.' } });
    }
    const { data, error } = await supabase.from('reservations').insert({
        user_id: restaurantId, customer_name, party_size, reservation_time, notes, customer_phone, customer_email,
        status: 'PENDING'
    }).select().single();
    if (error) throw error;
    return res.status(201).json(data);
}

async function handlePatch(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: { message: 'A reservation `id` is required in the query parameters.' } });
    }
    const updatePayload = req.body;
    delete updatePayload.restaurantId;
    
    if (Object.keys(updatePayload).length === 0) {
        return res.status(400).json({ error: { message: 'At least one field to update is required.' } });
    }
    const { data, error } = await supabase.from('reservations').update(updatePayload).eq('id', id).eq('user_id', restaurantId).select().single();
    if (error) {
        if (error.code === 'PGRST116') return res.status(404).json({ error: { message: `Reservation with id "${id}" not found.` } });
        throw error;
    }
    return res.status(200).json(data);
}

async function handleDelete(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: { message: 'A reservation `id` is required in the query parameters.' } });
    }
    const { error } = await supabase.from('reservations').delete().eq('id', id).eq('user_id', restaurantId);
    if (error) throw error;
    return res.status(204).end();
}