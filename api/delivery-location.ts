import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    const restaurantId = request.body.restaurantId as string;

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

    // 2. Main Logic
    const { driverId, latitude, longitude } = request.body;
    
    if (!driverId || typeof latitude !== 'number' || typeof longitude !== 'number') {
        return response.status(400).json({ error: { message: '`driverId` (string), `latitude` (number), and `longitude` (number) are required.' } });
    }

    const { error: updateError } = await supabase
      .from('delivery_drivers')
      .update({
        last_latitude: latitude,
        last_longitude: longitude,
        last_updated_at: new Date().toISOString(),
      })
      .eq('id', driverId)
      .eq('user_id', restaurantId);

    if (updateError) {
        // Log the error but don't expose too many details to the client
        console.error(`[API /delivery-location] Error updating driver ${driverId}:`, updateError);
        return response.status(500).json({ error: { message: 'Failed to update driver location.' } });
    }

    // Successfully updated, no body needed
    return response.status(204).end();

  } catch (error: any) {
    console.error('[API /delivery-location] Fatal error:', error);
    return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
  }
}
