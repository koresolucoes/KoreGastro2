import { Injectable, signal, computed, effect, inject } from '@angular/core';
import { Employee } from '../models/db.models';
import { Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, take } from 'rxjs';

const EMPLOYEE_STORAGE_KEY = 'active_employee';

const PERMISSIONS: Record<string, string[]> = {
  'Gerente': ['/dashboard', '/pos', '/kds', '/cashier', '/menu', '/inventory', '/technical-sheets', '/performance', '/reports', '/settings'],
  'Caixa': ['/pos', '/cashier', '/menu', '/mise-en-place'],
  'Garçom': ['/pos', '/menu', '/mise-en-place'],
  'Cozinha': ['/kds', '/mise-en-place'],
};

const DEFAULT_ROUTES: Record<string, string> = {
  'Gerente': '/dashboard',
  'Caixa': '/cashier',
  'Garçom': '/pos',
  'Cozinha': '/kds',
};

@Injectable({
  providedIn: 'root',
})
export class OperationalAuthService {
  private router = inject(Router);
  activeEmployee = signal<Employee | null>(null);

  constructor() {
    const storedEmployee = sessionStorage.getItem(EMPLOYEE_STORAGE_KEY);
    if (storedEmployee) {
      this.activeEmployee.set(JSON.parse(storedEmployee));
    }
  }

  login(employee: Employee) {
    this.activeEmployee.set(employee);
    sessionStorage.setItem(EMPLOYEE_STORAGE_KEY, JSON.stringify(employee));
  }

  logout() {
    this.activeEmployee.set(null);
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