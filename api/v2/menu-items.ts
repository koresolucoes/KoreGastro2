import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    const { data: profile, error: profileError } = await supabase
      .from('company_profile')
      .select('external_api_key')
      .eq('user_id', restaurantId)
      .single();
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
  response.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
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
  } catch (error: any) {
    console.error('[API /v2/menu-items] Fatal error:', error);
    return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { itemId, isAvailable, categoryId } = req.query;

    if (itemId && typeof itemId === 'string') {
        const { data, error } = await supabase.from('recipes').select('*, categories(name)').eq('user_id', restaurantId).eq('id', itemId).single();
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
        p_restaurant_id: restaurantId,
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
    const { price, is_available } = req.body;
    const updatePayload: { [key: string]: any } = {};
    if (price !== undefined) updatePayload.price = price;
    if (is_available !== undefined) updatePayload.is_available = is_available;
    
    if (Object.keys(updatePayload).length === 0) {
        return res.status(400).json({ error: { message: 'At least one field to update (`price` or `is_available`) is required.' } });
    }

    const { data, error } = await supabase.from('recipes').update(updatePayload).eq('id', itemId).eq('user_id', restaurantId).select().single();
    if (error) {
        if (error.code === 'PGRST116') return res.status(404).json({ error: { message: `Menu item with id "${itemId}" not found.` } });
        throw error;
    }
    return res.status(200).json(data);
}
