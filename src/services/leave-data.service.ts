import { Injectable, inject } from '@angular/core';
import { LeaveRequest } from '../models/db.models';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';
import { SettingsStateService } from './settings-state.service';

@Injectable({
  providedIn: 'root',
})
export class LeaveDataService {
  private authService = inject(AuthService);
  private settingsState = inject(SettingsStateService);

  async addLeaveRequest(
    request: Partial<Omit<LeaveRequest, 'id' | 'created_at' | 'updated_at' | 'user_id'>>,
    attachment?: { file: string; filename: string; }
  ): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    const apiKey = this.settingsState.companyProfile()?.external_api_key;

    if (!userId || !apiKey) {
      return { success: false, error: { message: 'Usuário ou chave de API não encontrados.' } };
    }

    const body: any = {
      ...request,
      employeeId: request.employee_id, // API expects employeeId
      restaurantId: userId,
    };
    if (attachment) {
      body.attachment = attachment.file;
      body.attachment_filename = attachment.filename;
    }

    try {
      const response = await fetch('https://gastro.koresolucoes.com.br/api/rh/ausencias', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.error?.message || `API error (${response.status})`);
      }
      
      // The realtime subscription will update the state, so we just return success.
      return { success: true, error: null };
    } catch (error) {
      console.error('Error calling leave request API:', error);
      return { success: false, error };
    }
  }

  async updateLeaveRequest(id: string, updates: Partial<LeaveRequest>): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('leave_requests').update(updates).eq('id', id);
    return { success: !error, error };
  }
}