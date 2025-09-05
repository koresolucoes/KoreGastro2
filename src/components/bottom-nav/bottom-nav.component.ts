import { Component, ChangeDetectionStrategy, signal, inject, computed } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { OperationalAuthService } from '../../services/operational-auth.service';

interface NavItem {
  name: string;
  path: string;
  icon: string;
  roles: string[];
}

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './bottom-nav.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BottomNavComponent {
  authService = inject(AuthService);
  operationalAuthService = inject(OperationalAuthService);
  router = inject(Router);

  currentUser = this.authService.currentUser;
  activeEmployee = this.operationalAuthService.activeEmployee;
  
  isOffCanvasOpen = signal(false);
  
  // Copied from sidebar component
  allNavItems: NavItem[] = [
    { name: 'Dashboard', path: '/dashboard', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', roles: ['Gerente'] },
    { name: 'PDV', path: '/pos', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z', roles: ['Gerente', 'Caixa', 'Garçom'] },
    { name: 'Cozinha (KDS)', path: '/kds', icon: 'M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375', roles: ['Gerente', 'Cozinha'] },
    { name: 'Caixa', path: '/cashier', icon: 'M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm2.498-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zM8.25 6h7.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', roles: ['Gerente', 'Caixa'] },
    { name: 'Cardápio Online', path: '/menu', icon: 'M4 6h16M4 12h16M4 18h7', roles: ['Gerente', 'Caixa', 'Garçom'] },
    { name: 'Estoque', path: '/inventory', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10', roles: ['Gerente'] },
    { name: 'Compras', path: '/purchasing', icon: 'M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.658-.463 1.243-1.117 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.117 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z', roles: ['Gerente'] },
    { name: 'Fichas Técnicas', path: '/technical-sheets', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01', roles: ['Gerente'] },
    { name: 'Mise en Place', path: '/mise-en-place', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', roles: ['Gerente', 'Cozinha', 'Garçom', 'Caixa'] },
    { name: 'Desempenho', path: '/performance', icon: 'M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z', roles: ['Gerente'] },
    { name: 'Relatórios', path: '/reports', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H5a2 2 0 01-2-2V7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2z', roles: ['Gerente'] },
    { name: 'Tutoriais', path: '/tutorials', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253', roles: ['Gerente', 'Caixa', 'Garçom', 'Cozinha'] },
    { name: 'Configurações', path: '/settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0 3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z', roles: ['Gerente'] }
  ];

  private availableNavItems = computed(() => {
    const employee = this.activeEmployee();
    if (!employee || !employee.role) return [];
    if (employee.role === 'Gerente') return this.allNavItems;
    return this.allNavItems.filter(item => item.roles.includes(employee.role!));
  });

  // Split items for bottom bar and off-canvas
  primaryNavItems = computed(() => {
    const items = this.availableNavItems();
    const primaryPaths = ['/pos', '/dashboard', '/kds', '/cashier']; // Order of importance
    const primary = items.filter(item => primaryPaths.includes(item.path))
                         .sort((a, b) => primaryPaths.indexOf(a.path) - primaryPaths.indexOf(b.path));
    return primary.slice(0, 3);
  });
  
  secondaryNavItems = computed(() => {
    const all = this.availableNavItems();
    const primary = this.primaryNavItems();
    const primaryPaths = new Set(primary.map(p => p.path));
    return all.filter(item => !primaryPaths.has(item.path));
  });

  toggleOffCanvas() {
    this.isOffCanvasOpen.update(value => !value);
  }

  closeAndNavigate(path: string) {
    this.isOffCanvasOpen.set(false);
    this.router.navigate([path]);
  }
  
  async signOut() {
    this.isOffCanvasOpen.set(false);
    await this.authService.signOut();
    this.router.navigate(['/login']);
  }

  switchOperator() {
    this.isOffCanvasOpen.set(false);
    this.operationalAuthService.logout();
  }
}