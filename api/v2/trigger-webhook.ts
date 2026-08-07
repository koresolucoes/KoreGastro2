import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { withAuth } from '../utils/api-handler.js';
import { triggerWebhook } from '../webhook-emitter.js';
import { WebhookEvent } from '../../src/models/db.models.js';

const ALL_WEBHOOK_EVENTS: readonly WebhookEvent[] = [
  'order.created',
  'order.updated',
  'stock.updated',
  'customer.created'
];

const postTriggerSchema = z.object({
    event: z.enum(ALL_WEBHOOK_EVENTS as any),
    payload: z.any()
});

export default withAuth(async function handler(req: any, res: any, restaurantId: string) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ type: "about:blank", title: "Method Not Allowed", status: 405, detail: `Method ${req.method} Not Allowed` });
    }

    const parsed = postTriggerSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: 'Invalid payload' });
    }

    const { event, payload } = parsed.data;

    // Dispatch the webhook
    await triggerWebhook(restaurantId, event, payload);

    return res.status(202).json({ success: true, message: 'Webhook event trigger processed.' });
});
