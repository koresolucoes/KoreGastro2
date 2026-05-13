import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { withAuth, supabase } from '../utils/api-handler.js';
import { WebhookEvent } from '../../src/models/db.models.js';

const ALL_WEBHOOK_EVENTS: readonly WebhookEvent[] = [
  'order.created',
  'order.updated',
  'stock.updated',
  'customer.created',
  'delivery.created',
  'delivery.status_updated'
];

export default withAuth(async function handler(request: VercelRequest, response: VercelResponse, restaurantId: string) {
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
});

async function handleGet(request: VercelRequest, response: VercelResponse, restaurantId: string) {
    const { data, error } = await supabase
        .from('webhooks')
        .select('id, url, events, is_active, created_at')
        .eq('user_id', restaurantId);

    if (error) throw error;
    
    return response.status(200).json(data || []);
}

const postWebhookSchema = z.object({
    url: z.string().url(),
    events: z.array(z.enum(ALL_WEBHOOK_EVENTS as any)).min(1)
});

async function handlePost(request: VercelRequest, response: VercelResponse, restaurantId: string) {
    const parsed = postWebhookSchema.safeParse(request.body);
    if (!parsed.success) {
        return response.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
    }
    const { url, events } = parsed.data;

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

const patchWebhookSchema = z.object({
    url: z.string().url().optional(),
    events: z.array(z.enum(ALL_WEBHOOK_EVENTS as any)).min(1).optional(),
    is_active: z.boolean().optional()
}).refine(data => Object.keys(data).length > 0, {
    message: "No fields to update provided."
});

async function handlePatch(request: VercelRequest, response: VercelResponse, restaurantId: string) {
    const { id } = request.query;
    if (!id || typeof id !== 'string') {
        return response.status(400).json({ error: { message: 'A webhook `id` is required in the query parameters.' } });
    }

    const parsed = patchWebhookSchema.safeParse(request.body);
    if (!parsed.success) {
        return response.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
    }

    const { data, error } = await supabase
        .from('webhooks')
        .update(parsed.data)
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
