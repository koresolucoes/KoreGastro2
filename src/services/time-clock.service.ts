import { Injectable, inject } from '@angular/core';
import { TimeClockEntry } from '../models/db.models';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';
import { UnitContextService } from './unit-context.service';

@Injectable({
  providedIn: 'root',
})
export class TimeClockService {
  private authService = inject(AuthService);
  private unitContextService = inject(UnitContextService);

  private async getAuthHeaders(): Promise<HeadersInit> {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`,
    };
  }

  async getEntriesForPeriod(startDate: string, endDate: string, employeeId: string): Promise<{ data: TimeClockEntry[] | null; error: any }> {
    const userId = this.unitContextService.activeUnitId();
    if (!userId) return { data: null, error: { message: 'User not authenticated' } };

    try {
      const headers = await this.getAuthHeaders();
      let url = `/api/rh/ponto?restaurantId=${userId}&data_inicio=${startDate}&data_fim=${endDate}`;
      if (employeeId !== 'all') {
        url += `&employeeId=${employeeId}`;
      }
      
      const response = await fetch(url, { headers });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: 'Failed to fetch entries' }));
        return { data: null, error: err };
      }
      
      const data = await response.json();
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  }

  async addEntry(entry: Partial<TimeClockEntry>): Promise<{ success: boolean; error: any }> {
    const userId = this.unitContextService.activeUnitId();
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`/api/rh/ponto?restaurantId=${userId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(entry),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: 'Failed to add entry' }));
        return { success: false, error: err };
      }
      return { success: true, error: null };
    } catch (err: any) {
      return { success: false, error: err };
    }
  }
  
  async updateEntry(id: string, updates: Partial<TimeClockEntry>): Promise<{ success: boolean; error: any }> {
    const userId = this.unitContextService.activeUnitId();
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`/api/rh/ponto?restaurantId=${userId}&id=${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: 'Failed to update entry' }));
        return { success: false, error: err };
      }
      return { success: true, error: null };
    } catch (err: any) {
      return { success: false, error: err };
    }
  }

  async deleteEntry(id: string): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('time_clock_entries').delete().eq('id', id);
    return { success: !error, error };
  }
}
