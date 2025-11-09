import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function authenticate(request: VercelRequest): Promise<{ restaurantId: string | null, error?: any, status?: number }> {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { restaurantId: null, error: { message: 'Authorization header is missing or invalid.' }, status: 401 };
    }
    const providedApiKey = authHeader.split(' ')[1];
    const restaurantId = (request.query.restaurantId || request.body.restaurantId) as string;

    if (!restaurantId) {
      return { restaurantId: null, error: { message: '`restaurantId` is required.' }, status: 400 };
    }

    const { data: profile, error: profileError } = await supabase
      .from('company_profile')
      .select('external_api_key')
      .eq('user_id', restaurantId)
      .single();

    if (profileError || !profile || !profile.external_api_key) {
      return { restaurantId: null, error: { message: 'Invalid `restaurantId` or API key not configured.' }, status: 403 };
    }

    if (providedApiKey !== profile.external_api_key) {
      return { restaurantId: null, error: { message: 'Invalid API key.' }, status: 403 };
    }
    
    return { restaurantId };
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    return response.status(204).end();
  }

  try {
    const { restaurantId, error, status } = await authenticate(request);
    if (error) {
        return response.status(status!).json({ error });
    }

    switch (request.method) {
      case 'GET':
        await handleGet(request, response, restaurantId!);
        break;
      // POST and PATCH can be added here in the future
      default:
        response.setHeader('Allow', ['GET']);
        response.status(405).json({ error: { message: `Method ${request.method} Not Allowed` } });
    }
  } catch (err: any) {
    console.error('[API /delivery] Fatal error:', err);
    return response.status(500).json({ error: { message: err.message || 'An internal server error occurred.' } });
  }
}


async function handleGet(request: VercelRequest, response: VercelResponse, restaurantId: string) {
  const { resource } = request.query;

  if (resource === 'drivers') {
    const { data, error } = await supabase
      .from('delivery_drivers')
      .select('id, name, phone, vehicle_type, is_active')
      .eq('user_id', restaurantId)
      .eq('is_active', true);
      
    if (error) throw error;
    return response.status(200).json(data || []);
  }

  if (resource === 'orders') {
    const { data, error } = await supabase
      .from('orders')
      .select('id, delivery_status, delivery_driver_id, customers(name, phone), order_items(name, quantity)')
      .eq('user_id', restaurantId)
      .eq('order_type', 'External-Delivery')
      .in('status', ['OPEN']) // Only active orders
      .order('timestamp', { ascending: true });

    if (error) throw error;
    return response.status(200).json(data || []);
  }

  return response.status(400).json({ error: { message: 'Invalid resource. Use ?resource=drivers or ?resource=orders' } });
}
