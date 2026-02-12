
import { Injectable, inject } from '@angular/core';
import { LeaveRequest } from '../models/db.models';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';
import { UnitContextService } from './unit-context.service';

@Injectable({
  providedIn: 'root',
})
export class LeaveDataService {
  private authService = inject(AuthService);
  private unitContextService = inject(UnitContextService);

  private getActiveUnitId(): string | null {
      return this.unitContextService.activeUnitId();
  }

  async addLeaveRequest(
    request: Partial<Omit<LeaveRequest, 'id' | 'created_at' | 'updated_at' | 'user_id'>>,
    attachment?: { file: string; filename: string; }
  ): Promise<{ success: boolean; error: any }> {
    const restaurantId = this.getActiveUnitId();
    
    // FIX RISCO A: Obter a sessão atual do Supabase
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    if (!restaurantId || !accessToken) {
      return { success: false, error: { message: 'Usuário não autenticado ou unidade não selecionada.' } };
    }

    const body: any = {
      ...request,
      employeeId: request.employee_id, // API expects employeeId
      restaurantId: restaurantId, // Agora enviado no corpo, mas validado via JWT
    };
    if (attachment) {
      body.attachment = attachment.file;
      body.attachment_filename = attachment.filename;
    }

    try {
      const response = await fetch('https://app.chefos.online/api/rh/ausencias', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`, // Token Seguro
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.error?.message || `API error (${response.status})`);
      }
      
      return { success: true, error: null };
    } catch (error: any) {
      console.error('Error calling leave request API:', error);
      return { success: false, error: { message: error.message } };
    }
  }

  async updateLeaveRequest(id: string, updates: Partial<LeaveRequest>): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('leave_requests').update(updates).eq('id', id);
    return { success: !error, error };
  }
}
