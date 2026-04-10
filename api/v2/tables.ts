import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

import { withAuth, supabase } from '../utils/api-handler.js';
import { z } from 'zod';

const tableSchema = z.object({
  number: z.number().int().positive('Table number must be a positive integer'),
  hall_id: z.string().uuid('Invalid hall_id format'),
  x: z.number().optional().default(50),
  y: z.number().optional().default(50),
  width: z.number().optional().default(80),
  height: z.number().optional().default(80),
  status: z.enum(['LIVRE', 'OCUPADA', 'RESERVADA', 'FECHANDO']).optional().default('LIVRE'),
  customer_count: z.number().int().nonnegative().optional(),
  employee_id: z.string().uuid().nullable().optional()
});

const tablePatchSchema = tableSchema.partial();

export default withAuth(async function handler(request: VercelRequest, response: VercelResponse, restaurantId: string) {
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
  const parsedBody = tableSchema.safeParse(req.body);
  if (!parsedBody.success) {
      return res.status(400).json({ error: { message: 'Invalid request body', details: parsedBody.error.format() } });
  }

  const { number, hall_id, x, y, width, height, status } = parsedBody.data;
  
  const { data, error } = await supabase.from('tables').insert({ user_id: restaurantId, number, hall_id, x, y, width, height, status }).select().single();
  if (error) throw error;
  return res.status(201).json(data);
}

async function handlePatch(req: VercelRequest, res: VercelResponse, restaurantId: string) {
  const { tableId } = req.query;
  if (!tableId || typeof tableId !== 'string') {
    return res.status(400).json({ error: { message: 'A table `tableId` is required in the query parameters.' } });
  }
  
  const parsedBody = tablePatchSchema.safeParse(req.body);
  if (!parsedBody.success) {
      return res.status(400).json({ error: { message: 'Invalid request body', details: parsedBody.error.format() } });
  }

  const updatePayload = parsedBody.data;

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
