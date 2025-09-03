
import { Component, ChangeDetectionStrategy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Employee } from '../../models/db.models';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { OperationalAuthService } from '../../services/operational-auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-employee-selection',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './employee-selection.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmployeeSelectionComponent {
  private stateService = inject(SupabaseStateService);
  private operationalAuth = inject(OperationalAuthService);
  private router = inject(Router);

  employees = this.stateService.employees;
  selectedEmployee = signal<Employee | null>(null);
  pinInput = signal('');
  loginError = signal(false);

  pinDisplay = computed(() => '●'.repeat(this.pinInput().length));

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
}