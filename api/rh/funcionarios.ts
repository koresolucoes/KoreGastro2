
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Employee } from '../../src/models/db.models.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder-key');

import { validateApiKey } from '../utils/api-key-auth.js';

// ... (existing imports)

async function authenticate(request: VercelRequest): Promise<{ restaurantId: string | null, error?: any, status?: number, isApiKey?: boolean }> {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { restaurantId: null, error: { message: 'Missing or invalid Authorization header.' }, status: 401 };
    }
    
    // Tenta primeiro como API Key
    const apiKeyResult = await validateApiKey(request);
    if (apiKeyResult.restaurantId) {
        return { ...apiKeyResult, isApiKey: true };
    }

    // Se falhar, tenta como Supabase Auth Token
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await (supabase.auth as any).getUser(token);
    
    if (authError || !user) {
        return { restaurantId: null, error: { message: 'Invalid or expired token.' }, status: 401 };
    }
    
    const restaurantId = (request.query.restaurantId || request.body.restaurantId) as string;
    // ... (rest of the existing Supabase Auth logic)
    return { restaurantId, isApiKey: false };
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    return response.status(204).end();
  }

  try {
    const auth = await authenticate(request);
    if (auth.error) {
        return response.status(auth.status!).json({ error: auth.error });
    }
    const restaurantId = auth.restaurantId!;

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
        res.status(405).json({ type: "about:blank", title: "Method Not Allowed", status: 405, detail: `Method ${request.method} Not Allowed` });
    }
  } catch (error: any) {
    console.error('[API /rh/funcionarios] Fatal error:', error);
    return res.status(500).json({ type: "about:blank", title: "Internal Server Error", status: 500, detail: error.message || 'An internal server error occurred.' });
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id } = req.query;

    if (id && typeof id === 'string') {
        const { data, error } = await supabase.from('employees').select('*, roles(name)').eq('user_id', restaurantId).eq('id', id).single();
        if (error) throw error;
        return res.status(200).json(data);
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const cursor = req.query.cursor as string;
    let query = supabase.from('employees').select('*, roles(name)').eq('user_id', restaurantId).is('deleted_at', null);
    if (cursor) query = query.gt('name', cursor);
    const { data, error } = await query.order('name').limit(limit);
    if (error) throw error;
    return res.status(200).json(data || []);
}

async function handlePost(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const employeeData: Partial<Employee> = req.body;
    
    if (!employeeData.name || !employeeData.pin || !employeeData.role_id) {
        return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: '`name` });
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
        return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: '`id` query parameter is required for PATCH.' });
    }
    
    const updateData: Partial<Employee> = req.body;
    // Prevent accidental override of tenant ID
    delete (updateData as any).user_id;
    
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
        return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: '`id` query parameter is required for DELETE.' });
    }
    
    const { error } = await supabase
        .from('employees')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', restaurantId);
        
    if (error) throw error;
    return res.status(204).end();
}
