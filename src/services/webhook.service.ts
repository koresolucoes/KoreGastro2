import { Injectable, inject } from '@angular/core';
import { SettingsStateService } from './settings-state.service';
import { WebhookEvent } from '../models/db.models';
import { createHmac } from 'crypto';
import { Buffer } from 'buffer';

@Injectable({
  providedIn: 'root',
})
export class WebhookService {
  private settingsState = inject(SettingsStateService);

  /**
   * Triggers a webhook event, sending a POST request to all subscribed URLs.
   * This is designed to be non-blocking ("fire and forget").
   * @param event The type of event being triggered.
   * @param payload The data associated with the event.
   */
  public triggerWebhook(event: WebhookEvent, payload: any): void {
    const activeWebhooks = this.settingsState.webhooks()
      .filter(wh => wh.is_active && wh.events.includes(event));

    if (activeWebhooks.length === 0) {
      return;
    }

    console.log(`[WebhookService] Triggering event '${event}' for ${activeWebhooks.length} webhook(s).`);

    const payloadString = JSON.stringify(payload);
    const payloadBuffer = Buffer.from(payloadString, 'utf-8');

    // Use Promise.allSettled to send all webhooks without waiting for each to finish
    // and to prevent one failing webhook from stopping others.
    const promises = activeWebhooks.map(webhook => {
      const signature = createHmac('sha256', webhook.secret)
        .update(payloadBuffer)
        .digest('hex');

      return fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Chefos-Signature': `sha256=${signature}`,
          'X-Chefos-Event': event,
        },
        body: payloadString,
      }).catch(error => {
        // Log errors but don't let them propagate and block the main application flow.
        console.error(`[WebhookService] Failed to send webhook to ${webhook.url} for event '${event}'. Error:`, error);
        // Return a specific error object for Promise.allSettled
        return {
          status: 'error',
          url: webhook.url,
          reason: error.message
        };
      });
    });
    
    Promise.allSettled(promises).then(results => {
        results.forEach(result => {
            if (result.status === 'rejected' || (result.status === 'fulfilled' && result.value && result.value.status === 'error')) {
                // This block will now catch both network errors (rejected promises)
                // and application-level errors we returned.
                const errorInfo = result.status === 'rejected' ? result.reason : (result.value as any).reason;
                const url = result.status === 'fulfilled' ? (result.value as any).url : 'N/A';
                console.error(`Webhook failed for URL: ${url}`, errorInfo);
            }
        });
    });
  }
}