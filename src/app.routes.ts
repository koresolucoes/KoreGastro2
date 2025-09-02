
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

export const APP_ROUTES: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'pos', component: PosComponent, canActivate: [authGuard] },
  { path: 'kds', component: KdsComponent, canActivate: [authGuard] },
  { path: 'cashier', component: CashierComponent, canActivate: [authGuard] },
  { path: 'inventory', component: InventoryComponent, canActivate: [authGuard] },
  { path: 'menu', component: MenuComponent, canActivate: [authGuard] },
  { path: 'technical-sheets', component: TechnicalSheetsComponent, canActivate: [authGuard] },
  { path: 'performance', component: PerformanceComponent, canActivate: [authGuard] },
  { path: 'reports', component: ReportsComponent, canActivate: [authGuard] },
  { path: 'settings', component: SettingsComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: 'dashboard' } // Wildcard route for a 404 page
];
