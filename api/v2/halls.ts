import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Authenticates the request and retrieves the restaurant ID.
 * @param request The Vercel request object.
 * @returns An object with restaurantId on success, or error details on failure.
 */
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


// Main handler function
export default async function handler(request: VercelRequest, response: VercelResponse) {
  // CORS headers
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

    // Method Routing
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
    console.error('[API /v2/halls] Fatal error:', error);
    return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
  }
}

// --- Handler for GET requests ---
async function handleGet(req: VercelRequest, res: VercelResponse, restaurantId: string) {
  const { id, subresource } = req.query;

  if (id && typeof id === 'string') {
    if (subresource === 'tables') {
      // Get all tables for a specific hall
      const { data, error } = await supabase
        .from('tables')
        .select('*')
        .eq('user_id', restaurantId)
        .eq('hall_id', id);
      if (error) throw error;
      return res.status(200).json(data || []);
    } else {
      // Get a single hall by ID
      const { data, error } = await supabase
        .from('halls')
        .select('*')
        .eq('user_id', restaurantId)
        .eq('id', id)
        .single();
      if (error) {
        if (error.code === 'PGRST116') return res.status(404).json({ error: { message: `Hall with id "${id}" not found.` }});
        throw error;
      }
      return res.status(200).json(data);
    }
  }

  // Get all halls for the restaurant
  const { data, error } = await supabase
    .from('halls')
    .select('*')
    .eq('user_id', restaurantId)
    .order('created_at', { ascending: true });
  
  if (error) throw error;
  return res.status(200).json(data || []);
}

// --- Handler for POST requests ---
async function handlePost(req: VercelRequest, res: VercelResponse, restaurantId: string) {
  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: { message: '`name` is a required field.' } });
  }

  const { data: newHall, error } = await supabase
    .from('halls')
    .insert({ user_id: restaurantId, name: name })
    .select()
    .single();

  if (error) throw error;
  return res.status(201).json(newHall);
}

// --- Handler for PATCH requests ---
async function handlePatch(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id } = req.query;
    const { name } = req.body;

    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: { message: 'A hall `id` is required in the query parameters.' } });
    }
     if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: { message: 'A `name` is required in the request body.' } });
    }

    const { data: updatedHall, error } = await supabase
        .from('halls')
        .update({ name: name })
        .eq('id', id)
        .eq('user_id', restaurantId)
        .select()
        .single();
    
    if (error) {
        if (error.code === 'PGRST116') return res.status(404).json({ error: { message: `Hall with id "${id}" not found.` } });
        throw error;
    }
    return res.status(200).json(updatedHall);
}

// --- Handler for DELETE requests ---
async function handleDelete(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: { message: 'A hall `id` is required in the query parameters.' } });
    }
    
    // First, delete all tables within this hall
    const { error: tablesError } = await supabase
        .from('tables')
        .delete()
        .eq('hall_id', id)
        .eq('user_id', restaurantId);
    
    if (tablesError) {
        console.error(`Failed to delete tables for hall ${id}:`, tablesError);
        // We continue to try deleting the hall itself, but log the error.
    }

    // Then, delete the hall itself
    const { error } = await supabase
        .from('halls')
        .delete()
        .eq('id', id)
        .eq('user_id', restaurantId);

    if (error) throw error;

    return res.status(204).end();
}
