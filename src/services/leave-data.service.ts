import { Injectable, inject } from '@angular/core';
import { LeaveRequest } from '../models/db.models';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';

@Injectable({
  providedIn: 'root',
})
export class LeaveDataService {
  private authService = inject(AuthService);

  async addLeaveRequest(request: Partial<Omit<LeaveRequest, 'id' | 'created_at' | 'updated_at' | 'user_id'>>): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase.from('leave_requests').insert({ ...request, user_id: userId });
    return { success: !error, error };
  }

  async updateLeaveRequest(id: string, updates: Partial<LeaveRequest>): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('leave_requests').update(updates).eq('id', id);
    return { success: !error, error };
  }
}
