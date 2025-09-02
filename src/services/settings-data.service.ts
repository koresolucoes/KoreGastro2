import { Injectable, inject } from '@angular/core';
import { Employee } from '../models/db.models';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';

@Injectable({
  providedIn: 'root',
})
export class SettingsDataService {
  private authService = inject(AuthService);

  async addStation(name: string): Promise<{ success: boolean, error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase.from('stations').insert({ name, auto_print_orders: false, user_id: userId });
    return { success: !error, error };
  }

  async updateStation(id: string, name: string): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('stations').update({ name }).eq('id', id);
    return { success: !error, error };
  }

  async deleteStation(id: string): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('stations').delete().eq('id', id);
    return { success: !error, error };
  }

  async updateStationAutoPrint(id: string, auto_print_orders: boolean): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('stations').update({ auto_print_orders }).eq('id', id);
    return { success: !error, error };
  }

  async updateStationPrinter(id: string, printer_name: string | null): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('stations').update({ printer_name }).eq('id', id);
    return { success: !error, error };
  }
  
  async assignEmployeeToStation(stationId: string, employeeId: string | null): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('stations').update({ employee_id: employeeId }).eq('id', stationId);
    return { success: !error, error };
  }

  async addEmployee(employee: Partial<Employee>): Promise<{ success: boolean, error: any, data?: Employee }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { data, error } = await supabase.from('employees').insert({ ...employee, user_id: userId }).select().single();
    return { success: !error, error, data };
  }

  async updateEmployee(employee: Partial<Employee>): Promise<{ success: boolean, error: any }> {
    const { id, ...updateData } = employee;
    const { error } = await supabase.from('employees').update(updateData).eq('id', id!);
    return { success: !error, error };
  }

  async deleteEmployee(id: string): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('employees').delete().eq('id', id);
    return { success: !error, error };
  }
}
