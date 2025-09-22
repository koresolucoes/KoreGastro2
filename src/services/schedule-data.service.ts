import { Injectable, inject } from '@angular/core';
import { Schedule, Shift } from '../models/db.models';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';
// FIX: Import and inject HrStateService to access schedule data
import { HrStateService } from './hr-state.service';

@Injectable({
  providedIn: 'root',
})
export class ScheduleDataService {
  private authService = inject(AuthService);
  // FIX: Inject HrStateService instead of SupabaseStateService
  private hrState = inject(HrStateService);

  async getOrCreateScheduleForDate(weekStartDate: string): Promise<{ data: Schedule | null; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { data: null, error: { message: 'User not authenticated' } };

    // Check if it exists in local state first
    // FIX: Access schedules from the correct state service
    const existingSchedule = this.hrState.schedules().find(s => s.week_start_date === weekStartDate);
    if (existingSchedule) {
      return { data: existingSchedule, error: null };
    }
    
    // If not, try to fetch from DB
    let { data, error } = await supabase
      .from('schedules')
      .select('*, shifts(*, employees(name))')
      .eq('user_id', userId)
      .eq('week_start_date', weekStartDate)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
      console.error('Error fetching schedule:', error);
      return { data: null, error };
    }
    
    if (data) {
      // Manually add to state if it was missing
      // FIX: Update schedules in the correct state service
      this.hrState.schedules.update(schedules => [...schedules, data as Schedule]);
      return { data: data as Schedule, error: null };
    }

    // If it doesn't exist, create it
    const { data: newSchedule, error: createError } = await supabase
      .from('schedules')
      .insert({ week_start_date: weekStartDate, user_id: userId })
      .select()
      .single();

    if (createError) {
      return { data: null, error: createError };
    }
    
    const scheduleWithShifts: Schedule = { ...newSchedule, shifts: [] };
    // Add the newly created schedule to the state so the UI updates immediately
    // FIX: Update schedules in the correct state service
    this.hrState.schedules.update(schedules => [...schedules, scheduleWithShifts]);

    return { data: scheduleWithShifts, error: null };
  }

  async saveShift(scheduleId: string, shift: Partial<Omit<Shift, 'user_id'>>): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const shiftData: Partial<Shift> = {
      ...shift,
      schedule_id: scheduleId,
      user_id: userId,
    };
    
    // If it's a day off, nullify time-related fields
    if (shiftData.is_day_off) {
      shiftData.end_time = shiftData.start_time; // Set end time same as start to represent a single day
      shiftData.role_assigned = null;
      shiftData.notes = 'Folga';
    }
    
    const { error } = await supabase.from('shifts').upsert(shiftData);
    return { success: !error, error };
  }

  async deleteShift(shiftId: string): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('shifts').delete().eq('id', shiftId);
    return { success: !error, error };
  }

  async publishSchedule(scheduleId: string, isPublished: boolean): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase
      .from('schedules')
      .update({ is_published: isPublished })
      .eq('id', scheduleId);
    return { success: !error, error };
  }
}
