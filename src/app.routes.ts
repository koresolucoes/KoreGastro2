
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

export const APP_ROUTES: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'employee-selection', component: EmployeeSelectionComponent, canActivate: [authGuard] },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard', component: DashboardComponent, canActivate: [roleGuard] },
  { path: 'pos', component: PosComponent, canActivate: [roleGuard] },
  { path: 'kds', component: KdsComponent, canActivate: [roleGuard] },
  { path: 'cashier', component: CashierComponent, canActivate: [roleGuard] },
  { path: 'inventory', component: InventoryComponent, canActivate: [roleGuard] },
  { path: 'purchasing', component: PurchasingComponent, canActivate: [roleGuard], data: { roles: ['Gerente'] } },
  { path: 'menu', component: MenuComponent, canActivate: [roleGuard] },
  { path: 'menu/:userId', component: MenuComponent }, // Public menu route
  { path: 'technical-sheets', component: TechnicalSheetsComponent, canActivate: [roleGuard] },
  { path: 'mise-en-place', component: MiseEnPlaceComponent, canActivate: [roleGuard], data: { roles: ['Gerente', 'Cozinha'] } },
  { path: 'performance', component: PerformanceComponent, canActivate: [roleGuard] },
  { path: 'reports', component: ReportsComponent, canActivate: [roleGuard] },
  { path: 'settings', component: SettingsComponent, canActivate: [roleGuard] },
  { path: '**', redirectTo: 'dashboard' } // Wildcard route for a 404 page
];
