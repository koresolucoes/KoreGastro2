

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
  
  // Existing state for PIN login
  selectedEmployee = signal<Employee | null>(null);
  pinInput = signal('');
  loginError = signal(false);
  pinDisplay = computed(() => '●'.repeat(this.pinInput().length));

  // New state for first-time user onboarding
  newManagerName = signal('');
  newManagerPin = signal('');
  isCreatingManager = signal(false);

  selectEmployee(employee: Employee) {
    if (employee.pin) {
      this.selectedEmployee.set(employee);
      this.pinInput.set('');
      this.loginError.set(false);
    } else {
      this.handleSuccessfulLogin(employee);
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
    if (this.pinInput() === this.selectedEmployee()?.pin) {
      this.handleSuccessfulLogin(this.selectedEmployee()!);
    } else {
      this.loginError.set(true);
      setTimeout(() => this.clearPin(), 800);
    }
  }
  
  // New method for creating the first manager
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
      // The component will automatically update via realtime subscription.
    } else {
      await this.notificationService.alert(`Erro ao criar usuário: ${error?.message}`);
    }
    
    this.isCreatingManager.set(false);
  }
}