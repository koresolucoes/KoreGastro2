import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'crypto';
import { Buffer } from 'buffer';
import { Webhook, WebhookEvent } from '../src/models/db.models.js';

// Initialize Supabase client with the service role key for admin-level access
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Triggers a webhook event, sending a POST request to all subscribed URLs for a specific user.
 * This is a server-side function designed to be called from other Vercel serverless functions.
 * @param userId The ID of the user whose webhooks should be triggered.
 * @param event The type of event being triggered.
 * @param payload The data associated with the event.
 */
export async function triggerWebhook(userId: string, event: WebhookEvent, payload: any): Promise<void> {
  // 1. Fetch active webhooks for the user and event
  const { data: webhooks, error } = await supabase
    .from('webhooks')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .filter('events', 'cs', `{${event}}`); // 'cs' stands for 'contains' for array columns

  if (error) {
    console.error(`[WebhookEmitter] Error fetching webhooks for user ${userId} and event ${event}:`, error);
    // Throw the error to let the caller know something went wrong.
    // This addresses the "fetch failed" error by making it visible to the calling function.
    throw error;
  }

  if (!webhooks || webhooks.length === 0) {
    // No active webhooks for this event, so we can just return.
    return;
  }

  console.log(`[WebhookEmitter] Triggering event '${event}' for ${webhooks.length} webhook(s) for user ${userId}.`);

  const payloadString = JSON.stringify(payload);
  const payloadBuffer = Buffer.from(payloadString, 'utf-8');

  // 2. Send all webhooks concurrently.
  const promises = webhooks.map(webhook => {
    // 2a. Create the HMAC-SHA256 signature
    const signature = createHmac('sha256', webhook.secret)
      .update(payloadBuffer)
      .digest('hex');

    // 2b. Fire the fetch request
    return fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cheffs-Signature': `sha256=${signature}`,
        'X-Cheffs-Event': event,
      },
      body: payloadString,
    })
    .then(response => {
      if (!response.ok) {
        return response.text().then(text => Promise.reject({
          url: webhook.url,
          status: response.status,
          body: text
        }));
      }
      return { url: webhook.url, status: response.status };
    })
    .catch(networkError => {
      return Promise.reject({
        url: webhook.url,
        status: 'NETWORK_ERROR',
        body: networkError.message
      });
    });
  });

  // 3. Await all webhook dispatches to complete before the serverless function can terminate.
  const results = await Promise.allSettled(promises);
  
  results.forEach(result => {
    if (result.status === 'rejected') {
      const errorInfo = result.reason;
      console.error(`[WebhookEmitter] Failed to send webhook to ${errorInfo.url}. Status: ${errorInfo.status}. Response:`, errorInfo.body);
    } else {
      console.log(`[WebhookEmitter] Successfully sent webhook to ${result.value.url}. Status: ${result.value.status}`);
    }
  });
}