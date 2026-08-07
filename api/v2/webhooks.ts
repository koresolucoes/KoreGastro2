import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { withAuth, supabase } from '../utils/api-handler.js';
import { WebhookEvent } from '../../src/models/db.models.js';

const ALL_WEBHOOK_EVENTS: readonly WebhookEvent[] = [
  'order.created',
  'order.updated',
  'stock.updated',
  'customer.created'
];

export default withAuth(async function handler(req: any, res: any, restaurantId: string) {
    switch (req.method) {
        case 'GET':
            await handleGet(req, res, restaurantId);
            break;
        case 'POST':
            await handlePost(req, res, restaurantId);
            break;
        case 'PATCH':
            await handlePatch(req, res, restaurantId);
            break;
        case 'DELETE':
            await handleDelete(req, res, restaurantId);
            break;
        default:
            res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
            res.status(405).json({ type: "about:blank", title: "Method Not Allowed", status: 405, detail: `Method ${req.method} Not Allowed` });
    }
});

async function handleGet(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { data, error } = await supabase
        .from('webhooks')
        .select('id, url, events, is_active, created_at')
        .eq('user_id', restaurantId);

    if (error) throw error;
    
    return res.status(200).json(data || []);
}

const postWebhookSchema = z.object({
    url: z.string().url(),
    events: z.array(z.enum(ALL_WEBHOOK_EVENTS as any)).min(1)
});

async function handlePost(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const parsed = postWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: 'Invalid payload' });
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

    return res.status(201).json(newWebhook);
}

const patchWebhookSchema = z.object({
    url: z.string().url().optional(),
    events: z.array(z.enum(ALL_WEBHOOK_EVENTS as any)).min(1).optional(),
    is_active: z.boolean().optional()
}).refine(data => Object.keys(data).length > 0, {
    message: "No fields to update provided."
});

async function handlePatch(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
        return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: 'A webhook `id` is required in the query parameters.' });
    }

    const parsed = patchWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: 'Invalid payload' });
    }

    const { data, error } = await supabase
        .from('webhooks')
        .update(parsed.data)
        .eq('id', id)
        .eq('user_id', restaurantId)
        .select('id, url, events, is_active, created_at')
        .single();

    if (error) {
        if (error.code === 'PGRST116') return res.status(404).json({ type: "about:blank", title: "Not Found", status: 404, detail: `Webhook with id "${id}" not found.` });
        throw error;
    }

    return res.status(200).json(data);
}

async function handleDelete(req: VercelRequest, res: VercelResponse, restaurantId: string) {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
        return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: 'A webhook `id` is required in the query parameters.' });
    }

    const { error } = await supabase
        .from('webhooks')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', restaurantId);

    if (error) throw error;

    return res.status(204).end();
}
