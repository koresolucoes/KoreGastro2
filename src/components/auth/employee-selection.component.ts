
import { Component, ChangeDetectionStrategy, signal, computed, inject, effect } from '@angular/core';
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
  private router: Router = inject(Router);
  private subscriptionState = inject(SubscriptionStateService);
  private hrState = inject(HrStateService);

  hasActiveSubscription = this.subscriptionState.hasActiveSubscription;
  isDataLoaded = this.stateService.isDataLoaded;
  isTrialing = this.subscriptionState.isTrialing;
  trialDaysRemaining = this.subscriptionState.trialDaysRemaining;

  employees = computed(() => {
    const rolesMap = new Map(this.hrState.roles().map(r => [r.id, r.name]));
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

  constructor() {
    effect(() => {
        // Se os dados foram carregados e não há funcionários, redirecionar para onboarding
        // Isso substitui o formulário "in-place" antigo
        if (this.isDataLoaded() && this.employees().length === 0) {
            this.router.navigate(['/onboarding']);
        }
    });
  }

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
}
