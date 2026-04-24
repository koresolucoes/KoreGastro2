import { Injectable, inject } from '@angular/core';
import { supabase } from './supabase-client';
import { UnitContextService } from './unit-context.service';
import { SystemLog } from '../models/db.models';

@Injectable({
  providedIn: 'root'
})
export class AuditDataService {
  unitContext = inject(UnitContextService);

  async getLogs(startDate: string, endDate: string): Promise<{ success: boolean; data: SystemLog[] | null; error: any }> {
    const userId = this.unitContext.activeUnitId();
    if (!userId) return { success: false, data: null, error: new Error("User not authenticated") };

    try {
        const { data, error } = await supabase
            .from('system_logs')
            .select(`
                *,
                employees ( name )
            `)
            .eq('user_id', userId)
            .gte('created_at', `${startDate}T00:00:00.000Z`)
            .lte('created_at', `${endDate}T23:59:59.999Z`)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching system logs:', error);
            // If the table doesn't exist, this will error. We should gracefully handle it.
            return { success: false, data: null, error };
        }
        
        return { success: true, data: data as SystemLog[], error: null };
    } catch (e: any) {
        return { success: false, data: null, error: e };
    }
  }

  async logAction(action: string, details: string, employeeId: string | null = null): Promise<void> {
    const userId = this.unitContext.activeUnitId();
    if (!userId) return;

    try {
        await supabase.from('system_logs').insert({
            user_id: userId,
            action,
            details,
            employee_id: employeeId,
            created_at: new Date().toISOString()
        });
    } catch (error) {
        console.warn('Failed to insert system log (maybe table missing):', error);
    }
  }
}
