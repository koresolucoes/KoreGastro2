import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Webhook, WebhookEvent } from '../src/models/db.models.js';
import { v4 as uuidv4 } from 'uuid';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ALL_WEBHOOK_EVENTS: WebhookEvent[] = [
  'order.created',
  'order.updated',
  'stock.updated',
  'customer.created',
  'delivery.created',
  'delivery.status_updated'
];

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
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
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
      case 'POST':
        await handlePost(request, response, restaurantId!);
        break;
      case 'PATCH':
        await handlePatch(request, response, restaurantId!);
        break;
      case 'DELETE':
        await handleDelete(request, response, restaurantId!);
        break;
      default:
        response.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
        response.status(405).json({ error: { message: `Method ${request.method} Not Allowed` } });
    }
  } catch (err: any) {
    console.error('[API /webhooks] Fatal error:', err);
    return response.status(500).json({ error: { message: err.message || 'An internal server error occurred.' } });
  }
}


async function handleGet(request: VercelRequest, response: VercelResponse, restaurantId: string) {
    const { data, error } = await supabase
      .from('webhooks')
      .select('id, url, events, is_active, created_at')
      .eq('user_id', restaurantId);
    
    if (error) throw error;
    
    return response.status(200).json(data || []);
}

async function handlePost(request: VercelRequest, response: VercelResponse, restaurantId: string) {
    const { url, events } = request.body;

    if (!url || !Array.isArray(events) || events.length === 0) {
      return response.status(400).json({ error: { message: '`url` and a non-empty `events` array are required.' } });
    }
    if (!events.every(e => ALL_WEBHOOK_EVENTS.includes(e))) {
      return response.status(400).json({ error: { message: 'One or more provided events are invalid.' } });
    }

    const secret = `whsec_${uuidv4().replace(/-/g, '')}`;

    const { data: newWebhook, error } = await supabase
      .from('webhooks')
      .insert({
        user_id: restaurantId,
        url,
        events,
        secret,
        is_active: true
      })
      .select()
      .single();

    if (error) throw error;
    
    return response.status(201).json(newWebhook);
}

async function handlePatch(request: VercelRequest, response: VercelResponse, restaurantId: string) {
    const { id } = request.query;
    if (!id || typeof id !== 'string') {
        return response.status(400).json({ error: { message: 'A webhook `id` is required in the query parameters.' } });
    }
    
    const { url, events, is_active } = request.body;
    const updatePayload: { [key: string]: any } = {};

    if (url !== undefined) updatePayload.url = url;
    if (events !== undefined) {
        if (!Array.isArray(events) || !events.every(e => ALL_WEBHOOK_EVENTS.includes(e))) {
            return response.status(400).json({ error: { message: 'Invalid `events` array.' } });
        }
        updatePayload.events = events;
    }
    if (is_active !== undefined) updatePayload.is_active = is_active;

    if (Object.keys(updatePayload).length === 0) {
        return response.status(400).json({ error: { message: 'No valid update fields provided.' } });
    }
    
    const { data, error } = await supabase
        .from('webhooks')
        .update(updatePayload)
        .eq('id', id)
        .eq('user_id', restaurantId)
        .select('id, url, events, is_active, created_at')
        .single();
    
    if (error) {
        if (error.code === 'PGRST116') return response.status(404).json({ error: { message: `Webhook with id "${id}" not found.` } });
        throw error;
    }
    
    return response.status(200).json(data);
}

async function handleDelete(request: VercelRequest, response: VercelResponse, restaurantId: string) {
    const { id } = request.query;
    if (!id || typeof id !== 'string') {
        return response.status(400).json({ error: { message: 'A webhook `id` is required in the query parameters.' } });
    }

    const { error } = await supabase
        .from('webhooks')
        .delete()
        .eq('id', id)
        .eq('user_id', restaurantId);

    if (error) throw error;

    return response.status(204).end();
}