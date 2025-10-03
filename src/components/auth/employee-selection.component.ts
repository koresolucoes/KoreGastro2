
import { Component, ChangeDetectionStrategy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Employee } from '../../models/db.models';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { SubscriptionStateService } from '../../services/subscription-state.service';
import { HrStateService } from '../../services/hr-state.service';
import { OperationalAuthService } from '../../services/operational-auth.service';
import { SettingsDataService } from '../../services/settings-data.service';
import { NotificationService } from '../../services/notification.service';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-employee-selection',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './employee-selection.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmployeeSelectionComponent {
  private stateService = inject(SupabaseStateService);
  private operationalAuth = inject(OperationalAuthService);
  private settingsDataService = inject(SettingsDataService);
  private notificationService = inject(NotificationService);
  // FIX: Explicitly type the injected Router to resolve property access errors.
  private router: Router = inject(Router);
  private subscriptionState = inject(SubscriptionStateService);
  private hrState = inject(HrStateService);

  hasActiveSubscription = this.subscriptionState.hasActiveSubscription;
  isDataLoaded = this.stateService.isDataLoaded;
  isTrialing = this.subscriptionState.isTrialing;
  trialDaysRemaining = this.subscriptionState.trialDaysRemaining;

  employees = computed(() => {
    // FIX: Access roles from the correct state service
    const rolesMap = new Map(this.hrState.roles().map(r => [r.id, r.name]));
    // FIX: Access employees from the correct state service
    return this.hrState.employees().map(e => ({
      ...e,
      role: e.role_id ? rolesMap.get(e.role_id) || 'Sem Cargo' : 'Sem Cargo'
    }));
  });
  
  // States for different stages
  selectedEmployee = signal<Employee | null>(null); // For PIN entry
  confirmationEmployee = signal<Employee | null>(null); // For clock-in confirmation

  pinInput = signal('');
  loginError = signal(false);
  pinDisplay = computed(() => '●'.repeat(this.pinInput().length));

  // New state for first-time user onboarding
  newManagerName = signal('');
  newManagerPin = signal('');
  isCreatingManager = signal(false);

  selectEmployee(employee: Employee) {
    if (employee.pin) {
      // PIN required, show PIN modal
      this.selectedEmployee.set(employee);
      this.pinInput.set('');
      this.loginError.set(false);
    } else { // No PIN required
      if (!employee.current_clock_in_id) {
        // No PIN, not clocked in -> show clock-in confirmation
        this.confirmationEmployee.set(employee);
      } else {
        // No PIN, already clocked in -> just log in
        this.handleSuccessfulLogin(employee);
      }
    }
  }
  
  private handleSuccessfulLogin(employee: Employee) {
    this.operationalAuth.login(employee);
    const defaultRoute = this.operationalAuth.getDefaultRoute();
    this.router.navigate([defaultRoute]);
  }

  cancelPinLogin() {
    this.selectedEmployee.set(null);
    this.pinInput.set('');
    this.loginError.set(false);
  }

  handlePinInput(digit: string) {
    if (this.pinInput().length < 4) {
      this.pinInput.update(pin => pin + digit);
      if (this.pinInput().length === 4) {
        this.attemptLogin();
      }
    }
  }

  clearPin() {
    this.pinInput.set('');
    this.loginError.set(false);
  }

  attemptLogin() {
    const employee = this.selectedEmployee();
    if (this.pinInput() === employee?.pin) {
        this.selectedEmployee.set(null); // Close PIN modal
        if (!employee.current_clock_in_id) {
            // Correct PIN, not clocked in -> show clock-in confirmation
            this.confirmationEmployee.set(employee);
        } else {
            // Correct PIN, already clocked in -> just log in
            this.handleSuccessfulLogin(employee);
        }
    } else {
        this.loginError.set(true);
        setTimeout(() => this.clearPin(), 800);
    }
  }
  
  // --- Clock-in Confirmation ---
  async confirmClockIn() {
    const employee = this.confirmationEmployee();
    if (!employee) return;
    
    const { success, error } = await this.operationalAuth.clockIn(employee);
    if (success) {
        // The service now handles login and state update
        const defaultRoute = this.operationalAuth.getDefaultRoute();
        this.router.navigate([defaultRoute]);
    } else {
        this.notificationService.show(`Erro ao iniciar turno: ${error?.message}`, 'error');
    }
    this.confirmationEmployee.set(null);
  }

  cancelClockInConfirmation() {
    this.confirmationEmployee.set(null);
  }

  // --- Onboarding ---
  async createFirstManager() {
    const name = this.newManagerName().trim();
    const pin = this.newManagerPin().trim();

    if (!name) {
      this.notificationService.show('Por favor, insira o nome do gerente.', 'warning');
      return;
    }
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      this.notificationService.show('O PIN deve conter exatamente 4 números.', 'warning');
      return;
    }

    this.isCreatingManager.set(true);
    
    // FIX: Access roles from the correct state service
    let gerenteRole = this.hrState.roles().find(r => r.name === 'Gerente');
    if (!gerenteRole) {
        const { data: newRole, error: roleError } = await this.settingsDataService.addRole('Gerente');
        if (roleError || !newRole) {
            this.notificationService.show(`Erro ao criar cargo de Gerente: ${roleError?.message}`, 'error');
            this.isCreatingManager.set(false);
            return;
        }
        this.hrState.roles.update(roles => [...roles, newRole]);
        gerenteRole = newRole;

        // Seed all permissions for the new manager role to ensure they are a super-admin
        const { success: permSuccess, error: permError } = await this.settingsDataService.grantAllPermissionsToRole(gerenteRole.id);
        if (!permSuccess) {
            this.notificationService.show(`Aviso: Falha ao definir permissões para o Gerente: ${permError?.message}`, 'warning');
        }
    }
    
    const { success, error } = await this.settingsDataService.addEmployee({
      name,
      pin,
      role_id: gerenteRole.id,
    });

    if (success) {
      this.notificationService.show('Usuário Gerente criado com sucesso! Agora você pode selecioná-lo para começar.', 'success');
    } else {
      this.notificationService.show(`Erro ao criar usuário: ${error?.message}`, 'error');
    }
    
    this.isCreatingManager.set(false);
  }
}