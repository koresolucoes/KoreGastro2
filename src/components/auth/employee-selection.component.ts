


import { Component, ChangeDetectionStrategy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Employee } from '../../models/db.models';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { OperationalAuthService } from '../../services/operational-auth.service';
import { SettingsDataService } from '../../services/settings-data.service';
import { NotificationService } from '../../services/notification.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-employee-selection',
  standalone: true,
  imports: [CommonModule, FormsModule], // Add FormsModule
  templateUrl: './employee-selection.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmployeeSelectionComponent {
  private stateService = inject(SupabaseStateService);
  private operationalAuth = inject(OperationalAuthService);
  private settingsDataService = inject(SettingsDataService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);

  employees = this.stateService.employees;
  
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
        await this.notificationService.alert(`Erro ao iniciar turno: ${error?.message}`);
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
      await this.notificationService.alert('Por favor, insira o nome do gerente.');
      return;
    }
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      await this.notificationService.alert('O PIN deve conter exatamente 4 números.');
      return;
    }

    this.isCreatingManager.set(true);
    const { success, error } = await this.settingsDataService.addEmployee({
      name,
      pin,
      role: 'Gerente',
    });

    if (success) {
      await this.notificationService.alert('Usuário Gerente criado com sucesso! Agora você pode selecioná-lo para começar.');
    } else {
      await this.notificationService.alert(`Erro ao criar usuário: ${error?.message}`);
    }
    
    this.isCreatingManager.set(false);
  }
}
