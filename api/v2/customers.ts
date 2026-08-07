import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { Customer } from '../../src/models/db.models.js';
import bcrypt from 'bcryptjs';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { triggerWebhook } from '../webhook-emitter.js';

import { withAuth, supabase } from '../utils/api-handler.js';

const window = new JSDOM('').window;
const purify = DOMPurify(window as unknown as Window);

const PUBLIC_CUSTOMER_COLUMNS = 'id, name, phone, email, cpf, notes, loyalty_points, user_id, created_at, address, latitude, longitude';

export default withAuth(async function handler(request: VercelRequest, response: VercelResponse, restaurantId: string) {
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
});

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

  const limit = parseInt(req.query.limit as string) || 50;
  const cursor = req.query.cursor as string;

  let query = supabase.from('customers').select(PUBLIC_CUSTOMER_COLUMNS).eq('user_id', restaurantId).is('deleted_at', null);

  if (search && typeof search === 'string') {
    const searchTerm = `%${search}%`;
    query = query.or(`name.ilike.${searchTerm},phone.ilike.${searchTerm},cpf.ilike.${searchTerm},email.ilike.${searchTerm}`);
  }

  if (cursor) query = query.gt('name', cursor);
  const { data, error } = await query.order('name', { ascending: true }).limit(limit);
  
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
      return res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
  }
  const body = parsed.data;

  if (body.cpf || body.phone) {
    let existingCpf = null;
    let existingPhone = null;
    
    if (body.cpf) {
        const res = await supabase.from('customers').select('id').eq('user_id', restaurantId).eq('cpf', body.cpf).limit(1).maybeSingle();
        existingCpf = res.data;
    }
    if (body.phone) {
        const res = await supabase.from('customers').select('id').eq('user_id', restaurantId).eq('phone', body.phone).limit(1).maybeSingle();
        existingPhone = res.data;
    }

    if (existingCpf || existingPhone) {
        return res.status(409).json({ error: { message: 'A customer with this CPF or phone number already exists.' } });
    }
  }

  let password_hash: string | null = null;
  if (body.password) {
      if (typeof body.password !== 'string' || body.password.length < 6) {
          return res.status(400).json({ error: { message: 'Password must be a string of at least 6 characters.' } });
      }
      password_hash = await bcrypt.hash(body.password, 12);
  }

  const { data: newCustomer, error } = await supabase.from('customers').insert({
      user_id: restaurantId, name: purify.sanitize(body.name), phone: body.phone || null, email: body.email || null,
      cpf: body.cpf || null, notes: body.notes ? purify.sanitize(body.notes) : null, address: body.address ? purify.sanitize(body.address) : null,
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
        return res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
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
    allowedFields.forEach(field => { 
        if (otherFields[field as keyof typeof otherFields] !== undefined) {
            let value = otherFields[field as keyof typeof otherFields];
            if (typeof value === 'string' && (field === 'name' || field === 'notes' || field === 'address')) {
                value = purify.sanitize(value);
            }
            updatePayload[field] = value;
        } 
    });

    if (password) {
        updatePayload.password_hash = await bcrypt.hash(password, 12);
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
    const { error } = await supabase.from('customers').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('user_id', restaurantId);
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
    
    try {
        const isMatch = await bcrypt.compare(password, data.password_hash);
        if (isMatch) {
            const { data: publicData, error: publicError } = await supabase.from('customers').select(PUBLIC_CUSTOMER_COLUMNS).eq('id', data.id).single();
            if (publicError) throw publicError;
            return res.status(200).json(publicData);
        }
    } catch (e) {
        // Fallback for old sha256 hashes for seamless migration, or just fail
        // The issue description says "O Hash de Senhas Usa SHA-256 (Não bcrypt/Argon2)".
        // It's safer to just let it fail or handle if we want to migrate.
        // Assuming we just fail if compare throws or returns false.
    }
    return res.status(401).json({ error: { message: 'Invalid credentials.' } });
}