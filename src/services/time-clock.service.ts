import { Injectable, inject } from '@angular/core';
import { TimeClockEntry } from '../models/db.models';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';

@Injectable({
  providedIn: 'root',
})
export class TimeClockService {
  private authService = inject(AuthService);

  async addEntry(entry: Partial<TimeClockEntry>): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const { error } = await supabase.from('time_clock_entries').insert({
      employee_id: entry.employee_id,
      clock_in_time: entry.clock_in_time,
      clock_out_time: entry.clock_out_time,
      notes: entry.notes,
      user_id: userId,
    });
    return { success: !error, error };
  }
  
  async updateEntry(id: string, updates: Partial<TimeClockEntry>): Promise<{ success: boolean; error: any }> {
    const { id: entryId, created_at, user_id, employees, ...updateData } = updates;
    const { error } = await supabase.from('time_clock_entries').update(updateData).eq('id', id);
    return { success: !error, error };
  }

  async deleteEntry(id: string): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('time_clock_entries').delete().eq('id', id);
    return { success: !error, error };
  }
}
