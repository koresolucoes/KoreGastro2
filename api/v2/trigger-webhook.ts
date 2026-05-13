import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { withAuth } from '../utils/api-handler.js';
import { triggerWebhook } from '../webhook-emitter.js';
import { WebhookEvent } from '../../src/models/db.models.js';

const ALL_WEBHOOK_EVENTS: readonly WebhookEvent[] = [
  'order.created',
  'order.updated',
  'stock.updated',
  'customer.created',
  'delivery.created',
  'delivery.status_updated'
];

const postTriggerSchema = z.object({
    event: z.enum(ALL_WEBHOOK_EVENTS as any),
    payload: z.any()
});

export default withAuth(async function handler(request: VercelRequest, response: VercelResponse, restaurantId: string) {
    if (request.method !== 'POST') {
        response.setHeader('Allow', ['POST']);
        return response.status(405).json({ error: { message: `Method ${request.method} Not Allowed` } });
    }

    const parsed = postTriggerSchema.safeParse(request.body);
    if (!parsed.success) {
        return response.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
    }

    const { event, payload } = parsed.data;

    // Dispatch the webhook
    await triggerWebhook(restaurantId, event, payload);

    return response.status(202).json({ success: true, message: 'Webhook event trigger processed.' });
});
