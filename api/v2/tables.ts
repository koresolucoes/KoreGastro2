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
    const { data: profile, error: profileError } = await supabase
      .from('company_profile')
      .select('external_api_key')
      .eq('user_id', restaurantId)
      .single();
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
    console.error('[API /v2/tables] Fatal error:', error);
    return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse, restaurantId: string) {
  const { tableId } = req.query;

  if (tableId && typeof tableId === 'string') {
    const { data, error } = await supabase.from('tables').select('*').eq('user_id', restaurantId).eq('id', tableId).single();
    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ error: { message: `Table with id "${tableId}" not found.` } });
      throw error;
    }
    return res.status(200).json(data);
  }

  let query = supabase.from('tables').select('*').eq('user_id', restaurantId);
  if (req.query.hallId) query = query.eq('hall_id', req.query.hallId as string);
  if (req.query.status) query = query.eq('status', req.query.status as string);
  
  const { data, error } = await query.order('number', { ascending: true });
  if (error) throw error;
  return res.status(200).json(data || []);
}

async function handlePost(req: VercelRequest, res: VercelResponse, restaurantId: string) {
  const { number, hall_id, x = 50, y = 50, width = 80, height = 80 } = req.body;
  if (number === undefined || !hall_id) {
    return res.status(400).json({ error: { message: '`number` and `hall_id` are required fields.' } });
  }
  const { data, error } = await supabase.from('tables').insert({ user_id: restaurantId, number, hall_id, x, y, width, height, status: 'LIVRE' }).select().single();
  if (error) throw error;
  return res.status(201).json(data);
}

async function handlePatch(req: VercelRequest, res: VercelResponse, restaurantId: string) {
  const { tableId } = req.query;
  if (!tableId || typeof tableId !== 'string') {
    return res.status(400).json({ error: { message: 'A table `tableId` is required in the query parameters.' } });
  }
  const { number, hall_id, status, x, y, width, height, customer_count, employee_id } = req.body;
  const updatePayload: { [key: string]: any } = {};
  if (number !== undefined) updatePayload.number = number;
  if (hall_id !== undefined) updatePayload.hall_id = hall_id;
  if (status !== undefined) updatePayload.status = status;
  if (x !== undefined) updatePayload.x = x;
  if (y !== undefined) updatePayload.y = y;
  if (width !== undefined) updatePayload.width = width;
  if (height !== undefined) updatePayload.height = height;
  if (customer_count !== undefined) updatePayload.customer_count = customer_count;
  if (employee_id !== undefined) updatePayload.employee_id = employee_id;

  if (Object.keys(updatePayload).length === 0) {
    return res.status(400).json({ error: { message: 'At least one field to update is required.' } });
  }

  const { data, error } = await supabase.from('tables').update(updatePayload).eq('id', tableId).eq('user_id', restaurantId).select().single();
  if (error) {
    if (error.code === 'PGRST116') return res.status(404).json({ error: { message: `Table with id "${tableId}" not found.` } });
    throw error;
  }
  return res.status(200).json(data);
}

async function handleDelete(req: VercelRequest, res: VercelResponse, restaurantId: string) {
  const { tableId } = req.query;
  if (!tableId || typeof tableId !== 'string') {
    return res.status(400).json({ error: { message: 'A table `tableId` is required in the query parameters.' } });
  }
  const { error } = await supabase.from('tables').delete().eq('id', tableId).eq('user_id', restaurantId);
  if (error) throw error;
  return res.status(204).end();
}
