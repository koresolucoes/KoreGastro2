import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'crypto';
import { Buffer } from 'buffer';
import { Webhook, WebhookEvent } from '../src/models/db.models.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

// Initialize Supabase client with the service role key for admin-level access
const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-key'
);

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function fetchWithRetry(url: string, options: RequestInit, userId: string, event: string, payloadStr: string, maxRetries = 3): Promise<any> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const res = await fetch(url, options);
            if (res.ok) {
                return { url, status: res.status };
            }
            
            // Handle 429 and 5xx errors with retry
            if (res.status === 429 || res.status >= 500) {
                if (attempt === maxRetries) {
                    const text = await res.text();
                    throw new Error(`Status: ${res.status}. Body: ${text}`);
                }
                const retryAfter = res.headers.get('Retry-After');
                let waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
                if (retryAfter) {
                    const parsed = parseInt(retryAfter, 10);
                    if (!isNaN(parsed)) waitTime = parsed * 1000;
                }
                console.log(`[WebhookEmitter] Attempt ${attempt} failed for ${url} (status ${res.status}). Retrying in ${waitTime}ms...`);
                await delay(waitTime);
                continue;
            }
            
            // Client errors (4xx other than 429) do not retry
            const text = await res.text();
            throw new Error(`Status: ${res.status}. Body: ${text}`);
            
        } catch (error: any) {
            if (attempt === maxRetries) {
                // DLQ Insertion
                await supabase.from('webhook_dlq').insert({
                    user_id: userId,
                    webhook_url: url,
                    event_type: event,
                    payload: JSON.parse(payloadStr),
                    last_error: error.message
                });
                return Promise.reject({ url, status: 'FAILED', body: error.message });
            }
            const waitTime = Math.pow(2, attempt) * 1000;
            console.log(`[WebhookEmitter] Network error on attempt ${attempt} for ${url}. Retrying in ${waitTime}ms...`);
            await delay(waitTime);
        }
    }
}

/**
 * Triggers a webhook event, sending a POST req to all subscribed URLs for a specific user.
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

    // 2b. Fire the fetch req with retries
    return fetchWithRetry(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cheffs-Signature': `sha256=${signature}`,
        'X-Cheffs-Event': event,
      },
      body: payloadString,
    }, userId, event, payloadString);
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