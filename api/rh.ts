
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { ALL_PERMISSION_KEYS } from '../src/config/permissions.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// --- CORS Wrapper ---
const allowCors = (fn: (req: VercelRequest, res: VercelResponse) => Promise<void | VercelResponse>) => async (req: VercelRequest, res: VercelResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  return await fn(req, res);
};

// --- Helper Functions ---
function handleError(response: VercelResponse, error: any, context: string) {
    console.error(`[API /api/rh.ts] Error in ${context}:`, error);
    const statusCode = error.code === 'PGRST116' ? 404 : 500;
    const message = error.code === 'PGRST116' ? 'Resource not found.' : error.message || 'An internal server error occurred.';
    return response.status(statusCode).json({ error: { message } });
}

// --- Main Handler ---
async function mainHandler(request: VercelRequest, response: VercelResponse) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.status(401).json({ error: { message: 'Authorization header is missing or invalid.' } });
    }
    const providedApiKey = authHeader.split(' ')[1];
    const restaurantId = (request.query.restaurantId || request.body.restaurantId) as string;

    if (!restaurantId) {
      return response.status(400).json({ error: { message: '`restaurantId` is required.' } });
    }

    const { data: profile, error: profileError } = await supabase
      .from('company_profile').select('external_api_key').eq('user_id', restaurantId).single();

    if (profileError || !profile || !profile.external_api_key || providedApiKey !== profile.external_api_key) {
      return response.status(403).json({ error: { message: 'Invalid `restaurantId` or API key.' } });
    }

    // This file handles collection-level endpoints
    const url = new URL(request.url!, `https://${request.headers.host}`);
    const path = url.pathname;

    if (path === '/api/rh/funcionarios') {
      return await handleFuncionarios(request, response, restaurantId);
    }
    if (path === '/api/rh/cargos') {
      return await handleCargos(request, response, restaurantId);
    }
    if (path === '/api/rh/permissoes-disponiveis') {
      return response.status(200).json(ALL_PERMISSION_KEYS);
    }
    if (path === '/api/rh/ponto') {
      return await handlePonto(request, response, restaurantId);
    }
    if (path === '/api/rh/escalas') {
      return await handleEscalas(request, response, restaurantId);
    }

    return response.status(404).json({ error: { message: 'Endpoint not found in this handler.' } });

  } catch (error) {
    return handleError(response, error, 'mainHandler in api/rh.ts');
  }
}

// --- Resource Handlers for Collections ---

async function handleFuncionarios(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    try {
        switch (req.method) {
            case 'GET':
                const { data, error } = await supabase.from('employees').select('*, roles(name)').eq('user_id', restaurantId).order('name');
                if (error) throw error;
                return res.status(200).json(data || []);
            case 'POST':
                const { data: newEmp, error: postError } = await supabase.from('employees').insert({ ...req.body, user_id: restaurantId }).select().single();
                if (postError) throw postError;
                return res.status(201).json(newEmp);
            default:
                res.setHeader('Allow', ['GET', 'POST']);
                res.status(405).end('Method Not Allowed');
        }
    } catch (error) {
        return handleError(res, error, 'handleFuncionarios');
    }
}

async function handleCargos(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    try {
        if (req.method === 'GET') {
            const { data, error } = await supabase.from('roles').select('*').eq('user_id', restaurantId);
            if (error) throw error;
            return res.status(200).json(data || []);
        }
        res.setHeader('Allow', ['GET']);
        res.status(405).end('Method Not Allowed');
    } catch(error) {
        return handleError(res, error, 'handleCargos');
    }
}

async function handlePonto(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { data_inicio, data_fim, employeeId } = req.query;
    try {
        if (req.method === 'GET') {
            let query = supabase.from('time_clock_entries').select('*, employees(name)').eq('user_id', restaurantId);
            if (data_inicio) query = query.gte('clock_in_time', `${data_inicio}T00:00:00`);
            if (data_fim) query = query.lte('clock_in_time', `${data_fim}T23:59:59`);
            if (employeeId) query = query.eq('employee_id', employeeId as string);
            const { data, error } = await query.order('clock_in_time', { ascending: false });
            if (error) throw error;
            return res.status(200).json(data || []);
        }
        if (req.method === 'POST') {
            const { data: newEntry, error } = await supabase.from('time_clock_entries').insert({ ...req.body, user_id: restaurantId }).select().single();
            if (error) throw error;
            return res.status(201).json(newEntry);
        }
        res.setHeader('Allow', ['GET', 'POST']);
        res.status(405).end('Method Not Allowed');
    } catch (error) {
        return handleError(res, error, 'handlePonto');
    }
}

async function handleEscalas(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    try {
        if (req.method === 'GET') {
            let query = supabase.from('schedules').select('*, shifts(*)').eq('user_id', restaurantId);
            if(req.query.data_inicio) query = query.gte('week_start_date', req.query.data_inicio as string);
            if(req.query.data_fim) query = query.lte('week_start_date', req.query.data_fim as string);
            const { data, error } = await query;
            if(error) throw error;
            return res.status(200).json(data || []);
        }
        res.setHeader('Allow', ['GET']);
        res.status(405).end('Method Not Allowed');
    } catch (error) {
        return handleError(res, error, 'handleEscalas');
    }
}

export default allowCors(mainHandler);
