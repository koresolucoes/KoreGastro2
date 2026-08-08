import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';
import { ApiClientService } from './api-client.service';
import { PortioningEvent, PortioningEventOutput } from '../models/db.models';
import { UnitContextService } from './unit-context.service';

export interface PortioningForm {
  employee_id: string | null;
  notes: string | null;
  input_ingredient_id: string;
  input_lot_id: string;
  input_quantity: number;
  outputs: Partial<PortioningEventOutput>[];
}

@Injectable({
  providedIn: 'root'
})
export class PortioningDataService {
  private authService = inject(AuthService);
  private unitContextService = inject(UnitContextService);
  private apiClient = inject(ApiClientService);

  async createPortioningEvent(form: PortioningForm) {
    const { data, error } = await this.apiClient.post('/api/v2/inventory/portioning', form);
    return { success: !error, error };
  }
}
