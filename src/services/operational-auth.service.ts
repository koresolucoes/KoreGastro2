import { Injectable, signal, computed, inject } from '@angular/core';
import { Employee, TimeClockEntry } from '../models/db.models';
import { Router } from '@angular/router';
import { supabase } from './supabase-client';
import { SupabaseStateService } from './supabase-state.service';
import { ALL_PERMISSION_KEYS } from '../config/permissions';

const EMPLOYEE_STORAGE_KEY = 'active_employee';

type ShiftButtonState = { text: string; action: 'start_break' | 'end_break' | 'end_shift'; disabled: boolean; className: string; };

@Injectable({
  providedIn: 'root',
})
export class OperationalAuthService {
  private router = inject(Router);
  private stateService = inject(SupabaseStateService);
  activeEmployee = signal<(Employee & { role?: string }) | null>(null);
  activeShift = signal<TimeClockEntry | null>(null);

  constructor() {
    const storedEmployee = sessionStorage.getItem(EMPLOYEE_STORAGE_KEY);
    if (storedEmployee) {
      const employee = JSON.parse(storedEmployee);
      this.activeEmployee.set(employee);
      this.loadActiveShift(employee);
    }
  }

  private async loadActiveShift(employee: (Employee & { role?: string }) | null) {
      if (employee && employee.current_clock_in_id) {
          const { data, error } = await supabase
              .from('time_clock_entries')
              .select('*')
              .eq('id', employee.current_clock_in_id)
              .single();
          if (!error) this.activeShift.set(data);
          else this.activeShift.set(null);
      } else {
          this.activeShift.set(null);
      }
  }

  shiftButtonState = computed<ShiftButtonState>(() => {
    const shift = this.activeShift();
    if (!shift) {
        return { text: 'Encerrar Turno', action: 'end_shift', disabled: true, className: 'text-yellow-400 hover:text-yellow-300' };
    }
    if (!shift.break_start_time) {
        return { text: 'Iniciar Pausa', action: 'start_break', disabled: false, className: 'text-blue-400 hover:text-blue-300' };
    }
    if (!shift.break_end_time) {
        return { text: 'Encerrar Pausa', action: 'end_break', disabled: false, className: 'text-green-400 hover:text-green-300' };
    }
    return { text: 'Encerrar Turno', action: 'end_shift', disabled: false, className: 'text-yellow-400 hover:text-yellow-300' };
  });

  async handleShiftAction() {
      const shift = this.activeShift();
      const employee = this.activeEmployee();
      if (!shift || !employee) return;

      const state = this.shiftButtonState().action;
      
      switch (state) {
          case 'start_break':
              await supabase.from('time_clock_entries').update({ break_start_time: new Date().toISOString() }).eq('id', shift.id);
              break;
          case 'end_break':
              await supabase.from('time_clock_entries').update({ break_end_time: new Date().toISOString() }).eq('id', shift.id);
              break;
          case 'end_shift':
              await this.clockOut();
              return; // clockOut handles logout and navigation
      }
      
      // Refresh shift state after action
      await this.loadActiveShift(employee);
  }

  async clockIn(employee: Employee): Promise<{ success: boolean; error: any }> {
    const { data: newEntry, error } = await supabase
        .from('time_clock_entries')
        .insert({ employee_id: employee.id }) // user_id will be set by the DB default
        .select('id')
        .single();

    if (error) return { success: false, error };

    const { error: empError } = await supabase
        .from('employees')
        .update({ current_clock_in_id: newEntry.id })
        .eq('id', employee.id);

    if (empError) {
        // Rollback
        await supabase.from('time_clock_entries').delete().eq('id', newEntry.id);
        return { success: false, error: empError };
    }
    
    // Manually update the state to reflect the change immediately
    const updatedEmployee = { ...employee, current_clock_in_id: newEntry.id };
    this.stateService.employees.update(employees => 
        employees.map(e => e.id === employee.id ? updatedEmployee : e)
    );
    this.login(updatedEmployee); // Sets the active employee
    return { success: true, error: null };
  }

  async clockOut(): Promise<{ success: boolean; error: any }> {
      const employee = this.activeEmployee();
      if (!employee || !employee.current_clock_in_id) {
          // If for some reason they are logged in without a clock-in record, just log them out.
          this.logout();
          return { success: true, error: null };
      }
  
      const { error } = await supabase
          .from('time_clock_entries')
          .update({ clock_out_time: new Date().toISOString() })
          .eq('id', employee.current_clock_in_id);
  
      if (error) return { success: false, error };
  
      const { error: empError } = await supabase
          .from('employees')
          .update({ current_clock_in_id: null })
          .eq('id', employee.id);
  
      if (empError) {
          // Don't rollback here, as the clock-out time is already set.
          // It's better to have a record that needs manual fixing than lose the clock-out time.
          return { success: false, error: empError };
      }
      
      // Manually update state
       this.stateService.employees.update(employees => 
          employees.map(e => e.id === employee.id ? { ...e, current_clock_in_id: null } : e)
      );
      this.logout(); // Clears session and navigates
      return { success: true, error: null };
  }

  login(employee: Employee) {
    const rolesMap = new Map(this.stateService.roles().map(r => [r.id, r.name]));
    const roleName = employee.role_id ? rolesMap.get(employee.role_id) : undefined;
    const employeeWithRole = {
      ...employee,
      role: roleName,
    };

    this.activeEmployee.set(employeeWithRole);
    sessionStorage.setItem(EMPLOYEE_STORAGE_KEY, JSON.stringify(employeeWithRole));
    this.loadActiveShift(employeeWithRole);
  }

  logout() {
    this.activeEmployee.set(null);
    this.activeShift.set(null);
    sessionStorage.removeItem(EMPLOYEE_STORAGE_KEY);
    this.router.navigate(['/employee-selection']);
  }

  hasPermission(url: string): boolean {
    const employee = this.activeEmployee();
    if (!employee || !employee.role_id) return false;

    // Strip query parameters from the URL to get the base path for permission checking.
    const pathOnly = url.split('?')[0];
    const routeKey = '/' + pathOnly.split('/')[1];
    
    // Condition 1: Does the employee's role have permission?
    const rolePermissions = this.stateService.rolePermissions();
    const hasRolePermission = rolePermissions.some(p => p.role_id === employee.role_id && p.permission_key === routeKey);

    // Special case for tutorials: bypass subscription check if they have role permission
    if (routeKey === '/tutorials') {
        return hasRolePermission;
    }

    // Condition 2: Does the account's subscription plan have permission?
    const subscriptionPermissions = this.stateService.activeUserPermissions();
    const hasSubscriptionPermission = subscriptionPermissions.has(routeKey);
    
    // Access is granted only if BOTH conditions are true.
    return hasRolePermission && hasSubscriptionPermission;
  }

  getDefaultRoute(): string {
    const employee = this.activeEmployee();
    if (!employee || !employee.role_id) return '/employee-selection';

    // Find the first available route for the user based on the master list
    for (const route of ALL_PERMISSION_KEYS) {
      if (this.hasPermission(route)) {
          return route;
      }
    }

    // Fallback if no permissions are set
    return '/employee-selection';
  }
}