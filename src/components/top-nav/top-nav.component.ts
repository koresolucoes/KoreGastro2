
import { Component, ChangeDetectionStrategy, signal, inject, computed, HostListener } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { OperationalAuthService } from '../../services/operational-auth.service';
import { SettingsStateService } from '../../services/settings-state.service';
import { DemoService } from '../../services/demo.service';
import { UnitContextService } from '../../services/unit-context.service';
import { ThemeService } from '../../services/theme.service';
import { AddStoreModalComponent } from '../sidebar/add-store-modal/add-store-modal.component';

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
  selector: 'app-top-nav',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, AddStoreModalComponent],
  templateUrl: './top-nav.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopNavComponent {
  authService = inject(AuthService);
  operationalAuthService = inject(OperationalAuthService);
  settingsState = inject(SettingsStateService);
  demoService = inject(DemoService);
  unitContextService = inject(UnitContextService);
  themeService = inject(ThemeService);
  router: Router = inject(Router);

  isDemoMode = this.demoService.isDemoMode;
  currentUser = this.authService.currentUser;
  activeEmployee = this.operationalAuthService.activeEmployee;
  shiftButtonState = this.operationalAuthService.shiftButtonState;
  companyProfile = this.settingsState.companyProfile;
  
  isMobileMenuOpen = signal(false);
  openDropdown = signal<string | null>(null);
  
  // Store Selector State
  isStoreDropdownOpen = signal(false);
  isAddStoreModalOpen = signal(false);
  
  allNavLinks: CombinedNavItem[] = [
    {
      name: 'Salão & PDV',
      icon: 'point_of_sale',
      children: [
        { name: 'PDV', path: '/pos', icon: 'point_of_sale', roles: ['Gerente', 'Caixa', 'Garçom'] },
        { name: 'Caixa', path: '/cashier', icon: 'payments', roles: ['Gerente', 'Caixa'] },
        { name: 'Reservas', path: '/reservations', icon: 'calendar_month', roles: ['Gerente', 'Caixa', 'Garçom'] },
        { name: 'Clientes', path: '/customers', icon: 'group', roles: ['Gerente', 'Caixa'] },
      ]
    },
    {
      name: 'Cozinha & KDS',
      icon: 'soup_kitchen',
      children: [
        { name: 'KDS Cozinha', path: '/kds', icon: 'soup_kitchen', roles: ['Gerente', 'Cozinha'] },
        { name: 'KDS Delivery', path: '/delivery', icon: 'pedal_bike', roles: ['Gerente', 'Caixa'] },
        { name: 'KDS iFood', path: '/ifood-kds', icon: 'app_shortcut', roles: ['Gerente', 'Caixa'] },
        { name: 'Mise en Place', path: '/mise-en-place', icon: 'checklist', roles: ['Gerente', 'Cozinha', 'Garçom', 'Caixa'] },
      ]
    },
    {
      name: 'Gestão',
      icon: 'bar_chart',
      children: [
        { name: 'Dashboard', path: '/dashboard', icon: 'dashboard', roles: ['Gerente'] },
        { name: 'Relatórios', path: '/reports', icon: 'analytics', roles: ['Gerente'] },
        { name: 'Desempenho', path: '/performance', icon: 'trending_up', roles: ['Gerente'] },
        { name: 'Configurações', path: '/settings', icon: 'settings', roles: ['Gerente'] },
      ]
    },
    {
      name: 'Estoque',
      icon: 'inventory_2',
      children: [
        { name: 'Estoque', path: '/inventory', icon: 'inventory', roles: ['Gerente'] },
        { name: 'Compras', path: '/purchasing', icon: 'shopping_cart', roles: ['Gerente'] },
        { name: 'Fornecedores', path: '/suppliers', icon: 'local_shipping', roles: ['Gerente'] },
        { name: 'Fichas Técnicas', path: '/technical-sheets', icon: 'menu_book', roles: ['Gerente'] },
        { name: 'Requisições', path: '/requisitions', icon: 'assignment_returned', roles: ['Gerente', 'Cozinha', 'Caixa'] },
      ]
    },
    {
      name: 'Delivery/iFood',
      icon: 'storefront',
      children: [
        { name: 'Cardápio Digital', path: '/menu', icon: 'qr_code_2', roles: ['Gerente', 'Caixa', 'Garçom'] },
        { name: 'Cardápio iFood', path: '/ifood-menu', icon: 'sync_alt', roles: ['Gerente'] },
        { name: 'Gestor iFood', path: '/ifood-store-manager', icon: 'storefront', roles: ['Gerente'] }
      ]
    },
    {
      name: 'Equipe',
      icon: 'badge',
      children: [
        { name: 'Funcionários', path: '/employees', icon: 'group', roles: ['Gerente'] },
        { name: 'Escalas', path: '/schedules', icon: 'calendar_view_week', roles: ['Gerente', 'Caixa', 'Garçom', 'Cozinha'] },
        { name: 'Ponto Eletrônico', path: '/time-clock', icon: 'schedule', roles: ['Gerente'] },
        { name: 'Folha', path: '/payroll', icon: 'request_quote', roles: ['Gerente'] },
        { name: 'Gestão de Férias', path: '/leave-management', icon: 'event_busy', roles: ['Gerente'] },
        { name: 'Minhas Ausências', path: '/my-leave', icon: 'event_available', roles: ['Gerente', 'Caixa', 'Garçom', 'Cozinha'] },
      ]
    },
    {
      name: 'Rotinas',
      icon: 'fact_check',
      children: [
        { name: 'Checklists', path: '/checklists', icon: 'playlist_add_check', roles: ['Gerente', 'Caixa', 'Garçom', 'Cozinha'] },
        { name: 'Temperaturas', path: '/temperatures', icon: 'thermostat', roles: ['Gerente', 'Cozinha'] },
        { name: 'Tutoriais', path: '/tutorials', icon: 'school', roles: ['Gerente', 'Caixa', 'Garçom', 'Cozinha'] },
      ]
    }
  ];

  navItems = computed(() => {
    const employee = this.activeEmployee();
    if (!employee) return [];
    
    const isDemo = this.isDemoMode();
    const demoAllowedGroups = ['Salão & PDV', 'Cozinha & KDS', 'Gestão', 'Estoque', 'Rotinas', 'Delivery/iFood'];
    const demoAllowedPaths = ['/dashboard', '/pos', '/cashier', '/kds', '/inventory', '/requisitions', '/checklists', '/temperatures', '/menu', '/ifood-kds', '/delivery'];

    const filterLink = (link: NavLink): boolean => {
      if (isDemo) {
        return demoAllowedPaths.includes(link.path);
      }
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

  toggleDropdown(groupName: string | null) {
    if (this.openDropdown() === groupName) {
      this.openDropdown.set(null);
    } else {
      this.openDropdown.set(groupName);
      // Close store dropdown if nav dropdown opens
      this.isStoreDropdownOpen.set(false);
    }
  }

  @HostListener('document:click', ['$event'])
  closeDropdowns() {
    this.openDropdown.set(null);
    this.isStoreDropdownOpen.set(false);
  }

  handleLinkClick() {
    this.isMobileMenuOpen.set(false);
    this.closeDropdowns();
  }

  toggleMobileMenu() {
    this.isMobileMenuOpen.update(value => !value);
  }

  // --- Multi-Unit Logic ---
  toggleStoreDropdown() {
      this.isStoreDropdownOpen.update(v => !v);
      if (this.isStoreDropdownOpen()) {
          this.openDropdown.set(null); // Close nav dropdowns
      }
  }

  switchStore(unitId: string) {
      this.unitContextService.setUnit(unitId);
      this.isStoreDropdownOpen.set(false);
  }

  openAddStoreModal() {
      this.isAddStoreModalOpen.set(true);
      this.isStoreDropdownOpen.set(false);
  }
  
  async signOut() {
    this.handleLinkClick();
    await this.authService.signOut();
    this.router.navigate(['/login']);
  }
  
  switchEmployee() {
    this.handleLinkClick();
    this.operationalAuthService.switchEmployee();
  }

  async handleShiftAction() {
    this.handleLinkClick();
    await this.operationalAuthService.handleShiftAction();
  }
}
