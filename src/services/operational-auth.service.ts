import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { Employee, TimeClockEntry } from '../models/db.models';
import { Router } from '@angular/router';
import { supabase } from './supabase-client';
import { HrStateService } from './hr-state.service';
import { SubscriptionStateService } from './subscription-state.service';
import { SupabaseStateService } from './supabase-state.service';
import { ALL_PERMISSION_KEYS } from '../config/permissions';
import { DemoService } from './demo.service';
import { MOCK_EMPLOYEES, MOCK_ROLES } from '../data/mock-data';

const EMPLOYEE_STORAGE_KEY = 'active_employee';

type ShiftButtonState = { text: string; action: 'start_break' | 'end_break' | 'end_shift'; disabled: boolean; className: string; };

@Injectable({
  providedIn: 'root',
})
export class OperationalAuthService {
  private router = inject(Router);
  private stateService = inject(SupabaseStateService);
  private hrState = inject(HrStateService);
  private subscriptionState = inject(SubscriptionStateService);
  private demoService = inject(DemoService);
  
  activeEmployee = signal<(Employee & { role: string }) | null>(null);
  activeShift = signal<TimeClockEntry | null>(null);
  operatorAuthInitialized = signal(false);

  constructor() {
    try {
        const storedEmployee = localStorage.getItem(EMPLOYEE_STORAGE_KEY);
        if (storedEmployee) {
          const employee = JSON.parse(storedEmployee) as (Employee & { role: string });
          this.activeEmployee.set(employee);
          this.loadActiveShift(employee);
        }
    } catch (e) {
        console.error("Failed to initialize operator auth from localStorage", e);
        localStorage.removeItem(EMPLOYEE_STORAGE_KEY);
        this.activeEmployee.set(null);
    } finally {
        this.operatorAuthInitialized.set(true);
    }


    effect(() => {
      if (this.demoService.isDemoMode() && !this.activeEmployee()) {
        this.loginAsDemoUser();
      }
    });
  }

  private loginAsDemoUser() {
    const demoManagerRole = MOCK_ROLES.find(r => r.name === 'Gerente');
    if (!demoManagerRole) {
      console.error("Demo Data Error: Mock 'Gerente' role not found.");
      return;
    }
    const demoManager = MOCK_EMPLOYEES.find(e => e.role_id === demoManagerRole.id);
    if (demoManager) {
      this.login(demoManager);
    } else {
      console.error("Demo Data Error: Mock 'Gerente' employee not found.");
    }
  }

  private async loadActiveShift(employee: (Employee & { role: string }) | null) {
      if (this.demoService.isDemoMode()) {
        this.activeShift.set(null); // No active shift in demo mode initially
        return;
      }
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
    if (this.demoService.isDemoMode()) {
        const shift = this.activeShift();
        if (!shift) return { text: 'Encerrar Turno', action: 'end_shift', disabled: true, className: 'text-yellow-400' };
        if (!shift.break_start_time) return { text: 'Iniciar Pausa', action: 'start_break', disabled: false, className: 'text-blue-400 hover:text-blue-300' };
        if (!shift.break_end_time) return { text: 'Encerrar Pausa', action: 'end_break', disabled: false, className: 'text-green-400 hover:text-green-300' };
        return { text: 'Encerrar Turno', action: 'end_shift', disabled: false, className: 'text-yellow-400 hover:text-yellow-300' };
    }
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
      if (this.demoService.isDemoMode()) {
          const shift = this.activeShift();
          if (!shift) return;
          const state = this.shiftButtonState().action;
          switch (state) {
              case 'start_break':
                  this.activeShift.update(s => s ? { ...s, break_start_time: new Date().toISOString() } : s);
                  break;
              case 'end_break':
                  this.activeShift.update(s => s ? { ...s, break_end_time: new Date().toISOString() } : s);
                  break;
              case 'end_shift':
                  this.clockOut();
                  break;
          }
          return;
      }

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
    if (this.demoService.isDemoMode()) {
      const newEntry: TimeClockEntry = {
        id: `demo-clock-${Date.now()}`,
        user_id: 'demo-user',
        employee_id: employee.id,
        clock_in_time: new Date().toISOString(),
        clock_out_time: null,
        break_start_time: null,
        break_end_time: null,
        notes: null,
        created_at: new Date().toISOString(),
      };
      const updatedEmployee = { ...employee, current_clock_in_id: newEntry.id };
      this.hrState.employees.update(employees => 
          employees.map(e => e.id === employee.id ? updatedEmployee : e)
      );
      this.activeShift.set(newEntry);
      this.login(updatedEmployee);
      return { success: true, error: null };
    }

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
    this.hrState.employees.update(employees => 
        employees.map(e => e.id === employee.id ? updatedEmployee : e)
    );
    this.login(updatedEmployee); // Sets the active employee
    return { success: true, error: null };
  }

