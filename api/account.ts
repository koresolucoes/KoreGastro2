import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Request body interface
interface RequestBody {
  restaurantId: string;
  tableNumber: number;
}

// Main handler function
export default async function handler(request: VercelRequest, response: VercelResponse) {
  // CORS headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    return response.status(204).end();
  }

  if (request.method !== 'POST') {
      response.setHeader('Allow', ['POST']);
      return response.status(405).json({ error: { message: `Method ${request.method} Not Allowed` } });
  }

  try {
    // 1. Authentication
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.status(401).json({ error: { message: 'Authorization header is missing or invalid.' } });
    }
    const providedApiKey = authHeader.split(' ')[1];

    const { restaurantId, tableNumber } = request.body as RequestBody;

    if (!restaurantId || tableNumber === undefined) {
      return response.status(400).json({ error: { message: '`restaurantId` and `tableNumber` are required.' } });
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

    // 2. Logic to request the bill
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

  } catch (error: any) {
    console.error('[API /account] Fatal error:', error);
    return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
  }
}
