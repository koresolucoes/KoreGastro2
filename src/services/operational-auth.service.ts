
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
      const activeStoreId = this.unitContextService.activeStoreId();
      const employee = this.activeEmployee();
      if (employee && activeStoreId && employee.user_id && employee.user_id !== activeStoreId && !this.demoService.isDemoMode()) {
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
      const networkTime = await this.ntpService.getNetworkTime();
      const now = networkTime.toISOString();
      
      switch (state) {
          case 'start_break':
              await supabase.from('time_clock_entries').update({ break_start_time: now }).eq('id', shift.id);
              await this.generateAndStoreReceipt(employee, 'INICIO_PAUSA', now, shift.id);
              break;
          case 'end_break':
              await supabase.from('time_clock_entries').update({ break_end_time: now }).eq('id', shift.id);
              await this.generateAndStoreReceipt(employee, 'FIM_PAUSA', now, shift.id);
              break;
          case 'end_shift':
              await this.clockOut();
              return; // clockOut handles logout and navigation
      }
      
      // Refresh shift state after action
      await this.loadActiveShift(employee);
  }

  private async generateAndStoreReceipt(
      employee: Employee, 
      action: 'INICIO_TURNO' | 'INICIO_PAUSA' | 'FIM_PAUSA' | 'FIM_TURNO',
      timestamp: string,
      shiftId: string
  ): Promise<TimeClockReceipt> {
      // 1. Gera o NSR simulado (uuid simplificado ou timestamp)
      const nsr = String(Date.now());
      
      // 2. Prepara os dados para o Hash
      const data = `${nsr}|${employee.id}|${action}|${timestamp}`;
      const msgUint8 = new TextEncoder().encode(data);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      const receipt: TimeClockReceipt = {
          employeeName: employee.name,
          matricula: employee.bank_details?.matricula || '',
          cpf: employee.cpf || '',
          action,
          timestamp,
          hash: hashHex,
          nsr
      };

      // 3. Salva no banco de logs do sistema (imutável, seguro)
      await supabase.from('system_logs').insert({
          user_id: employee.user_id,
          employee_id: employee.id,
          action: `PONTO_${action}`,
          details: JSON.stringify({ nsr, hash: hashHex, timestamp, shiftId })
      });

      // 4. Mostra o modal
      this.receiptService.showReceipt(receipt);
      return receipt;
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

  private getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  async clockIn(employee: Employee): Promise<{ success: boolean; error: unknown }> {
    const profile = this.settingsState.companyProfile();
    const isLocationRequired = !!(profile?.latitude && profile?.longitude && profile?.time_clock_radius && profile.time_clock_radius > 0);

    let location: { latitude: number, longitude: number } | null = null;
    
    if (isLocationRequired) {
      try {
        location = await this.getCurrentLocation();
        
        const distance = this.getDistance(location.latitude, location.longitude, profile!.latitude!, profile!.longitude!);
        if (distance > profile!.time_clock_radius!) {
             this.notificationService.show('Você está muito longe do restaurante para bater o ponto.', 'error');
             return { success: false, error: new Error('Distância inválida.') };
        }
      } catch (locationError: unknown) {
        this.notificationService.show((locationError as any).message, 'error', 6000);
        return { success: false, error: locationError };
      }
    } else {
      try {
        location = await this.getCurrentLocation();
      } catch (e) {
        // Ignora erro se não for obrigatório
      }
    }
    
    const networkTime = await this.ntpService.getNetworkTime();
    const inTime = networkTime.toISOString();

    const { data: newEntry, error } = await supabase
      .from('time_clock_entries')
      .insert({ 
        employee_id: employee.id,
        clock_in_time: inTime,
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
      })
      .select('id, clock_in_time')
      .single();

    if (error) {
       // Check for custom error from RLS policy
       if ((error as any).message.includes('distancia_invalida')) {
        this.notificationService.show('Você está muito longe do restaurante para bater o ponto.', 'error');
        return { success: false, error: { message: 'Distância inválida.' } };
      }
       if ((error as any).message.includes('localizacao_nao_configurada')) {
        this.notificationService.show('A localização do restaurante não foi configurada pelo gestor.', 'error');
        return { success: false, error: { message: 'Localização não configurada.' } };
      }
      return { success: false, error };
    }

    await this.generateAndStoreReceipt(employee, 'INICIO_TURNO', newEntry.clock_in_time, newEntry.id);

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


  async clockOut(): Promise<{ success: boolean; error: unknown }> {
      const employee = this.activeEmployee();
      if (!employee || !employee.current_clock_in_id) {
          // If for some reason they are logged in without a clock-in record, just log them out.
          this.switchEmployee();
          return { success: true, error: null };
      }
  
      const networkTime = await this.ntpService.getNetworkTime();
      const outTime = networkTime.toISOString();
      const { error } = await supabase
          .from('time_clock_entries')
          .update({ clock_out_time: outTime })
          .eq('id', employee.current_clock_in_id);
  
      if (error) return { success: false, error };

      await this.generateAndStoreReceipt(employee, 'FIM_TURNO', outTime, employee.current_clock_in_id);
  
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

  
  async verifyPin(employeeId: string, pin: string, storeId: string): Promise<{ success: boolean; employee?: Employee, message?: string, opToken?: string }> {
      try {
          const { data: creds } = await supabase.from('store_integration_credentials').select('external_api_key').eq('store_id', storeId).single();
          if (!creds || !creds.external_api_key) return { success: false, message: 'Chave de API não configurada' };

          const res = await fetch('/api/rh/verificar-pin', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${creds.external_api_key}`
              },
              body: JSON.stringify({ employeeId, pin, restaurantId: storeId })
          });
          const data = await res.json();
          if (res.ok && data.success) {
              return { success: true, employee: data.employee, opToken: data.opToken };
          }
          return { success: false, message: data.message || 'PIN incorreto' };
      } catch (e: any) {
          return { success: false, message: e.message || 'Erro na comunicação' };
      }
  }

  
  async verifyManagerPin(pin: string, storeId: string): Promise<{ success: boolean; employee?: Employee, message?: string, opToken?: string }> {
      try {
          const { data: creds } = await supabase.from('store_integration_credentials').select('external_api_key').eq('store_id', storeId).single();
          if (!creds || !creds.external_api_key) return { success: false, message: 'Chave de API não configurada' };

          const res = await fetch('/api/rh/verificar-pin', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${creds.external_api_key}`
              },
              body: JSON.stringify({ roleName: 'Gerente', pin, restaurantId: storeId })
          });
          const data = await res.json();
          if (res.ok && data.success) {
              return { success: true, employee: data.employee, opToken: data.opToken };
          }
          return { success: false, message: data.message || 'PIN incorreto' };
      } catch (e: any) {
          return { success: false, message: e.message || 'Erro na comunicação' };
      }
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
