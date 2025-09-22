import { Injectable, signal } from '@angular/core';
import { Employee, Role, RolePermission, Schedule, LeaveRequest } from '../models/db.models';

@Injectable({ providedIn: 'root' })
export class HrStateService {
  employees = signal<Employee[]>([]);
  roles = signal<Role[]>([]);
  rolePermissions = signal<RolePermission[]>([]);
  schedules = signal<Schedule[]>([]);
  leaveRequests = signal<LeaveRequest[]>([]);

  clearData() {
    this.employees.set([]);
    this.roles.set([]);
    this.rolePermissions.set([]);
    this.schedules.set([]);
    this.leaveRequests.set([]);
  }
}
