import { Injectable, inject } from '@angular/core';
import { SettingsStateService } from './settings-state.service';
import { WebhookEvent } from '../models/db.models';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';
import { DemoService } from './demo.service';

@Injectable({
  providedIn: 'root',
})
export class WebhookService {
  private settingsState = inject(SettingsStateService);
  private authService = inject(AuthService);
  private notificationService = inject(NotificationService);
  private demoService = inject(DemoService);

  /**
   * Triggers a webhook event by sending a request to a secure backend endpoint.
   * This is designed to be non-blocking ("fire and forget").
   * @param event The type of event being triggered.
   * @param payload The data associated with the event.
   */
  public triggerWebhook(event: WebhookEvent, payload: any): void {
    if (this.demoService.isDemoMode()) {
      console.log(`[WebhookService] DEMO MODE: Webhook event '${event}' triggered but not sent.`, payload);
      return;
    }
      
    const restaurantId = this.authService.currentUser()?.id;
    const apiKey = this.settingsState.companyProfile()?.external_api_key;

    // The webhook configurations are loaded into the settingsState.
    // Check if there are any webhooks configured for this event before making an API call.
    const hasSubscribedWebhooks = this.settingsState.webhooks()
      .some(wh => wh.is_active && wh.events.includes(event));

    if (!hasSubscribedWebhooks) {
      return; // No need to call the API if no one is listening
    }

    if (!restaurantId || !apiKey) {
      console.warn('[WebhookService] Cannot trigger webhook: missing restaurantId or apiKey.');
      return;
    }

    const body = {
      restaurantId,
      event,
      payload
    };

    // Fire and forget fetch request to the backend proxy
    fetch('https://gastro.koresolucoes.com.br/api/trigger-webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
    }).then(response => {
      if (!response.ok) {
        // We can log the error but don't show it to the user to avoid being disruptive.
        console.error(`[WebhookService] API call to trigger webhook failed with status ${response.status}`);
      } else {
        console.log(`[WebhookService] Webhook trigger for event '${event}' accepted by the server.`);
      }
    }).catch(error => {
      console.error(`[WebhookService] Network error when trying to trigger webhook:`, error);
    });
  }
}
