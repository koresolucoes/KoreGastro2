import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { triggerWebhook } from './webhook-emitter.js';
import { WebhookEvent } from '../src/models/db.models.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(request: VercelRequest, response: VercelResponse) {
  // CORS headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    return response.status(204).end();
  }

  if (request.method !== 'POST') {
    return response.status(405).json({ error: { message: 'Method Not Allowed' } });
  }

  try {
    // 1. Authentication (same as other API routes)
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.status(401).json({ error: { message: 'Authorization header is missing or invalid.' } });
    }
    const providedApiKey = authHeader.split(' ')[1];

    const { restaurantId, event, payload } = request.body;

    if (!restaurantId || !event || !payload) {
      return response.status(400).json({ error: { message: '`restaurantId`, `event`, and `payload` are required.' } });
    }
    
    // Validate API Key
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
    
    // 2. Trigger webhook (fire and forget)
    // We don't await this because we want to respond to the client immediately.
    triggerWebhook(restaurantId, event as WebhookEvent, payload);

    // 3. Respond to client
    return response.status(202).json({ success: true, message: 'Webhook event trigger accepted.' });

  } catch (error: any) {
    console.error('[API /trigger-webhook] Fatal error:', error);
    return response.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
  }
}
