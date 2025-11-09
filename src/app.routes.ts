import { Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { PosComponent } from './components/pos/pos.component';
import { KdsComponent } from './components/kds/kds.component';
import { InventoryComponent } from './components/inventory/inventory.component';
import { ReportsComponent } from './components/reports/reports.component';
import { SettingsComponent } from './components/settings/settings.component';
import { TechnicalSheetsComponent } from './components/technical-sheets/technical-sheets.component';
import { MenuComponent } from './components/menu/menu.component';
import { CashierComponent } from './components/cashier/cashier.component';
import { LoginComponent } from './components/auth/login.component';
import { authGuard } from './guards/auth.guard';
import { PerformanceComponent } from './components/performance/performance.component';
import { EmployeeSelectionComponent } from './components/auth/employee-selection.component';
import { roleGuard } from './guards/role.guard';
import { PurchasingComponent } from './components/purchasing/purchasing.component';
import { MiseEnPlaceComponent } from './components/mise-en-place/mise-en-place.component';
import { TutorialsListComponent } from './components/tutorials/tutorials-list.component';
import { TutorialDetailComponent } from './components/tutorials/tutorial-detail.component';
import { ReservationsComponent } from './components/reservations/reservations.component';
import { PublicBookingComponent } from './components/public-booking/public-booking.component';
import { TimeClockComponent } from './components/time-clock/time-clock.component';
import { SchedulesComponent } from './components/schedules/schedules.component';
import { LeaveManagementComponent } from './components/leave-management/leave-management.component';
import { MyLeaveComponent } from './components/my-leave/my-leave.component';
import { PayrollComponent } from './components/payroll/payroll.component';
import { EmployeesComponent } from './components/employees/employees.component';
import { CustomersComponent } from './components/customers/customers.component';
import { InventoryAuditComponent } from './components/inventory/inventory-audit/inventory-audit.component';
import { IfoodKdsComponent } from './components/ifood-kds/ifood-kds.component';
import { IfoodMenuComponent } from './components/ifood-menu/ifood-menu.component';
import { MyProfileComponent } from './components/my-profile/my-profile.component';
import { SuppliersComponent } from './components/suppliers/suppliers.component';
import { ResetPasswordComponent } from './components/auth/reset-password.component';
import { DemoAccessComponent } from './components/demo/demo-access.component';
import { loginGuard } from './guards/login.guard';
import { IfoodStoreManagerComponent } from './components/ifood-store-manager/ifood-store-manager.component';
import { DeliveryComponent } from './components/delivery/delivery.component';

export const APP_ROUTES: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [loginGuard] },
  { path: 'reset-password', component: ResetPasswordComponent },
  { path: 'demo', component: DemoAccessComponent },
  { path: 'employee-selection', component: EmployeeSelectionComponent, canActivate: [authGuard] },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard', component: DashboardComponent, canActivate: [roleGuard] },
  { path: 'my-profile', component: MyProfileComponent, canActivate: [roleGuard] },
  { path: 'pos', component: PosComponent, canActivate: [roleGuard] },
  { path: 'kds', component: KdsComponent, canActivate: [roleGuard] },
  { path: 'ifood-kds', component: IfoodKdsComponent, canActivate: [roleGuard] },
  { path: 'cashier', component: CashierComponent, canActivate: [roleGuard] },
  { path: 'inventory', component: InventoryComponent, canActivate: [roleGuard] },
  { path: 'inventory/audit', component: InventoryAuditComponent, canActivate: [roleGuard] },
  { path: 'purchasing', component: PurchasingComponent, canActivate: [roleGuard] },
  { path: 'suppliers', component: SuppliersComponent, canActivate: [roleGuard] },
  { path: 'customers', component: CustomersComponent, canActivate: [roleGuard] },
  { path: 'menu', component: MenuComponent, canActivate: [roleGuard] },
  { path: 'menu/:userId', component: MenuComponent }, // Public menu route
  { path: 'ifood-menu', component: IfoodMenuComponent, canActivate: [roleGuard] },
  { path: 'ifood-store-manager', component: IfoodStoreManagerComponent, canActivate: [roleGuard] },
  { path: 'book/:userId', component: PublicBookingComponent }, // Public booking route
  { path: 'technical-sheets', component: TechnicalSheetsComponent, canActivate: [roleGuard] },
  { path: 'mise-en-place', component: MiseEnPlaceComponent, canActivate: [roleGuard] },
  { path: 'performance', component: PerformanceComponent, canActivate: [roleGuard] },
  { path: 'reports', component: ReportsComponent, canActivate: [roleGuard] },
  { path: 'employees', component: EmployeesComponent, canActivate: [roleGuard] },
  { path: 'schedules', component: SchedulesComponent, canActivate: [roleGuard] },
  { path: 'my-leave', component: MyLeaveComponent, canActivate: [roleGuard] },
  { path: 'payroll', component: PayrollComponent, canActivate: [roleGuard] },
  { path: 'settings', component: SettingsComponent, canActivate: [roleGuard] },
  { path: 'reservations', component: ReservationsComponent, canActivate: [roleGuard] },
  { path: 'time-clock', component: TimeClockComponent, canActivate: [roleGuard] },
  { path: 'leave-management', component: LeaveManagementComponent, canActivate: [roleGuard] },
  { path: 'tutorials', component: TutorialsListComponent, canActivate: [roleGuard] },
  { path: 'tutorials/:id', component: TutorialDetailComponent, canActivate: [roleGuard] },
  { path: 'delivery', component: DeliveryComponent, canActivate: [roleGuard] },
  { path: '**', redirectTo: 'dashboard' } // Wildcard route for a 404 page
];