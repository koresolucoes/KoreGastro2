import { Injectable, signal } from '@angular/core';
import { IfoodWebhookLog, IfoodMenuSync } from '../models/db.models';

@Injectable({ providedIn: 'root' })
export class IfoodStateService {
  ifoodWebhookLogs = signal<IfoodWebhookLog[]>([]);
  ifoodMenuSync = signal<IfoodMenuSync[]>([]);

  clearData() {
    this.ifoodWebhookLogs.set([]);
    this.ifoodMenuSync.set([]);
  }
}
