
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Employee } from '../../src/models/db.models.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder-key');

import { validateApiKey } from '../utils/api-key-auth.js';
import { remember, deleteCache, invalidateCachePattern } from '../utils/redis.js';

// ... (existing imports)

async function authenticate(req: VercelRequest): Promise<{ restaurantId: string | null, error?: any, status?: number, isApiKey?: boolean }> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { restaurantId: null, error: { message: 'Missing or invalid Authorization header.' }, status: 401 };
    }
    
    // Tenta primeiro como API Key
    const apiKeyResult = await validateApiKey(req);
    if (apiKeyResult.restaurantId) {
        return { ...apiKeyResult, isApiKey: true };
    }

    // Se falhar, tenta como Supabase Auth Token
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await (supabase.auth as any).getUser(token);
    
    if (authError || !user) {
        return { restaurantId: null, error: { message: 'Invalid or expired token.' }, status: 401 };
    }
    
    const restaurantId = (req.query.restaurantId || req.body.restaurantId) as string;
    // ... (rest of the existing Supabase Auth logic)
    return { restaurantId, isApiKey: false };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const auth = await authenticate(req);
    if (auth.error) {
        return res.status(auth.status!).json({ error: auth.error });
    }
    const restaurantId = auth.restaurantId!;

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
      case 'DELETE':
        await handleDelete(req, res, restaurantId);
        break;
      default:
        res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
        res.status(405).json({ error: "An error occurred" });
    }
  } catch (error: any) {
    console.error('[API /rh/funcionarios] Fatal error:', error);
    return res.status(500).json({ error: "An error occurred" });
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id, nocache } = req.query;

    if (id && typeof id === 'string') {
        const cacheKey = `employee:${restaurantId}:${id}`;
        const fetcher = async () => {
            const { data, error } = await supabase.from('employees').select('*, roles(name)').eq('user_id', restaurantId).eq('id', id).single();
            if (error) {
                if (error.code === 'PGRST116') return null;
                throw error;
            }
            return data;
        };

        const item = nocache === 'true' ? await fetcher() : await remember(cacheKey, 300, fetcher);
        if (!item) {
            return res.status(404).json({ error: "Employee not found" });
        }
        return res.status(200).json(item);
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const cursor = (req.query.cursor as string) || 'none';
    const listCacheKey = `employees:${restaurantId}:${limit}:${cursor}`;

    const fetchList = async () => {
        let query = supabase.from('employees').select('*, roles(name)').eq('user_id', restaurantId).is('deleted_at', null);
        if (req.query.cursor) query = query.gt('name', req.query.cursor as string);
        const { data, error } = await query.order('name').limit(limit);
        if (error) throw error;
        return data || [];
    };

    const employees = nocache === 'true' ? await fetchList() : await remember(listCacheKey, 300, fetchList);
    return res.status(200).json(employees);
}

async function handlePost(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const employeeData: Partial<Employee> = req.body;
    
    if (!employeeData.name || !employeeData.pin || !employeeData.role_id) {
        return res.status(400).json({ error: "An error occurred" });
    }

    const { data, error } = await supabase
        .from('employees')
        .insert({ ...employeeData, user_id: restaurantId })
        .select()
        .single();
    
    if (error) throw error;

    await invalidateCachePattern(`employees:${restaurantId}:*`);

    return res.status(201).json(data);
}

async function handlePatch(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: "An error occurred" });
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

    await Promise.all([
        deleteCache(`employee:${restaurantId}:${id}`),
        invalidateCachePattern(`employees:${restaurantId}:*`)
    ]);

    return res.status(200).json(data);
}

async function handleDelete(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: "An error occurred" });
    }
    
    const { error } = await supabase
        .from('employees')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', restaurantId);
        
    if (error) throw error;

    await Promise.all([
        deleteCache(`employee:${restaurantId}:${id}`),
        invalidateCachePattern(`employees:${restaurantId}:*`)
    ]);

    return res.status(204).end();
}
