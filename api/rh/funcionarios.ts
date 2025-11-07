import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Employee } from '../../src/models/db.models.js';

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
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
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
      case 'DELETE':
        await handleDelete(request, response, restaurantId);
        break;
      default:
        response.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
        response.status(405).json({ error: { message: `Method ${request.method} Not Allowed` } });
    }
  } catch (error: any) {
    console.error('[API /rh/funcionarios] Fatal error:', error);
    return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id } = req.query;

    if (id && typeof id === 'string') {
        const { data, error } = await supabase.from('employees').select('*, roles(name)').eq('user_id', restaurantId).eq('id', id).single();
        if (error) throw error;
        return res.status(200).json(data);
    }

    const { data, error } = await supabase.from('employees').select('*, roles(name)').eq('user_id', restaurantId).order('name');
    if (error) throw error;
    return res.status(200).json(data || []);
}

async function handlePost(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const employeeData: Partial<Employee> = req.body;
    
    if (!employeeData.name || !employeeData.pin || !employeeData.role_id) {
        return res.status(400).json({ error: { message: '`name`, `pin`, and `role_id` are required fields.' } });
    }

    const { data, error } = await supabase
        .from('employees')
        .insert({ ...employeeData, user_id: restaurantId })
        .select()
        .single();
    
    if (error) throw error;
    return res.status(201).json(data);
}

async function handlePatch(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: { message: '`id` query parameter is required for PATCH.' } });
    }
    
    const updateData: Partial<Employee> = req.body;
    
    const { data, error } = await supabase
        .from('employees')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', restaurantId)
        .select()
        .single();
        
    if (error) throw error;
    return res.status(200).json(data);
}

async function handleDelete(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: { message: '`id` query parameter is required for DELETE.' } });
    }
    
    const { error } = await supabase
        .from('employees')
        .delete()
        .eq('id', id)
        .eq('user_id', restaurantId);
        
    if (error) throw error;
    return res.status(204).end();
}
