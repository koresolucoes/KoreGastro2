
import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { roleGuard } from './guards/role.guard';
import { loginGuard } from './guards/login.guard';

export const APP_ROUTES: Routes = [
  { 
    path: 'login', 
    loadComponent: () => import('./components/auth/login.component').then(m => m.LoginComponent),
    canActivate: [loginGuard] 
  },
  { 
    path: 'reset-password', 
    loadComponent: () => import('./components/auth/reset-password.component').then(m => m.ResetPasswordComponent) 
  },
  { 
    path: 'demo', 
    loadComponent: () => import('./components/demo/demo-access.component').then(m => m.DemoAccessComponent) 
  },
  { 
    path: 'employee-selection', 
    loadComponent: () => import('./components/auth/employee-selection.component').then(m => m.EmployeeSelectionComponent), 
    canActivate: [authGuard] 
  },
  { 
    path: '', 
    redirectTo: 'login', 
    pathMatch: 'full' 
  },
  { 
    path: 'dashboard', 
    loadComponent: () => import('./components/dashboard/dashboard.component').then(m => m.DashboardComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'my-profile', 
    loadComponent: () => import('./components/my-profile/my-profile.component').then(m => m.MyProfileComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'pos', 
    loadComponent: () => import('./components/pos/pos.component').then(m => m.PosComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'kds', 
    loadComponent: () => import('./components/kds/kds.component').then(m => m.KdsComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'ifood-kds', 
    loadComponent: () => import('./components/ifood-kds/ifood-kds.component').then(m => m.IfoodKdsComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'cashier', 
    loadComponent: () => import('./components/cashier/cashier.component').then(m => m.CashierComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'inventory', 
    loadComponent: () => import('./components/inventory/inventory.component').then(m => m.InventoryComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'inventory/audit', 
    loadComponent: () => import('./components/inventory/inventory-audit/inventory-audit.component').then(m => m.InventoryAuditComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'inventory/portioning', 
    loadComponent: () => import('./components/inventory/portioning/portioning.component').then(m => m.PortioningComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'requisitions', 
    loadComponent: () => import('./components/requisitions/requisitions.component').then(m => m.RequisitionsComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'purchasing', 
    loadComponent: () => import('./components/purchasing/purchasing.component').then(m => m.PurchasingComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'suppliers', 
    loadComponent: () => import('./components/suppliers/suppliers.component').then(m => m.SuppliersComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'customers', 
    loadComponent: () => import('./components/customers/customers.component').then(m => m.CustomersComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'menu', 
    loadComponent: () => import('./components/menu/menu.component').then(m => m.MenuComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'menu/:userId', 
    loadComponent: () => import('./components/menu/menu.component').then(m => m.MenuComponent) 
  }, // Public menu route
  { 
    path: 'ifood-menu', 
    loadComponent: () => import('./components/ifood-menu/ifood-menu.component').then(m => m.IfoodMenuComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'ifood-store-manager', 
    loadComponent: () => import('./components/ifood-store-manager/ifood-store-manager.component').then(m => m.IfoodStoreManagerComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'book/:userId', 
    loadComponent: () => import('./components/public-booking/public-booking.component').then(m => m.PublicBookingComponent) 
  }, // Public booking route
  { 
    path: 'technical-sheets', 
    loadComponent: () => import('./components/technical-sheets/technical-sheets.component').then(m => m.TechnicalSheetsComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'mise-en-place', 
    loadComponent: () => import('./components/mise-en-place/mise-en-place.component').then(m => m.MiseEnPlaceComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'performance', 
    loadComponent: () => import('./components/performance/performance.component').then(m => m.PerformanceComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'reports', 
    loadComponent: () => import('./components/reports/reports.component').then(m => m.ReportsComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'employees', 
    loadComponent: () => import('./components/employees/employees.component').then(m => m.EmployeesComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'schedules', 
    loadComponent: () => import('./components/schedules/schedules.component').then(m => m.SchedulesComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'my-leave', 
    loadComponent: () => import('./components/my-leave/my-leave.component').then(m => m.MyLeaveComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'payroll', 
    loadComponent: () => import('./components/payroll/payroll.component').then(m => m.PayrollComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'settings', 
    loadComponent: () => import('./components/settings/settings.component').then(m => m.SettingsComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'reservations', 
    loadComponent: () => import('./components/reservations/reservations.component').then(m => m.ReservationsComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'time-clock', 
    loadComponent: () => import('./components/time-clock/time-clock.component').then(m => m.TimeClockComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'leave-management', 
    loadComponent: () => import('./components/leave-management/leave-management.component').then(m => m.LeaveManagementComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'tutorials', 
    loadComponent: () => import('./components/tutorials/tutorials-list.component').then(m => m.TutorialsListComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'tutorials/:id', 
    loadComponent: () => import('./components/tutorials/tutorial-detail.component').then(m => m.TutorialDetailComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'delivery', 
    loadComponent: () => import('./components/delivery/delivery.component').then(m => m.DeliveryComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: '**', 
    redirectTo: 'dashboard' 
  }
];
