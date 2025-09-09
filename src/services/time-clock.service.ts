import { Injectable, inject } from '@angular/core';
import { TimeClockEntry } from '../models/db.models';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';

@Injectable({
  providedIn: 'root',
})
export class TimeClockService {
  private authService = inject(AuthService);

  async getEntriesForPeriod(startDate: string, endDate: string, employeeId: string): Promise<{ data: TimeClockEntry[] | null; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { data: null, error: { message: 'User not authenticated' } };

    // Create Date objects from the string inputs, ensuring they are parsed as local time.
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T23:59:59`);

    let query = supabase.from('time_clock_entries')
        .select('*, employees!employee_id(name)')
        .eq('user_id', userId)
        .gte('clock_in_time', start.toISOString())
        .lte('clock_in_time', end.toISOString())
        .order('clock_in_time', { ascending: false });

    if (employeeId !== 'all') {
        query = query.eq('employee_id', employeeId);
    }
    
    return query;
  }

  async addEntry(entry: Partial<TimeClockEntry>): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const { error } = await supabase.from('time_clock_entries').insert({
      employee_id: entry.employee_id,
      clock_in_time: entry.clock_in_time,
      clock_out_time: entry.clock_out_time,
      break_start_time: entry.break_start_time,
      break_end_time: entry.break_end_time,
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