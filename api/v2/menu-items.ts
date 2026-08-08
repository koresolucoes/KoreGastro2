import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth, supabase } from '../utils/api-handler.js';
import { remember, deleteCache, invalidateCachePattern } from '../utils/redis.js';
import { z } from 'zod';

const menuItemPatchSchema = z.object({
  price: z.number().positive('Price must be positive').optional(),
  is_available: z.boolean().optional()
}).refine(data => data.price !== undefined || data.is_available !== undefined, {
  message: "At least one field to update (`price` or `is_available`) is required."
});

export default withAuth(async function handler(req: any, res: any, restaurantId: string) {
    switch (req.method) {
      case 'GET':
        await handleGet(req, res, restaurantId);
        break;
      case 'PATCH':
        await handlePatch(req, res, restaurantId);
        break;
      default:
        res.setHeader('Allow', ['GET', 'PATCH']);
        res.status(405).json({ type: "about:blank", title: "Method Not Allowed", status: 405, detail: `Method ${req.method} Not Allowed` });
    }
});

async function handleGet(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { itemId, isAvailable, categoryId, nocache } = req.query;

    if (itemId && typeof itemId === 'string') {
        const cacheKey = `menu_item:${restaurantId}:${itemId}`;
        const fetcher = async () => {
            const { data, error } = await supabase.from('recipes').select('*, categories(name)').eq('store_id', restaurantId).eq('id', itemId).single();
            if (error) {
                if (error.code === 'PGRST116') return null;
                throw error;
            }
            return data;
        };

        const item = nocache === 'true' ? await fetcher() : await remember(cacheKey, 300, fetcher);
        if (!item) {
            return res.status(404).json({ type: "about:blank", title: "Not Found", status: 404, detail: `Menu item with id "${itemId}" not found.` });
        }
        return res.status(200).json(item);
    }
    
    // --- List all menu items with stock status using RPC ---
    const p_is_available = isAvailable === 'true' ? true : (isAvailable === 'false' ? false : null);
    const p_category_id = typeof categoryId === 'string' ? categoryId : null;

    const listCacheKey = `menu_items:${restaurantId}:${p_is_available}:${p_category_id}`;

    const fetchList = async () => {
        let detailedMenu: any[] = [];
        const { data: rpcData1, error: rpcErr1 } = await supabase.rpc('get_menu_with_stock', {
            p_store_id: restaurantId,
            p_is_available: p_is_available,
            p_category_id: p_category_id
        });

        if (!rpcErr1 && rpcData1) {
            detailedMenu = rpcData1;
        } else {
            const { data: rpcData2, error: rpcErr2 } = await supabase.rpc('get_menu_with_stock', {
                p_restaurant_id: restaurantId,
                p_is_available: p_is_available,
                p_category_id: p_category_id
            });
            if (!rpcErr2 && rpcData2) {
                detailedMenu = rpcData2;
            } else {
                let query = supabase.from('recipes').select('*, categories(name)').or(`store_id.eq.${restaurantId},user_id.eq.${restaurantId}`);
                if (p_is_available !== null) query = query.eq('is_available', p_is_available);
                if (p_category_id) query = query.eq('category_id', p_category_id);
                const { data: recipesData, error: recipesError } = await query;
                if (recipesError) throw new Error(`Failed to fetch menu items: ${recipesError.message}`);
                detailedMenu = (recipesData || []).map((r: any) => ({ ...r, has_stock: true }));
            }
        }
        return detailedMenu;
    };

    const detailedMenu = nocache === 'true' ? await fetchList() : await remember(listCacheKey, 180, fetchList);

    return res.status(200).json(detailedMenu);
}


async function handlePatch(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { itemId } = req.query;
    if (!itemId || typeof itemId !== 'string') {
        return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: 'A menu item `itemId` is required in the query parameters.' });
    }
    
    const parsedBody = menuItemPatchSchema.safeParse(req.body);
    if (!parsedBody.success) {
        return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: 'Invalid req body' });
    }

    const updatePayload = parsedBody.data;

    const { data, error } = await supabase.from('recipes').update(updatePayload).eq('id', itemId).eq('store_id', restaurantId).select().single();
    if (error) {
        if (error.code === 'PGRST116') return res.status(404).json({ type: "about:blank", title: "Not Found", status: 404, detail: `Menu item with id "${itemId}" not found.` });
        throw error;
    }

    // Invalidate menu & catalog caches for this restaurant
    await Promise.all([
        deleteCache(`menu_item:${restaurantId}:${itemId}`),
        deleteCache(`catalog:${restaurantId}`),
        invalidateCachePattern(`menu_items:${restaurantId}:*`),
    ]);

    return res.status(200).json(data);
}
