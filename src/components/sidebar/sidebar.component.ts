

import { Component, ChangeDetectionStrategy, signal, inject, computed } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { OperationalAuthService } from '../../services/operational-auth.service';
import { SettingsStateService } from '../../services/settings-state.service';
import { DemoService } from '../../services/demo.service';

export interface NavLink {
  name: string;
  path: string;
  icon?: string;
  imageUrl?: string;
  roles: string[];
}

export interface NavGroup {
  name: string;
  icon?: string;
  imageUrl?: string;
  children: NavLink[];
}

export type CombinedNavItem = NavLink | NavGroup;

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  authService = inject(AuthService);
  operationalAuthService = inject(OperationalAuthService);
  settingsState = inject(SettingsStateService);
  // FIX: Injected DemoService to handle demo mode logic
  demoService = inject(DemoService);
  // FIX: Explicitly type the injected Router to resolve property access errors.
  router: Router = inject(Router);
  
  // FIX: Added isDemoMode signal for use in computed properties
  isDemoMode = this.demoService.isDemoMode;
  currentUser = this.authService.currentUser;
  activeEmployee = this.operationalAuthService.activeEmployee;
  shiftButtonState = this.operationalAuthService.shiftButtonState;
  companyProfile = this.settingsState.companyProfile;
  
  isSidebarOpen = signal(true);
  expandedGroups = signal<Record<string, boolean>>({
    'Vendas': true,
    'iFood': true,
    'Delivery': true,
  });

  allNavLinks: CombinedNavItem[] = [
    {
      name: 'Vendas',
      icon: 'point_of_sale',
      children: [
        { name: 'PDV', path: '/pos', icon: 'receipt_long', roles: ['Gerente', 'Caixa', 'Garçom'] },
        { name: 'Caixa', path: '/cashier', icon: 'point_of_sale', roles: ['Gerente', 'Caixa'] },
        { name: 'Reservas', path: '/reservations', icon: 'calendar_month', roles: ['Gerente', 'Caixa', 'Garçom'] },
        { name: 'Clientes', path: '/customers', icon: 'group', roles: ['Gerente', 'Caixa'] },
      ]
    },
    {
      name: 'Delivery',
      icon: 'local_shipping',
      children: [
        { name: 'Painel de Entregas', path: '/delivery', icon: 'dashboard', roles: ['Gerente', 'Caixa'] },
      ]
    },
    {
      name: 'iFood',
      imageUrl: 'https://i.imgur.com/NzlCBGX.png',
      children: [
        { name: 'KDS Delivery', path: '/ifood-kds', icon: 'delivery_dining', roles: ['Gerente', 'Caixa'] },
        { name: 'Gerenciar Cardápio', path: '/ifood-menu', icon: 'menu_book', roles: ['Gerente'] },
        { name: 'Gestor de Loja', path: '/ifood-store-manager', icon: 'storefront', roles: ['Gerente'] }
      ]
    },
    {
      name: 'Produção',
      icon: 'soup_kitchen',
      children: [
        { name: 'Cozinha (KDS)', path: '/kds', icon: 'deck', roles: ['Gerente', 'Cozinha'] },
        { name: 'Mise en Place', path: '/mise-en-place', icon: 'checklist', roles: ['Gerente', 'Cozinha', 'Garçom', 'Caixa'] },
        { name: 'Fichas Técnicas', path: '/technical-sheets', icon: 'list_alt', roles: ['Gerente'] },
      ]
    },
    {
      name: 'Gestão',
      icon: 'bar_chart_4_bars',
      children: [
        { name: 'Dashboard', path: '/dashboard', icon: 'dashboard', roles: ['Gerente'] },
        { name: 'Estoque', path: '/inventory', icon: 'inventory_2', roles: ['Gerente'] },
        { name: 'Compras', path: '/purchasing', icon: 'shopping_cart', roles: ['Gerente'] },
        { name: 'Fornecedores', path: '/suppliers', icon: 'local_shipping', roles: ['Gerente'] },
        { name: 'Desempenho', path: '/performance', icon: 'trending_up', roles: ['Gerente'] },
        { name: 'Relatórios', path: '/reports', icon: 'analytics', roles: ['Gerente'] },
      ]
    },
    {
      name: 'RH',
      icon: 'groups',
      children: [
        { name: 'Funcionários', path: '/employees', icon: 'badge', roles: ['Gerente'] },
        { name: 'Escalas', path: '/schedules', icon: 'calendar_view_week', roles: ['Gerente', 'Caixa', 'Garçom', 'Cozinha'] },
        { name: 'Minhas Ausências', path: '/my-leave', icon: 'event_busy', roles: ['Gerente', 'Caixa', 'Garçom', 'Cozinha'] },
        { name: 'Gestão de Ausências', path: '/leave-management', icon: 'manage_history', roles: ['Gerente'] },
        { name: 'Controle de Ponto', path: '/time-clock', icon: 'schedule', roles: ['Gerente'] },
        { name: 'Folha de Pagamento', path: '/payroll', icon: 'payments', roles: ['Gerente'] },
      ]
    },
    { name: 'Cardápio Online', path: '/menu', icon: 'menu_book', roles: ['Gerente', 'Caixa', 'Garçom'] },
    { name: 'Tutoriais', path: '/tutorials', icon: 'school', roles: ['Gerente', 'Caixa', 'Garçom', 'Cozinha'] },
    { name: 'Configurações', path: '/settings', icon: 'settings', roles: ['Gerente'] }
  ];

  navItems = computed(() => {
    const employee = this.activeEmployee();
    if (!employee) return [];
    
    // FIX: Add demo mode logic to filter nav items appropriately.
    const isDemo = this.isDemoMode();
    const demoAllowedGroups = ['Vendas', 'Produção', 'Gestão'];
    const demoAllowedPaths = ['/dashboard', '/pos', '/cashier', '/kds', '/inventory'];

    const filterLink = (link: NavLink): boolean => {
      if (isDemo) {
        return demoAllowedPaths.includes(link.path);
      }
      // Use the central permission service instead of the hardcoded role list
      return this.operationalAuthService.hasPermission(link.path);
    };

    const result: CombinedNavItem[] = [];

    for (const item of this.allNavLinks) {
      if (this.isNavGroup(item)) {
        if (isDemo && !demoAllowedGroups.includes(item.name)) {
          continue;
        }
        const visibleChildren = item.children.filter(filterLink);
        if (visibleChildren.length > 0) {
          result.push({ ...item, children: visibleChildren });
        }
      } else { // It's a NavLink
        if (filterLink(item as NavLink)) {
          result.push(item);
        }
      }
    }
    return result;
  });

  isNavGroup(item: CombinedNavItem): item is NavGroup {
    return 'children' in item;
  }

  isGroupActive(group: NavGroup): boolean {
    return group.children.some(child => this.router.isActive(child.path, false));
  }

  toggleGroup(groupName: string) {
    if (!this.isSidebarOpen()) {
      this.isSidebarOpen.set(true);
      // Ensure the group is open after the sidebar expands
      setTimeout(() => {
        this.expandedGroups.update(groups => ({ ...groups, [groupName]: true }));
      }, 300); // Match sidebar transition duration
    } else {
      this.expandedGroups.update(groups => ({
        ...groups,
        [groupName]: !groups[groupName]
      }));
    }
  }

  toggleSidebar() {
    this.isSidebarOpen.update(value => !value);
  }
  
  async signOut() {
    await this.authService.signOut();
    this.router.navigate(['/login']);
  }
  
  switchEmployee() {
    this.operationalAuthService.switchEmployee();
  }

  async handleShiftAction() {
    await this.operationalAuthService.handleShiftAction();
  }
}