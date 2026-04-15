import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

import { withAuth, supabase } from '../utils/api-handler.js';
import { z } from 'zod';

const menuItemPatchSchema = z.object({
  price: z.number().positive('Price must be positive').optional(),
  is_available: z.boolean().optional()
}).refine(data => data.price !== undefined || data.is_available !== undefined, {
  message: "At least one field to update (`price` or `is_available`) is required."
});

export default withAuth(async function handler(request: VercelRequest, response: VercelResponse, restaurantId: string) {
    switch (request.method) {
      case 'GET':
        await handleGet(request, response, restaurantId);
        break;
      case 'PATCH':
        await handlePatch(request, response, restaurantId);
        break;
      default:
        response.setHeader('Allow', ['GET', 'PATCH']);
        response.status(405).json({ error: { message: `Method ${request.method} Not Allowed` } });
    }
});

async function handleGet(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { itemId, isAvailable, categoryId } = req.query;

    if (itemId && typeof itemId === 'string') {
        const { data, error } = await supabase.from('recipes').select('*, categories(name)').eq('store_id', restaurantId).eq('id', itemId).single();
        if (error) {
            if (error.code === 'PGRST116') return res.status(404).json({ error: { message: `Menu item with id "${itemId}" not found.` } });
            throw error;
        }
        return res.status(200).json(data);
    }
    
    // --- List all menu items with stock status using RPC ---
    const p_is_available = isAvailable === 'true' ? true : (isAvailable === 'false' ? false : null);
    const p_category_id = typeof categoryId === 'string' ? categoryId : null;

    const { data: detailedMenu, error } = await supabase.rpc('get_menu_with_stock', {
        p_store_id: restaurantId,
        p_is_available: p_is_available,
        p_category_id: p_category_id
    });

    if (error) {
        throw new Error(`Failed to fetch menu data: ${error.message}`);
    }

    return res.status(200).json(detailedMenu);
}


async function handlePatch(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { itemId } = req.query;
    if (!itemId || typeof itemId !== 'string') {
        return res.status(400).json({ error: { message: 'A menu item `itemId` is required in the query parameters.' } });
    }
    
    const parsedBody = menuItemPatchSchema.safeParse(req.body);
    if (!parsedBody.success) {
        return res.status(400).json({ error: { message: 'Invalid request body', details: parsedBody.error.format() } });
    }

    const updatePayload = parsedBody.data;

    const { data, error } = await supabase.from('recipes').update(updatePayload).eq('id', itemId).eq('store_id', restaurantId).select().single();
    if (error) {
        if (error.code === 'PGRST116') return res.status(404).json({ error: { message: `Menu item with id "${itemId}" not found.` } });
        throw error;
    }
    return res.status(200).json(data);
}