  async clockOut(): Promise<{ success: boolean; error: any }> {
      if (this.demoService.isDemoMode()) {
          const employee = this.activeEmployee();
          if (employee) {
              this.hrState.employees.update(employees => 
                  employees.map(e => e.id === employee.id ? { ...e, current_clock_in_id: null } : e)
              );
          }
          this.switchEmployee();
          return { success: true, error: null };
      }

      const employee = this.activeEmployee();
      if (!employee || !employee.current_clock_in_id) {
          // If for some reason they are logged in without a clock-in record, just log them out.
          this.switchEmployee();
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
      
       this.hrState.employees.update(employees => 
          employees.map(e => e.id === employee.id ? { ...e, current_clock_in_id: null } : e)
      );
      this.switchEmployee(); // Clears session and navigates
      return { success: true, error: null };
  }

  login(employee: Employee) {
    let roleName = 'Sem Cargo';
    if (this.demoService.isDemoMode()) {
        const rolesMap = new Map<string, string>(MOCK_ROLES.map(r => [r.id, r.name]));
        roleName = (employee.role_id ? rolesMap.get(employee.role_id) : undefined) || 'Sem Cargo';
    } else {
        const rolesMap = new Map<string, string>(this.hrState.roles().map(r => [r.id, r.name]));
        roleName = (employee.role_id ? rolesMap.get(employee.role_id) : undefined) || 'Sem Cargo';
    }

    const employeeWithRole: (Employee & { role: string }) = {
      ...employee,
      role: roleName,
    };

    this.activeEmployee.set(employeeWithRole);
    localStorage.setItem(EMPLOYEE_STORAGE_KEY, JSON.stringify(employeeWithRole));
    this.loadActiveShift(employeeWithRole);
  }

  switchEmployee() {
    this.demoService.disableDemoMode();
    this.activeEmployee.set(null);
    this.activeShift.set(null);
    localStorage.removeItem(EMPLOYEE_STORAGE_KEY);
    this.router.navigate(['/employee-selection']);
  }

  hasPermission(url: string): boolean {
    const employee = this.activeEmployee();
    if (!employee || !employee.role_id) return false;

    const pathOnly = url.split('?')[0];
    const routeKey = '/' + pathOnly.split('/')[1];

    // Special case for tutorials: bypass subscription check, only role permission matters.
    if (routeKey === '/tutorials') {
        const rolePermissions = this.hrState.rolePermissions();
        return rolePermissions.some(p => p.role_id === employee.role_id && p.permission_key === routeKey);
    }
    
    // For all other routes, an active subscription is a prerequisite.
    const hasActiveSub = this.subscriptionState.hasActiveSubscription();
    if (!hasActiveSub) {
        return false;
    }

    // Special case for /my-profile: if subscription is active, access is granted.
    if (routeKey === '/my-profile') {
        return true; 
    }

    // For all other regular routes, both plan and role permissions are required.
    const hasPlanPermission = this.subscriptionState.activeUserPermissions().has(routeKey);
    const hasRolePermission = this.hrState.rolePermissions().some(p => p.role_id === employee.role_id && p.permission_key === routeKey);
    
    return hasPlanPermission && hasRolePermission;
  }

  getDefaultRoute(): string {
    const employee = this.activeEmployee();
    if (!employee || !employee.role_id) return '/employee-selection';

    // In demo mode, always go to dashboard.
    if (this.demoService.isDemoMode()) {
        return '/dashboard';
    }

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
