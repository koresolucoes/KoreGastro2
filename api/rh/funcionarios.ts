
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder-key');

import { authenticateStoreRequest, setStoreApiCorsHeaders } from '../utils/store-auth.js';
import { remember, deleteCache, invalidateCachePattern } from '../utils/redis.js';

const EMPLOYEE_SAFE_COLUMNS = 'id,name,role,created_at,user_id,current_clock_in_id,salary_type,salary_rate,overtime_rate_multiplier,birth_date,cpf,rg,address,phone,emergency_contact_name,emergency_contact_phone,hire_date,termination_date,bank_details,role_id,photo_url,updated_at,deleted_at,pix_key,roles(name)';
const EMPLOYEE_WRITABLE_FIELDS = new Set([
    'name', 'pin', 'role', 'current_clock_in_id', 'salary_type', 'salary_rate',
    'overtime_rate_multiplier', 'birth_date', 'cpf', 'rg', 'address', 'phone',
    'emergency_contact_name', 'emergency_contact_phone', 'hire_date',
    'termination_date', 'bank_details', 'role_id', 'photo_url', 'pix_key'
]);

function employeeWritePayload(body: Record<string, unknown> = {}) {
    return Object.fromEntries(
        Object.entries(body).filter(([key, value]) => EMPLOYEE_WRITABLE_FIELDS.has(key) && value !== undefined)
    );
}

export default async function handler(req: any, res: any) {
  setStoreApiCorsHeaders(req, res, ['GET', 'POST', 'PATCH', 'DELETE']);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const auth = await authenticateStoreRequest(req);
    if (!auth.success) {
        return res.status(auth.status || 401).json({ error: auth.error });
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
        const cacheKey = `employee-safe:v2:${restaurantId}:${id}`;
        const fetcher = async () => {
            const { data, error } = await supabase.from('employees').select(EMPLOYEE_SAFE_COLUMNS).eq('user_id', restaurantId).eq('id', id).single();
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

    const requestedLimit = parseInt(req.query.limit as string) || 50;
    const limit = Math.min(Math.max(requestedLimit, 1), 100);
    const cursor = (req.query.cursor as string) || 'none';
    const listCacheKey = `employees-safe:v2:${restaurantId}:${limit}:${cursor}`;

    const fetchList = async () => {
        let query = supabase.from('employees').select(EMPLOYEE_SAFE_COLUMNS).eq('user_id', restaurantId).is('deleted_at', null);
        if (req.query.cursor) query = query.gt('name', req.query.cursor as string);
        const { data, error } = await query.order('name').limit(limit);
        if (error) throw error;
        return data || [];
    };

    const employees = nocache === 'true' ? await fetchList() : await remember(listCacheKey, 300, fetchList);
    return res.status(200).json(employees);
}

async function handlePost(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const employeeData = employeeWritePayload(req.body);
    
    if (!employeeData.name || typeof employeeData.pin !== 'string'
        || !/^\d{4,8}$/.test(employeeData.pin) || !employeeData.role_id) {
        return res.status(400).json({ error: "An error occurred" });
    }

    const { data, error } = await supabase
        .from('employees')
        .insert({ ...employeeData, user_id: restaurantId })
        .select(EMPLOYEE_SAFE_COLUMNS)
        .single();
    
    if (error) throw error;

    await Promise.all([
        invalidateCachePattern(`employees-safe:v2:${restaurantId}:*`),
        invalidateCachePattern(`employees:${restaurantId}:*`)
    ]);

    return res.status(201).json(data);
}

async function handlePatch(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: "An error occurred" });
    }
    
    const updateData = employeeWritePayload(req.body);
    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'No valid employee fields supplied' });
    }
    if (updateData.pin !== undefined && (typeof updateData.pin !== 'string' || !/^\d{4,8}$/.test(updateData.pin))) {
        return res.status(400).json({ error: 'PIN must contain 4 to 8 digits' });
    }
    
    const { data, error } = await supabase
        .from('employees')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', restaurantId)
        .select(EMPLOYEE_SAFE_COLUMNS)
        .single();
        
    if (error) throw error;

    await Promise.all([
        deleteCache(`employee-safe:v2:${restaurantId}:${id}`),
        deleteCache(`employee:${restaurantId}:${id}`),
        invalidateCachePattern(`employees-safe:v2:${restaurantId}:*`),
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
        deleteCache(`employee-safe:v2:${restaurantId}:${id}`),
        deleteCache(`employee:${restaurantId}:${id}`),
        invalidateCachePattern(`employees-safe:v2:${restaurantId}:*`),
        invalidateCachePattern(`employees:${restaurantId}:*`)
    ]);

    return res.status(204).end();
}
