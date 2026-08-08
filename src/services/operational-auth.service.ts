import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

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
import { SettingsStateService } from './settings-state.service';
import { TimeClockReceiptService, TimeClockReceipt } from './time-clock-receipt.service';
import { NtpService } from './ntp.service';
import { UnitContextService } from './unit-context.service';
import { PortalContextService } from './portal-context.service';

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
  private settingsState = inject(SettingsStateService);
  private receiptService = inject(TimeClockReceiptService);
  private ntpService = inject(NtpService);
  private http = inject(HttpClient);
  private unitContextService = inject(UnitContextService);
  
  activeEmployee = signal<(Employee & { role: string }) | null>(null);
  activeShift = signal<TimeClockEntry | null>(null);
  operatorAuthInitialized = signal(false);

  private permissionCache = new Map<string, boolean>();

  public clearPermissionCache() {
    this.permissionCache.clear();
  }

  constructor() {
    this.initializeOperator();

    effect(() => {
      if (this.demoService.isDemoMode() && !this.activeEmployee()) {
        this.loginAsDemoUser();
      }
    });

    // Invalidate local permissions cache when roles, active employee, or subscription permissions change
    effect(() => {
      this.hrState.rolePermissions();
      this.subscriptionState.activeUserPermissions();
      this.activeEmployee();
      this.clearPermissionCache();
    });

    // Auto-reset operator session when switching to a different store context
    effect(() => {
      const activeUnitId = this.unitContextService.activeUnitId();
      const employee = this.activeEmployee();
      if (employee && activeUnitId && employee.user_id && employee.user_id !== activeUnitId && !this.demoService.isDemoMode()) {
        this.resetSession();
        this.router.navigate(['/employee-selection']);
      }
    });
  }

  private async initializeOperator() {
    try {
        const storedEmployee = sessionStorage.getItem(EMPLOYEE_STORAGE_KEY);
        if (storedEmployee && storedEmployee !== 'undefined') {
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
      if (!employee) return;
      
      const state = this.shiftButtonState().action;
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      try {
        const res = await firstValueFrom(this.http.post<any>('/api/rh/ponto/bater-ponto', {
          employeeId: employee.id,
          pin: employee.pin,
          restaurantId: employee.user_id,
        }, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        }));
        
        if (state === 'end_shift') {
           this.switchEmployee();
           return;
        }
      } catch (err: any) {
        this.notificationService.show(err.error?.detail || err.message, 'error', 6000);
      }
      
      await this.loadActiveShift(employee);
  }

  // Receipts are now generated and stored by the backend API

  private getCurrentLocation(): Promise<{ latitude: number; longitude: number }> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocalização não suportada'));
      } else {
        navigator.geolocation.getCurrentPosition(
          pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
          err => reject(err),
          { timeout: 10000 }
        );
      }
    });
  }

  async clockIn(employee: Employee, location?: { latitude: number; longitude: number }): Promise<{ success: boolean; error: unknown }> {
    if (this.demoService.isDemoMode()) return { success: true, error: null };
    
    if (!location) {
      try {
        location = await this.getCurrentLocation();
      } catch (e) {
        // Ignora erro se não for obrigatório
      }
    }
    
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    try {
      const res = await firstValueFrom(this.http.post<any>('/api/rh/ponto/bater-ponto', {
        employeeId: employee.id,
        pin: employee.pin,
        restaurantId: employee.user_id,
        latitude: location?.latitude,
        longitude: location?.longitude
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      }));
      
      // Update local state to reflect clock in
      this.hrState.employees.update(employees => 
          employees.map(e => e.id === employee.id ? { ...e, current_clock_in_id: 'active' } : e)
      );
      const updatedEmployee = { ...employee, current_clock_in_id: 'active' };
      this.login(updatedEmployee);
      
      return { success: true, error: null };
    } catch (error: any) {
      if (error.error?.detail) {
        this.notificationService.show(error.error.detail, 'error');
      }
      return { success: false, error: error.error || error };
    }
  }


  async clockOut(): Promise<{ success: boolean; error: unknown }> {
      const employee = this.activeEmployee();
      if (!employee || !employee.current_clock_in_id) {
          this.switchEmployee();
          return { success: true, error: null };
      }
      
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      try {
        await firstValueFrom(this.http.post<any>('/api/rh/ponto/bater-ponto', {
          employeeId: employee.id,
          pin: employee.pin,
          restaurantId: employee.user_id,
        }, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        }));
        
        this.hrState.employees.update(employees => 
            employees.map(e => e.id === employee.id ? { ...e, current_clock_in_id: null } : e)
        );
        this.switchEmployee();
        return { success: true, error: null };
      } catch (error: any) {
        return { success: false, error: error.error || error };
      }
  }

  login(employee: Employee) {
    let roleName: string = 'Sem Cargo';
    const rolesMap = new Map<string, string>(this.hrState.roles().map(r => [r.id, r.name]));
    roleName = (employee.role_id ? rolesMap.get(employee.role_id) : undefined) || 'Sem Cargo';

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

    const cacheKey = `${employee.id}:${employee.role_id}:${routeKey}`;
    if (this.permissionCache.has(cacheKey)) {
      return this.permissionCache.get(cacheKey)!;
    }

    let allowed = false;

    // Special case for home: always allowed if logged in
    if (routeKey === '/home' || routeKey === '/support') {
      allowed = true;
    } else if (routeKey === '/tutorials') {
      // Special case for tutorials: bypass subscription check, only role permission matters.
      const rolePermissions = this.hrState.rolePermissions();
      allowed = rolePermissions.some(p => p.role_id === employee.role_id && p.permission_key === routeKey);
    } else {
      // For all other routes, an active subscription is a prerequisite.
      const hasActiveSub = this.subscriptionState.hasActiveSubscription();
      if (!hasActiveSub) {
        allowed = false;
      } else if (routeKey === '/my-profile') {
        // Special case for /my-profile: if subscription is active, access is granted.
        allowed = true;
      } else {
        // For all other regular routes, both plan and role permissions are required.
        let hasPlanPermission = this.subscriptionState.activeUserPermissions().has(routeKey);
        const roleName = (employee.role || '').toLowerCase();
        const isGerente = roleName.includes('gerente') || roleName.includes('admin');
        let hasRolePermission = isGerente || this.hrState.rolePermissions().some(p => p.role_id === employee.role_id && p.permission_key === routeKey);

        // Cross-reference: if they have access to settings, give them access to whatsapp-chats
        if (routeKey === '/whatsapp-chats' && (!hasPlanPermission || !hasRolePermission)) {
          hasPlanPermission = this.subscriptionState.activeUserPermissions().has('/settings');
          hasRolePermission = isGerente || this.hrState.rolePermissions().some(p => p.role_id === employee.role_id && p.permission_key === '/settings');
        }

        allowed = hasPlanPermission && hasRolePermission;
      }
    }

    this.permissionCache.set(cacheKey, allowed);
    return allowed;
  }

  private portalContext = inject(PortalContextService);

  getDefaultRoute(): string {
    const employee = this.activeEmployee();
    if (!employee) return '/employee-selection';

    const mode = this.portalContext.currentMode();

    if (mode === 'operacao') {
      if (this.hasPermission('/pos') && this.portalContext.isRouteAllowedInCurrentPortal('/pos')) return '/pos';
      if (this.hasPermission('/kds') && this.portalContext.isRouteAllowedInCurrentPortal('/kds')) return '/kds';
      if (this.hasPermission('/cashier') && this.portalContext.isRouteAllowedInCurrentPortal('/cashier')) return '/cashier';
      if (this.hasPermission('/delivery') && this.portalContext.isRouteAllowedInCurrentPortal('/delivery')) return '/delivery';
    }

    // Verify if dashboard is explicitly accessible in gestao
    if (this.hasPermission('/dashboard') && this.portalContext.isRouteAllowedInCurrentPortal('/dashboard')) return '/dashboard';

    // Common operational screens
    if (this.hasPermission('/pos') && this.portalContext.isRouteAllowedInCurrentPortal('/pos')) return '/pos';
    if (this.hasPermission('/kds') && this.portalContext.isRouteAllowedInCurrentPortal('/kds')) return '/kds';
    if (this.hasPermission('/cashier') && this.portalContext.isRouteAllowedInCurrentPortal('/cashier')) return '/cashier';
    if (this.hasPermission('/delivery') && this.portalContext.isRouteAllowedInCurrentPortal('/delivery')) return '/delivery';

    // Fallbacks
    const roleName = (employee.role || '').toLowerCase();
    const isGerente = roleName.includes('gerente') || roleName.includes('admin');
    
    if (isGerente && mode !== 'operacao') return '/dashboard';

    const rolePerms = this.hrState.rolePermissions().filter(p => p.role_id === employee.role_id && this.portalContext.isRouteAllowedInCurrentPortal(p.permission_key));
    if (rolePerms.length > 0) {
        return rolePerms[0].permission_key;
    }

    return this.portalContext.getPortalDefaultRoute(mode === 'operacao' ? 'operacao' : 'gestao');
  }
}
