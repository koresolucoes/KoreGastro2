
import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { Employee, TimeClockEntry, Role } from '../models/db.models';
import { Router } from '@angular/router';
import { supabase } from './supabase-client';
// FIX: Inject modular state services
import { HrStateService } from './hr-state.service';
import { SubscriptionStateService } from './subscription-state.service';
import { ALL_PERMISSION_KEYS } from '../config/permissions';
import { DemoService } from './demo.service';
import { MOCK_EMPLOYEES, MOCK_ROLES } from '../data/mock-data';
import { NotificationService } from './notification.service';

const EMPLOYEE_STORAGE_KEY = 'active_employee';

type ShiftButtonState = { text: string; action: 'start_break' | 'end_break' | 'end_shift'; disabled: boolean; className: string; };

@Injectable({
  providedIn: 'root',
})
export class OperationalAuthService {
  // FIX: Explicitly type the injected Router to resolve property access errors.
  private router: Router = inject(Router);
  // Removido SupabaseStateService para evitar dependência circular
  private hrState = inject(HrStateService);
  private subscriptionState = inject(SubscriptionStateService);
  private demoService = inject(DemoService);
  private notificationService = inject(NotificationService);
  
  activeEmployee = signal<(Employee & { role: string }) | null>(null);
  activeShift = signal<TimeClockEntry | null>(null);
  operatorAuthInitialized = signal(false);

  constructor() {
    this.initializeOperator();

    effect(() => {
      if (this.demoService.isDemoMode() && !this.activeEmployee()) {
        this.loginAsDemoUser();
      }
    });
  }

  private async initializeOperator() {
    try {
        const storedEmployee = sessionStorage.getItem(EMPLOYEE_STORAGE_KEY);
        if (storedEmployee) {
            const employee = JSON.parse(storedEmployee) as (Employee & { role: string });
            this.activeEmployee.set(employee);
            await this.loadActiveShift(employee);
        }
    } catch (e) {
        console.error("Failed to initialize operator auth from sessionStorage", e);
        sessionStorage.removeItem(EMPLOYEE_STORAGE_KEY);
        this.activeEmployee.set(null);
    } finally {
        this.operatorAuthInitialized.set(true);
    }
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
        return { text: 'Encerrar Turno', action: 'end_shift', disabled: true, className: 'text-yellow-400' };
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
      if (this.demoService.isDemoMode()) return;
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

  private getCurrentLocation(): Promise<{ latitude: number, longitude: number }> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocalização não é suportada por este navegador."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          let message = "Não foi possível obter sua localização. ";
          switch(error.code) {
            case error.PERMISSION_DENIED:
              message += "Você negou a permissão de acesso à localização.";
              break;
            case error.POSITION_UNAVAILABLE:
              message += "As informações de localização não estão disponíveis.";
              break;
            case error.TIMEOUT:
              message += "A solicitação de localização expirou.";
              break;
            default:
              message += "Ocorreu um erro desconhecido.";
              break;
          }
          reject(new Error(message));
        }
      );
    });
  }

  async clockIn(employee: Employee): Promise<{ success: boolean; error: any }> {
    let location: { latitude: number, longitude: number } | null = null;
    try {
      location = await this.getCurrentLocation();
    } catch (locationError: any) {
      this.notificationService.show(locationError.message, 'error', 6000);
      return { success: false, error: locationError };
    }

    const { data: newEntry, error } = await supabase
      .from('time_clock_entries')
      .insert({ 
        employee_id: employee.id,
        latitude: location.latitude,
        longitude: location.longitude,
      })
      .select('id')
      .single();

    if (error) {
       // Check for custom error from RLS policy
       if (error.message.includes('distancia_invalida')) {
        this.notificationService.show('Você está muito longe do restaurante para bater o ponto.', 'error');
        return { success: false, error: { message: 'Distância inválida.' } };
      }
       if (error.message.includes('localizacao_nao_configurada')) {
        this.notificationService.show('A localização do restaurante não foi configurada pelo gestor.', 'error');
        return { success: false, error: { message: 'Localização não configurada.' } };
      }
      return { success: false, error };
    }

    const { error: empError } = await supabase
        .from('employees')
        .update({ current_clock_in_id: newEntry.id })
        .eq('id', employee.id);

    if (empError) {
        await supabase.from('time_clock_entries').delete().eq('id', newEntry.id);
        return { success: false, error: empError };
    }
    
    const updatedEmployee = { ...employee, current_clock_in_id: newEntry.id };
    this.hrState.employees.update(employees => 
        employees.map(e => e.id === employee.id ? updatedEmployee : e)
    );
    this.login(updatedEmployee);
    return { success: true, error: null };
  }


  async clockOut(): Promise<{ success: boolean; error: any }> {
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
          return { success: false, error: empError };
      }
      
       this.hrState.employees.update(employees => 
          employees.map(e => e.id === employee.id ? { ...e, current_clock_in_id: null } : e)
      );
      this.switchEmployee();
      return { success: true, error: null };
  }

  login(employee: Employee) {
    let roleName: string = 'Sem Cargo';
    if (this.demoService.isDemoMode()) {
        const rolesMap = new Map(MOCK_ROLES.map(r => [r.id, r.name]));
        roleName = (employee.role_id ? rolesMap.get(employee.role_id) : undefined) || 'Sem Cargo';
    } else {
        // FIX: Explicitly type the Map to ensure correct type inference for '.get()'.
        const rolesMap = new Map<string, string>(this.hrState.roles().map(r => [r.id, r.name]));
        roleName = (employee.role_id ? rolesMap.get(employee.role_id) : undefined) || 'Sem Cargo';
    }

    const employeeWithRole: (Employee & { role: string }) = {
      ...employee,
      role: roleName,
    };

    this.activeEmployee.set(employeeWithRole);
    sessionStorage.setItem(EMPLOYEE_STORAGE_KEY, JSON.stringify(employeeWithRole));
    this.loadActiveShift(employeeWithRole);
  }

  resetSession() {
      this.activeEmployee.set(null);
      this.activeShift.set(null);
      sessionStorage.removeItem(EMPLOYEE_STORAGE_KEY);
  }

  switchEmployee() {
    this.demoService.disableDemoMode();
    this.resetSession();
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

    if (this.demoService.isDemoMode()) {
        return '/dashboard';
    }

    for (const route of ALL_PERMISSION_KEYS) {
      if (this.hasPermission(route)) {
          return route;
      }
    }

    return '/employee-selection';
  }

  // Novo método para tentar auto-login do gerente
  attemptAutoLogin(employees: Employee[], roles: Role[]): boolean {
    // 1. Encontrar cargo de Gerente
    const managerRole = roles.find(r => r.name === 'Gerente');
    if (!managerRole) return false;

    // 2. Encontrar funcionário com esse cargo
    // Prioriza "Gerente Principal" criado pelo sistema, ou qualquer gerente
    const managerEmployee = employees.find(e => e.role_id === managerRole.id);
    
    if (managerEmployee) {
        console.log('[OperationalAuth] Auto-login successful for:', managerEmployee.name);
        this.login(managerEmployee);
        return true;
    }

    return false;
  }
}
