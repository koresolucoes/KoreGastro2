
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST Request body interface
interface RequestBodyPost {
  restaurantId: string;
  tableNumber: number;
}

// Main handler function
export default async function handler(request: VercelRequest, response: VercelResponse) {
  // CORS headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    return response.status(204).end();
  }

  try {
    // 1. Authentication
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.status(401).json({ error: { message: 'Authorization header is missing or invalid.' } });
    }
    const providedApiKey = authHeader.split(' ')[1];

    const restaurantId = (request.query.restaurantId || request.body.restaurantId) as string;

    if (!restaurantId) {
      return response.status(400).json({ error: { message: '`restaurantId` is required.' } });
    }

    const { data: profile, error: profileError } = await supabase
      .from('company_profile')
      .select('external_api_key')
      .eq('user_id', restaurantId)
      .single();

    if (profileError || !profile || !profile.external_api_key) {
      return response.status(403).json({ error: { message: 'Invalid `restaurantId` or API key not configured.' } });
    }

    if (providedApiKey !== profile.external_api_key) {
      return response.status(403).json({ error: { message: 'Invalid API key.' } });
    }

    // 2. Method Routing
    switch (request.method) {
      case 'GET':
        await handleGet(request, response, restaurantId);
        break;
      case 'POST':
        await handlePost(request, response, restaurantId);
        break;
      default:
        response.setHeader('Allow', ['GET', 'POST']);
        return response.status(405).json({ error: { message: `Method ${request.method} Not Allowed` } });
    }

  } catch (error: any) {
    console.error('[API /account] Fatal error:', error);
    return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
  }
}

// --- Handler for GET requests ---
async function handleGet(request: VercelRequest, response: VercelResponse, restaurantId: string) {
    const { tableNumber } = request.query;

    if (tableNumber === undefined) {
        return response.status(400).json({ error: { message: '`tableNumber` query parameter is required.' } });
    }
    const numTableNumber = Number(tableNumber);
    if (isNaN(numTableNumber)) {
        return response.status(400).json({ error: { message: '`tableNumber` must be a valid number.' } });
    }

    // FIX: Use order() and limit(1) to get the most recent open order for the table,
    // preventing errors when multiple open orders exist for the same table.
    const { data: order, error } = await supabase
        .from('orders')
        .select(`
            id,
            table_number,
            customers ( name, phone ),
            order_items ( name, quantity, price, notes )
        `)
        .eq('user_id', restaurantId)
        .eq('table_number', numTableNumber)
        .eq('status', 'OPEN')
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();
    
    if (error) {
        if (error.code === 'PGRST116') { // Not found
            return response.status(404).json({ error: { message: `No open order found for table #${numTableNumber}.` } });
        }
        throw error;
    }
    
    const items = (order.order_items as any[]).map((item: any) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        total: item.quantity * item.price,
        notes: item.notes,
    }));

    const subtotal = items.reduce((acc: number, item: any) => acc + item.total, 0);
    const serviceFee = subtotal * 0.10; // Standard 10%
    const total = subtotal + serviceFee;
    
    const responsePayload = {
        orderId: order.id,
        tableNumber: order.table_number,
        customer: order.customers, // This will be the customer object or null
        items: items,
        summary: {
            subtotal: parseFloat(subtotal.toFixed(2)),
            serviceFee: parseFloat(serviceFee.toFixed(2)),
            total: parseFloat(total.toFixed(2)),
        }
    };
    
    return response.status(200).json(responsePayload);
}

// --- Handler for POST requests ---
async function handlePost(request: VercelRequest, response: VercelResponse, restaurantId: string) {
    const { tableNumber } = request.body as RequestBodyPost;

    if (tableNumber === undefined) {
      return response.status(400).json({ error: { message: '`tableNumber` is required in the request body.' } });
    }

    const { data: table, error: tableError } = await supabase
      .from('tables')
      .select('id, status')
      .eq('user_id', restaurantId)
      .eq('number', tableNumber)
      .single();

    if (tableError) {
        if (tableError.code === 'PGRST116') { // No rows found
            return response.status(404).json({ error: { message: `Table #${tableNumber} not found.` } });
        }
        throw tableError;
    }
    
    if (table.status !== 'OCUPADA') {
        return response.status(400).json({ error: { message: `Cannot request bill for table #${tableNumber}. Status is '${table.status}'.` } });
    }

    const { error: updateError } = await supabase
        .from('tables')
        .update({ status: 'PAGANDO' })
        .eq('id', table.id);

    if (updateError) {
        throw updateError;
    }

    return response.status(200).json({ success: true, message: `Table #${tableNumber} status updated to 'PAGANDO'.` });
}