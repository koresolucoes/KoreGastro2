
import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { roleGuard } from './guards/role.guard';
import { loginGuard } from './guards/login.guard';
import { portalGuard } from './guards/portal.guard';

export const APP_ROUTES: Routes = [
  { 
    path: 'login', 
    loadComponent: () => import('./components/auth/login.component').then(m => m.LoginComponent),
    canActivate: [loginGuard] 
  },
  { 
    path: 'register', 
    loadComponent: () => import('./components/auth/register.component').then(m => m.RegisterComponent),
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
    path: 'onboarding', 
    loadComponent: () => import('./components/onboarding/onboarding.component').then(m => m.OnboardingComponent),
    canActivate: [authGuard]
  },
  { 
    path: 'employee-selection', 
    loadComponent: () => import('./components/auth/employee-selection.component').then(m => m.EmployeeSelectionComponent), 
    canActivate: [authGuard] 
  },
  { 
    path: 'home', 
    redirectTo: 'dashboard', 
    pathMatch: 'full' 
  },
  { 
    path: '', 
    redirectTo: 'dashboard', 
    pathMatch: 'full' 
  },
  { 
    path: 'dashboard', 
    loadComponent: () => import('./components/dashboard/dashboard.component').then(m => m.DashboardComponent), 
    canActivate: [portalGuard, roleGuard] 
  },
  { 
    path: 'my-profile', 
    loadComponent: () => import('./components/my-profile/my-profile.component').then(m => m.MyProfileComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'pos', 
    loadComponent: () => import('./components/pos/pos.component').then(m => m.PosComponent), 
    canActivate: [portalGuard, roleGuard] 
  },
  { 
    path: 'kds', 
    loadComponent: () => import('./components/kds/kds.component').then(m => m.KdsComponent), 
    canActivate: [portalGuard, roleGuard] 
  },
  { 
    path: 'ifood-kds', 
    loadComponent: () => import('./components/kds/kds.component').then(m => m.KdsComponent), 
    canActivate: [portalGuard, roleGuard] 
  },
  { 
    path: 'cashier', 
    loadComponent: () => import('./components/cashier/cashier.component').then(m => m.CashierComponent), 
    canActivate: [portalGuard, roleGuard] 
  },
  { 
    path: 'inventory', 
    loadComponent: () => import('./components/inventory/inventory.component').then(m => m.InventoryComponent), 
    canActivate: [portalGuard, roleGuard] 
  },
  { 
    path: 'inventory/audit', 
    loadComponent: () => import('./components/inventory/inventory-audit/inventory-audit.component').then(m => m.InventoryAuditComponent), 
    canActivate: [portalGuard, roleGuard] 
  },
  { 
    path: 'inventory/portioning', 
    loadComponent: () => import('./components/inventory/portioning/portioning.component').then(m => m.PortioningComponent), 
    canActivate: [portalGuard, roleGuard] 
  },
  { 
    path: 'requisitions', 
    loadComponent: () => import('./components/requisitions/requisitions.component').then(m => m.RequisitionsComponent), 
    canActivate: [portalGuard, roleGuard] 
  },
  { 
    path: 'purchasing', 
    loadComponent: () => import('./components/purchasing/purchasing.component').then(m => m.PurchasingComponent), 
    canActivate: [portalGuard, roleGuard] 
  },
  { 
    path: 'suppliers', 
    loadComponent: () => import('./components/suppliers/suppliers.component').then(m => m.SuppliersComponent), 
    canActivate: [portalGuard, roleGuard] 
  },
  { 
    path: 'customers', 
    loadComponent: () => import('./components/customers/customers.component').then(m => m.CustomersComponent), 
    canActivate: [portalGuard, roleGuard] 
  },
  { 
    path: 'menu-builder', 
    loadComponent: () => import('./components/menu-builder/menu-builder.component').then(m => m.MenuBuilderComponent), 
    canActivate: [portalGuard, roleGuard] 
  },
  { 
    path: 'menu', 
    loadComponent: () => import('./components/menu/menu.component').then(m => m.MenuComponent), 
    canActivate: [portalGuard, roleGuard] 
  },
  { 
    path: 'menu/:userId', 
    loadComponent: () => import('./components/menu/menu.component').then(m => m.MenuComponent) 
  }, // Public menu route
  { 
    path: 'ifood-menu', 
    loadComponent: () => import('./components/ifood-menu/ifood-menu.component').then(m => m.IfoodMenuComponent), 
    canActivate: [portalGuard, roleGuard] 
  },
  { 
    path: 'ifood-store-manager', 
    loadComponent: () => import('./components/ifood-store-manager/ifood-store-manager.component').then(m => m.IfoodStoreManagerComponent), 
    canActivate: [portalGuard, roleGuard] 
  },
  { 
    path: 'book/:userId', 
    loadComponent: () => import('./components/public-booking/public-booking.component').then(m => m.PublicBookingComponent) 
  }, // Public booking route
  { 
    path: 't/:sessionToken', 
    loadComponent: () => import('./components/menu/menu.component').then(m => m.MenuComponent) 
  }, // Public table/order route
  { 
    path: 'menu/:userId/t/:sessionToken', 
    loadComponent: () => import('./components/menu/menu.component').then(m => m.MenuComponent) 
  }, // Public table/order route with userId constraint
  { 
    path: 'technical-sheets', 
    loadComponent: () => import('./components/technical-sheets/technical-sheets.component').then(m => m.TechnicalSheetsComponent), 
    canActivate: [portalGuard, roleGuard] 
  },
  { 
    path: 'mise-en-place', 
    loadComponent: () => import('./components/mise-en-place/mise-en-place.component').then(m => m.MiseEnPlaceComponent), 
    canActivate: [portalGuard, roleGuard] 
  },
  { 
    path: 'performance', 
    loadComponent: () => import('./components/performance/performance.component').then(m => m.PerformanceComponent), 
    canActivate: [portalGuard, roleGuard] 
  },
  { 
    path: 'reports', 
    loadComponent: () => import('./components/reports/reports.component').then(m => m.ReportsComponent), 
    canActivate: [portalGuard, roleGuard] 
  },
  { 
    path: 'whatsapp-chats', 
    loadComponent: () => import('./components/whatsapp-chats/whatsapp-chats.component').then(m => m.WhatsappChatsComponent),
    canActivate: [portalGuard, roleGuard]
  },
  { 
    path: 'employees', 
    loadComponent: () => import('./components/employees/employees.component').then(m => m.EmployeesComponent), 
    canActivate: [portalGuard, roleGuard] 
  },
  { 
    path: 'schedules', 
    loadComponent: () => import('./components/schedules/schedules.component').then(m => m.SchedulesComponent), 
    canActivate: [portalGuard, roleGuard] 
  },
  { 
    path: 'my-leave', 
    loadComponent: () => import('./components/my-leave/my-leave.component').then(m => m.MyLeaveComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'payroll', 
    loadComponent: () => import('./components/payroll/payroll.component').then(m => m.PayrollComponent), 
    canActivate: [portalGuard, roleGuard] 
  },
  { 
    path: 'settings', 
    loadComponent: () => import('./components/settings/settings.component').then(m => m.SettingsComponent), 
    canActivate: [portalGuard, roleGuard] 
  },
  { 
    path: 'reservations', 
    loadComponent: () => import('./components/reservations/reservations.component').then(m => m.ReservationsComponent), 
    canActivate: [portalGuard, roleGuard] 
  },
  { 
    path: 'time-clock', 
    loadComponent: () => import('./components/time-clock/time-clock.component').then(m => m.TimeClockComponent), 
    canActivate: [roleGuard] 
  },
  { 
    path: 'leave-management', 
    loadComponent: () => import('./components/leave-management/leave-management.component').then(m => m.LeaveManagementComponent), 
    canActivate: [portalGuard, roleGuard] 
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
    canActivate: [portalGuard, roleGuard] 
  },
  { 
    path: 'checklists', 
    loadComponent: () => import('./components/checklists/checklists.component').then(m => m.ChecklistsComponent), 
    canActivate: [portalGuard, roleGuard] 
  },
  { 
    path: 'temperatures', 
    loadComponent: () => import('./components/temperatures/temperatures.component').then(m => m.TemperaturesComponent), 
    canActivate: [portalGuard, roleGuard] 
  },
  {
    path: 'support',
    loadComponent: () => import('./components/support-client/support-client.component').then(m => m.SupportClientComponent),
    canActivate: [roleGuard]
  },
  { 
    path: 'subscription', 
    loadComponent: () => import('./components/subscription/subscription.component').then(m => m.SubscriptionComponent) 
  },
  { 
    path: '**', 
    redirectTo: 'dashboard' 
  }
];

