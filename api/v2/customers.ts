import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { Customer } from '../../src/models/db.models.js';
import { createHash, timingSafeEqual } from 'crypto';
import { Buffer } from 'buffer';
import { triggerWebhook } from '../webhook-emitter.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PUBLIC_CUSTOMER_COLUMNS = 'id, name, phone, email, cpf, notes, loyalty_points, user_id, created_at, address, latitude, longitude';

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

    if (request.method === 'POST' && request.query.action === 'login') {
        await handleLogin(request, response, restaurantId);
        return;
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
    console.error('[API /v2/customers] Fatal error:', error);
    return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse, restaurantId: string) {
  const { id, search } = req.query;

  if (id && typeof id === 'string') {
    const { data, error } = await supabase.from('customers').select(PUBLIC_CUSTOMER_COLUMNS).eq('user_id', restaurantId).eq('id', id).single();
    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ error: { message: `Customer with id "${id}" not found.` } });
      throw error;
    }
    return res.status(200).json(data);
  }

  if (search && typeof search === 'string') {
    const searchTerm = `%${search}%`;
    const { data, error } = await supabase.from('customers').select(PUBLIC_CUSTOMER_COLUMNS).eq('user_id', restaurantId).or(`name.ilike.${searchTerm},phone.ilike.${searchTerm},cpf.ilike.${searchTerm},email.ilike.${searchTerm}`);
    if (error) throw error;
    return res.status(200).json(data || []);
  }

  const { data, error } = await supabase.from('customers').select(PUBLIC_CUSTOMER_COLUMNS).eq('user_id', restaurantId).order('name', { ascending: true });
  if (error) throw error;
  return res.status(200).json(data || []);
}

const postCustomerSchema = z.object({
    name: z.string().min(1, "name is required"),
    phone: z.string().optional().nullable(),
    email: z.string().email("invalid email").optional().nullable(),
    cpf: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    latitude: z.number().optional().nullable(),
    longitude: z.number().optional().nullable(),
    loyalty_points: z.number().optional().nullable(),
    password: z.string().min(6, "password must be at least 6 characters").optional().nullable()
});

async function handlePost(req: VercelRequest, res: VercelResponse, restaurantId: string) {
  const parsed = postCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
      return res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.errors } });
  }
  const body = parsed.data;

  const orConditions = [body.cpf && `cpf.eq.${body.cpf}`, body.phone && `phone.eq.${body.phone}`].filter(Boolean);
  if (orConditions.length > 0) {
    const { data: existing, error } = await supabase.from('customers').select('id').eq('user_id', restaurantId).or(orConditions.join(',')).limit(1);
    if (error) throw error;
    if (existing && existing.length > 0) return res.status(409).json({ error: { message: 'A customer with this CPF or phone number already exists.' } });
  }

  let password_hash: string | null = null;
  if (body.password) {
      if (typeof body.password !== 'string' || body.password.length < 6) {
          return res.status(400).json({ error: { message: 'Password must be a string of at least 6 characters.' } });
      }
      password_hash = createHash('sha256').update(body.password).digest('hex');
  }

  const { data: newCustomer, error } = await supabase.from('customers').insert({
      user_id: restaurantId, name: body.name, phone: body.phone || null, email: body.email || null,
      cpf: body.cpf || null, notes: body.notes || null, address: body.address || null,
      latitude: body.latitude || null, longitude: body.longitude || null,
      loyalty_points: body.loyalty_points || 0, password_hash: password_hash
  }).select(PUBLIC_CUSTOMER_COLUMNS).single();

  if (error) throw error;
  
  await triggerWebhook(restaurantId, 'customer.created', newCustomer).catch(console.error);
  return res.status(201).json(newCustomer);
}

const patchCustomerSchema = z.object({
    name: z.string().min(1).optional(),
    phone: z.string().optional().nullable(),
    email: z.string().email().optional().nullable(),
    cpf: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    latitude: z.number().optional().nullable(),
    longitude: z.number().optional().nullable(),
    loyalty_points_change: z.number().optional(),
    description: z.string().optional(),
    password: z.string().min(6).optional()
}).refine(data => {
    if (data.loyalty_points_change !== undefined && !data.description) {
        return false;
    }
    return true;
}, { message: "description is required when loyalty_points_change is provided", path: ["description"] });

async function handlePatch(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: { message: 'A customer `id` is required in the query parameters.' } });
    }

    const parsed = patchCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.errors } });
    }
    const { loyalty_points_change, description, password, ...otherFields } = parsed.data;

    if (loyalty_points_change !== undefined) {
        const { data: customer, error: fetchError } = await supabase.from('customers').select('loyalty_points').eq('id', id).eq('user_id', restaurantId).single();
        if (fetchError) throw new Error(`Could not find customer: ${fetchError.message}`);
        
        const newPoints = (customer.loyalty_points || 0) + loyalty_points_change;
        const { data: updatedCustomer, error } = await supabase.from('customers').update({ loyalty_points: newPoints }).eq('id', id).select(PUBLIC_CUSTOMER_COLUMNS).single();
        if (error) throw new Error(`Could not update points: ${error.message}`);
        
        await supabase.from('loyalty_movements').insert({ user_id: restaurantId, customer_id: id, points_change: loyalty_points_change, description });
        return res.status(200).json(updatedCustomer);
    }

    const updatePayload: { [key: string]: any } = {};
    const allowedFields: (keyof Customer)[] = ['name', 'phone', 'email', 'cpf', 'notes', 'address', 'latitude', 'longitude'];
    allowedFields.forEach(field => { if (otherFields[field as keyof typeof otherFields] !== undefined) updatePayload[field] = otherFields[field as keyof typeof otherFields]; });

    if (password) {
        updatePayload.password_hash = createHash('sha256').update(password).digest('hex');
    }

    if (Object.keys(updatePayload).length > 0) {
        const { data, error } = await supabase.from('customers').update(updatePayload).eq('id', id).eq('user_id', restaurantId).select(PUBLIC_CUSTOMER_COLUMNS).single();
        if (error) throw error;
        return res.status(200).json(data);
    }
    
    return res.status(400).json({ error: { message: 'No valid update fields provided.' } });
}

async function handleDelete(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: { message: 'A customer `id` is required in the query parameters.' } });
    }
    const { error } = await supabase.from('customers').delete().eq('id', id).eq('user_id', restaurantId);
    if (error) throw error;
    return res.status(204).end();
}

async function handleLogin(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
        return res.status(400).json({ error: { message: '`identifier` (email, phone, or cpf) and `password` are required.' } });
    }
    const { data, error } = await supabase.from('customers').select('id, password_hash').eq('user_id', restaurantId).or(`email.eq.${identifier},phone.eq.${identifier},cpf.eq.${identifier}`).maybeSingle();
    if (error || !data || !data.password_hash) {
        return res.status(401).json({ error: { message: 'Invalid credentials.' } });
    }
    const passwordHash = createHash('sha256').update(password).digest('hex');
    try {
        if (timingSafeEqual(Buffer.from(passwordHash), Buffer.from(data.password_hash))) {
            const { data: publicData, error: publicError } = await supabase.from('customers').select(PUBLIC_CUSTOMER_COLUMNS).eq('id', data.id).single();
            if (publicError) throw publicError;
            return res.status(200).json(publicData);
        }
    } catch (e) { /* timingSafeEqual throws on different lengths */ }
    return res.status(401).json({ error: { message: 'Invalid credentials.' } });
}