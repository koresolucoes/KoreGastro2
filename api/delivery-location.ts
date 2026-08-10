import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { authenticateStoreRequest, setStoreApiCorsHeaders } from './utils/store-auth.js';

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
  setStoreApiCorsHeaders(req, res, ['POST']);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ type: "about:blank", title: "Method Not Allowed", status: 405, detail: `Method ${req.method} Not Allowed` });
  }

  try {
    const restaurantId = req.body.restaurantId as string;

    if (!restaurantId) {
      return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: '`restaurantId` is required.' });
    }

    const auth = await authenticateStoreRequest(req, restaurantId);
    if (!auth.success) {
      return res.status(auth.status || 401).json({
        type: 'about:blank', title: auth.status === 403 ? 'Forbidden' : 'Unauthorized',
        status: auth.status || 401, detail: auth.error?.message || 'Authentication failed.'
      });
    }

    // 2. Main Logic
    const { driverId, latitude, longitude } = req.body;
    
    if (!driverId || typeof latitude !== 'number' || typeof longitude !== 'number'
      || !Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: '`driverId` (string), `latitude` (number), and `longitude` (number) are required.' });
    }

    const { data: updatedDriver, error: updateError } = await supabase
      .from('delivery_drivers')
      .update({
        last_latitude: latitude,
        last_longitude: longitude,
        last_updated_at: new Date().toISOString(),
      })
      .eq('id', driverId)
      .eq('user_id', restaurantId)
      .select('id')
      .maybeSingle();

    if (updateError) {
        // Log the error but don't expose too many details to the client
        console.error(`[API /delivery-location] Error updating driver ${driverId}:`, updateError);
        return res.status(500).json({ type: "about:blank", title: "Internal Server Error", status: 500, detail: 'Failed to update driver location.' });
    }

    if (!updatedDriver) {
      return res.status(404).json({ type: "about:blank", title: "Not Found", status: 404, detail: 'Driver not found.' });
    }

    // Successfully updated, no body needed
    return res.status(204).end();

  } catch (error: any) {
    console.error('[API /delivery-location] Fatal error:', error);
    return res.status(500).json({ type: "about:blank", title: "Internal Server Error", status: 500, detail: 'An internal server error occurred.' });
  }
}
