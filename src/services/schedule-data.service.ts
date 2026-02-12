import { Injectable, inject } from '@angular/core';
import { Schedule, Shift } from '../models/db.models';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';
// FIX: Import and inject HrStateService to access schedule data
import { HrStateService } from './hr-state.service';
import { UnitContextService } from './unit-context.service';

@Injectable({
  providedIn: 'root',
})
export class ScheduleDataService {
  private authService = inject(AuthService);
  // FIX: Inject HrStateService instead of SupabaseStateService
  private hrState = inject(HrStateService);
  private unitContextService = inject(UnitContextService);

  private getActiveUnitId(): string | null {
      return this.unitContextService.activeUnitId();
  }

  async getOrCreateScheduleForDate(weekStartDate: string): Promise<{ data: Schedule | null; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { data: null, error: { message: 'Active unit not found' } };

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
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Active unit not found' } };

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

  // --- New Feature: Copy Schedule ---
  async copyScheduleFromPreviousWeek(currentWeekStart: string, targetScheduleId: string): Promise<{ success: boolean; error: any; count?: number }> {
      const userId = this.getActiveUnitId();
      if (!userId) return { success: false, error: { message: 'Active unit not found' } };

      const currentDate = new Date(currentWeekStart);
      const prevWeekDate = new Date(currentDate);
      prevWeekDate.setDate(prevWeekDate.getDate() - 7);
      const prevWeekStart = prevWeekDate.toISOString().split('T')[0];

      // 1. Fetch previous schedule
      const { data: prevSchedule, error: fetchError } = await supabase
          .from('schedules')
          .select('id, shifts(*)')
          .eq('user_id', userId)
          .eq('week_start_date', prevWeekStart)
          .single();
      
      if (fetchError || !prevSchedule || !prevSchedule.shifts || prevSchedule.shifts.length === 0) {
          return { success: false, error: { message: 'Nenhuma escala encontrada na semana anterior para copiar.' } };
      }

      // 2. Prepare new shifts
      const newShifts = prevSchedule.shifts.map(shift => {
          const oldStart = new Date(shift.start_time);
          const oldEnd = shift.end_time ? new Date(shift.end_time) : null;
          
          // Add 7 days
          const newStart = new Date(oldStart);
          newStart.setDate(newStart.getDate() + 7);
          
          let newEnd = null;
          if (oldEnd) {
              newEnd = new Date(oldEnd);
              newEnd.setDate(newEnd.getDate() + 7);
          }

          return {
              schedule_id: targetScheduleId,
              user_id: userId,
              employee_id: shift.employee_id,
              start_time: newStart.toISOString(),
              end_time: newEnd ? newEnd.toISOString() : null,
              role_assigned: shift.role_assigned,
              is_day_off: shift.is_day_off,
              notes: shift.notes
          };
      });

      // 3. Bulk Insert
      const { error: insertError } = await supabase.from('shifts').insert(newShifts);
      
      return { success: !insertError, error: insertError, count: newShifts.length };
  }
}
