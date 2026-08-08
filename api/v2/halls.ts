import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

import { withAuth, supabase } from '../utils/api-handler.js';
import { remember, deleteCache, invalidateCachePattern } from '../utils/redis.js';
import { z } from 'zod';

const hallSchema = z.object({
  name: z.string().min(1, 'Name is required'),
});

// Main handler function
export default withAuth(async function handler(req: any, res: any, restaurantId: string) {
    // Method Routing
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
        res.status(405).json({ type: "about:blank", title: "Method Not Allowed", status: 405, detail: `Method ${req.method} Not Allowed` });
    }
});

// --- Handler for GET requests ---
async function handleGet(req: VercelRequest, res: VercelResponse, restaurantId: string) {
  const { id, subresource, nocache } = req.query;

  if (id && typeof id === 'string') {
    if (subresource === 'tables') {
      const cacheKey = `hall_tables:${restaurantId}:${id}`;
      const fetcher = async () => {
        const { data, error } = await supabase
          .from('tables')
          .select('*')
          .eq('user_id', restaurantId)
          .eq('hall_id', id);
        if (error) throw error;
        return data || [];
      };

      const tables = nocache === 'true' ? await fetcher() : await remember(cacheKey, 300, fetcher);
      return res.status(200).json(tables);
    } else {
      const cacheKey = `hall:${restaurantId}:${id}`;
      const fetcher = async () => {
        const { data, error } = await supabase
          .from('halls')
          .select('*')
          .eq('user_id', restaurantId)
          .eq('id', id)
          .single();
        if (error) {
          if (error.code === 'PGRST116') return null;
          throw error;
        }
        return data;
      };

      const hall = nocache === 'true' ? await fetcher() : await remember(cacheKey, 300, fetcher);
      if (!hall) {
        return res.status(404).json({ type: "about:blank", title: "Not Found", status: 404, detail: `Hall with id "${id}" not found.` });
      }
      return res.status(200).json(hall);
    }
  }

  // Get all halls for the restaurant
  const limit = parseInt(req.query.limit as string) || 50;
  const cursor = (req.query.cursor as string) || 'none';
  const listCacheKey = `halls:${restaurantId}:${limit}:${cursor}`;

  const fetchList = async () => {
    let query = supabase.from('halls').select('*').eq('user_id', restaurantId).is('deleted_at', null);
    if (req.query.cursor) query = query.gt('created_at', req.query.cursor as string);

    const { data, error } = await query.order('created_at', { ascending: true }).limit(limit);
    if (error) throw error;
    return data || [];
  };

  const halls = nocache === 'true' ? await fetchList() : await remember(listCacheKey, 300, fetchList);
  return res.status(200).json(halls);
}

// --- Handler for POST requests ---
async function handlePost(req: VercelRequest, res: VercelResponse, restaurantId: string) {
  const parsedBody = hallSchema.safeParse(req.body);
  if (!parsedBody.success) {
      return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: 'Invalid req body' });
  }

  const { name } = parsedBody.data;

  const { data: newHall, error } = await supabase
    .from('halls')
    .insert({ user_id: restaurantId, name: name })
    .select()
    .single();

  if (error) throw error;

  await invalidateCachePattern(`halls:${restaurantId}:*`);

  return res.status(201).json(newHall);
}

// --- Handler for PATCH requests ---
async function handlePatch(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
        return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: 'A hall `id` is required in the query parameters.' });
    }

    const parsedBody = hallSchema.safeParse(req.body);
    if (!parsedBody.success) {
        return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: 'Invalid req body' });
    }

    const { name } = parsedBody.data;

    const { data: updatedHall, error } = await supabase
        .from('halls')
        .update({ name: name })
        .eq('id', id)
        .eq('user_id', restaurantId)
        .select()
        .single();
    
    if (error) {
        if (error.code === 'PGRST116') return res.status(404).json({ type: "about:blank", title: "Not Found", status: 404, detail: `Hall with id "${id}" not found.` });
        throw error;
    }

    await Promise.all([
      deleteCache(`hall:${restaurantId}:${id}`),
      invalidateCachePattern(`halls:${restaurantId}:*`)
    ]);

    return res.status(200).json(updatedHall);
}

// --- Handler for DELETE requests ---
async function handleDelete(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
        return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: 'A hall `id` is required in the query parameters.' });
    }
    
    // First, delete all tables within this hall
    const { error: tablesError } = await supabase
        .from('tables')
        .update({ deleted_at: new Date().toISOString() })
        .eq('hall_id', id)
        .eq('user_id', restaurantId);
    
    if (tablesError) {
        console.error(`Failed to delete tables for hall ${id}:`, tablesError);
    }

    // Then, delete the hall itself
    const { error } = await supabase
        .from('halls')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', restaurantId);

    if (error) throw error;

    await Promise.all([
      deleteCache(`hall:${restaurantId}:${id}`),
      deleteCache(`hall_tables:${restaurantId}:${id}`),
      invalidateCachePattern(`halls:${restaurantId}:*`),
      invalidateCachePattern(`tables:${restaurantId}:*`)
    ]);

    return res.status(204).end();
}
