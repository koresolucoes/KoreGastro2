import { Injectable, signal, computed, effect, inject } from '@angular/core';
import { Employee, TimeClockEntry } from '../models/db.models';
import { Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, take } from 'rxjs';
import { supabase } from './supabase-client';
import { SupabaseStateService } from './supabase-state.service';

const EMPLOYEE_STORAGE_KEY = 'active_employee';

const PERMISSIONS: Record<string, string[]> = {
  'Gerente': ['/dashboard', '/pos', '/kds', '/cashier', '/menu', '/inventory', '/technical-sheets', '/performance', '/reports', '/settings', '/reservations', '/time-clock', '/tutorials', '/purchasing', '/mise-en-place', '/leave-management', '/my-leave', '/schedules'],
  'Caixa': ['/pos', '/cashier', '/menu', '/mise-en-place', '/reservations', '/tutorials', '/schedules', '/my-leave'],
  'Garçom': ['/pos', '/menu', '/mise-en-place', '/reservations', '/tutorials', '/schedules', '/my-leave'],
  'Cozinha': ['/kds', '/mise-en-place', '/tutorials', '/schedules', '/my-leave'],
};

const DEFAULT_ROUTES: Record<string, string> = {
  'Gerente': '/dashboard',
  'Caixa': '/cashier',
  'Garçom': '/pos',
  'Cozinha': '/kds',
};

type ShiftButtonState = { text: string; action: 'start_break' | 'end_break' | 'end_shift'; disabled: boolean; className: string; };

@Injectable({
  providedIn: 'root',
})
export class OperationalAuthService {
  private router = inject(Router);
  private stateService = inject(SupabaseStateService);
  activeEmployee = signal<Employee | null>(null);
  activeShift = signal<TimeClockEntry | null>(null);

  constructor() {
    const storedEmployee = sessionStorage.getItem(EMPLOYEE_STORAGE_KEY);
    if (storedEmployee) {
      const employee = JSON.parse(storedEmployee);
      this.activeEmployee.set(employee);
      this.loadActiveShift(employee);
    }
  }

  private async loadActiveShift(employee: Employee | null) {
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
    this.activeEmployee.set(employee);
    sessionStorage.setItem(EMPLOYEE_STORAGE_KEY, JSON.stringify(employee));
    this.loadActiveShift(employee);
  }

  logout() {
    this.activeEmployee.set(null);
    this.activeShift.set(null);
    sessionStorage.removeItem(EMPLOYEE_STORAGE_KEY);
    this.router.navigate(['/employee-selection']);
  }

  hasPermission(url: string): boolean {
    const employee = this.activeEmployee();
    if (!employee || !employee.role) {
      return false; // Default to no access if role is not defined
    }
    
    // Manager has access to everything
    if (employee.role === 'Gerente') {
      return true;
    }

    const allowedRoutes = PERMISSIONS[employee.role] || [];
    // Check if the URL starts with any of the allowed paths.
    return allowedRoutes.some(allowedPath => url.startsWith(allowedPath));
  }

  getDefaultRoute(): string {
    const employee = this.activeEmployee();
    if (!employee || !employee.role) {
      return '/employee-selection';
    }
    return DEFAULT_ROUTES[employee.role] || '/pos';
  }
}
