import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

// Initialize Supabase client
const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-key'
);

// Main handler function
export default async function handler(req: any, res: any) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ type: "about:blank", title: "Method Not Allowed", status: 405, detail: `Method ${req.method} Not Allowed` });
  }

  try {
    // 1. Authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ type: "about:blank", title: "Unauthorized", status: 401, detail: 'Authorization header is missing or invalid.' });
    }
    const providedApiKey = authHeader.split(' ')[1];

    const restaurantId = req.body.restaurantId as string;

    if (!restaurantId) {
      return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: '`restaurantId` is required.' });
    }

    const { data: creds, error: credsError } = await supabase
      .from('store_integration_credentials')
      .select('external_api_key')
      .eq('store_id', restaurantId)
      .single();

    if (credsError || !creds || !creds.external_api_key) {
      return res.status(403).json({ type: "about:blank", title: "Forbidden", status: 403, detail: 'Invalid `restaurantId` or API key not configured.' });
    }

    if (providedApiKey !== creds.external_api_key) {
      return res.status(403).json({ type: "about:blank", title: "Forbidden", status: 403, detail: 'Invalid API key.' });
    }

    // 2. Main Logic
    const { driverId, latitude, longitude } = req.body;
    
    if (!driverId || typeof latitude !== 'number' || typeof longitude !== 'number') {
        return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: '`driverId` (string), `latitude` (number), and `longitude` (number) are required.' });
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
        return res.status(500).json({ type: "about:blank", title: "Internal Server Error", status: 500, detail: 'Failed to update driver location.' });
    }

    // Successfully updated, no body needed
    return res.status(204).end();

  } catch (error: any) {
    console.error('[API /delivery-location] Fatal error:', error);
    return res.status(500).json({ type: "about:blank", title: "Internal Server Error", status: 500, detail: error.message || 'An internal server error occurred.' });
  }
}