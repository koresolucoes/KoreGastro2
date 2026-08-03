import { Component, ChangeDetectionStrategy, inject, signal, computed, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { OperationalAuthService } from '../../services/operational-auth.service';
import { DemoService } from '../../services/demo.service';
import { ThemeService } from '../../services/theme.service';
import { UnitContextService } from '../../services/unit-context.service';
import { RecipeStateService } from '../../services/recipe-state.service';
import { InventoryStateService } from '../../services/inventory-state.service';
import { PosStateService } from '../../services/pos-state.service';

export interface SearchPageItem {
  name: string;
  path: string;
  icon: string;
  category: string;
}

@Component({
  selector: 'app-top-nav',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './top-nav.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopNavComponent {
  authService = inject(AuthService);
  operationalAuthService = inject(OperationalAuthService);
  demoService = inject(DemoService);
  themeService = inject(ThemeService);
  unitContextService = inject(UnitContextService);
  recipeState = inject(RecipeStateService);
  inventoryState = inject(InventoryStateService);
  posState = inject(PosStateService);
  router: Router = inject(Router);

  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;

  isDemoMode = this.demoService.isDemoMode;
  currentUser = this.authService.currentUser;
  activeEmployee = this.operationalAuthService.activeEmployee;
  shiftButtonState = this.operationalAuthService.shiftButtonState;

  currentUnitName = this.unitContextService.activeUnitName;
  availableUnits = this.unitContextService.availableUnits;
  activeUnitId = this.unitContextService.activeUnitId;

  isMobileMenuOpen = signal(false);
  openDropdown = signal<string | null>(null);
  isSearchOpen = signal(false);
  searchQuery = signal('');

  systemPages: SearchPageItem[] = [
    { name: 'Visão Geral & Dashboard', path: '/dashboard', icon: 'dashboard', category: 'Painel' },
    { name: 'PDV - Frente de Caixa', path: '/pos', icon: 'point_of_sale', category: 'Operação' },
    { name: 'Salão & Reservas de Mesas', path: '/reservations', icon: 'event_seat', category: 'Operação' },
    { name: 'Cozinha (KDS)', path: '/kds', icon: 'soup_kitchen', category: 'Operação' },
    { name: 'Delivery & Entregas', path: '/delivery', icon: 'local_shipping', category: 'Operação' },
    { name: 'Fechamento de Caixa', path: '/cashier', icon: 'payments', category: 'Operação' },
    { name: 'Atendimento WhatsApp', path: '/whatsapp-chats', icon: 'chat', category: 'Atendimento' },
    { name: 'iFood KDS', path: '/ifood-kds', icon: 'takeout_dining', category: 'iFood' },
    { name: 'Cardápio iFood', path: '/ifood-menu', icon: 'restaurant', category: 'iFood' },
    { name: 'Gestão da Loja iFood', path: '/ifood-store-manager', icon: 'storefront', category: 'iFood' },
    { name: 'Produtos & Cardápio Digital', path: '/menu', icon: 'restaurant_menu', category: 'Cardápio' },
    { name: 'Editor de Cardápio', path: '/menu-builder', icon: 'edit_note', category: 'Cardápio' },
    { name: 'Fichas Técnicas', path: '/technical-sheets', icon: 'menu_book', category: 'Produção' },
    { name: 'Mise en Place', path: '/mise-en-place', icon: 'skillet', category: 'Produção' },
    { name: 'Checklists Operacionais', path: '/checklists', icon: 'checklist', category: 'Produção' },
    { name: 'Controle de Temperatura', path: '/temperatures', icon: 'thermostat', category: 'Produção' },
    { name: 'Estoque Geral', path: '/inventory', icon: 'inventory_2', category: 'Estoque' },
    { name: 'Portionamento', path: '/inventory/portioning', icon: 'content_cut', category: 'Estoque' },
    { name: 'Requisições de Insumos', path: '/requisitions', icon: 'assignment_turned_in', category: 'Estoque' },
    { name: 'Pedidos de Compras', path: '/purchasing', icon: 'shopping_cart', category: 'Compras' },
    { name: 'Fornecedores', path: '/suppliers', icon: 'fire_truck', category: 'Compras' },
    { name: 'Auditoria de Estoque', path: '/inventory/audit', icon: 'fact_check', category: 'Estoque' },
    { name: 'Funcionários & Equipe', path: '/employees', icon: 'badge', category: 'RH' },
    { name: 'Ponto Eletrônico', path: '/time-clock', icon: 'alarm_on', category: 'RH' },
    { name: 'Escalas de Trabalho', path: '/schedules', icon: 'calendar_view_week', category: 'RH' },
    { name: 'Gestão de Ausências', path: '/leave-management', icon: 'event_busy', category: 'RH' },
    { name: 'Minhas Solicitações', path: '/my-leave', icon: 'event_available', category: 'RH' },
    { name: 'Folha de Pagamento', path: '/payroll', icon: 'receipt_long', category: 'RH' },
    { name: 'Desempenho & Metas', path: '/performance', icon: 'trending_up', category: 'RH' },
    { name: 'Clientes & CRM', path: '/customers', icon: 'group', category: 'Clientes' },
    { name: 'Financeiro & Relatórios', path: '/reports', icon: 'analytics', category: 'Financeiro' },
    { name: 'Configurações', path: '/settings', icon: 'settings', category: 'Sistema' },
    { name: 'Tutoriais & Vídeos', path: '/tutorials', icon: 'school', category: 'Ajuda' },
    { name: 'Suporte Técnico', path: '/support', icon: 'help_center', category: 'Ajuda' }
  ];

  filteredPages = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.systemPages.slice(0, 6);
    return this.systemPages.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.path.toLowerCase().includes(q)
    );
  });

  filteredProducts = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return [];
    
    const recipes = (this.recipeState.recipes() || [])
      .filter(r => r.name.toLowerCase().includes(q))
      .slice(0, 4)
      .map(r => ({
        name: r.name,
        detail: `Ficha Técnica - R$ ${(r.price || 0).toFixed(2)}`,
        path: '/technical-sheets',
        icon: 'menu_book'
      }));

    const ingredients = (this.inventoryState.ingredients() || [])
      .filter(i => i.name.toLowerCase().includes(q))
      .slice(0, 4)
      .map(i => ({
        name: i.name,
        detail: `Insumo - Estoque: ${i.current_stock || 0} ${i.unit || 'un'}`,
        path: '/inventory',
        icon: 'inventory_2'
      }));

    return [...recipes, ...ingredients];
  });

  filteredOrdersAndTables = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return [];

    const tables = (this.posState.tables() || [])
      .filter(t => `mesa ${t.table_number}`.toLowerCase().includes(q) || t.table_number.toString().includes(q))
      .slice(0, 3)
      .map(t => ({
        name: `Mesa ${t.table_number}`,
        detail: `Status: ${t.status === 'OCCUPIED' ? 'Ocupada' : 'Livre'}`,
        path: '/pos',
        icon: 'table_restaurant'
      }));

    const orders = (this.posState.orders() || [])
      .filter(o => `comanda ${o.order_number}`.toLowerCase().includes(q) || o.order_number?.toString().includes(q) || o.customer_name?.toLowerCase().includes(q))
      .slice(0, 3)
      .map(o => ({
        name: `Comanda / Pedido #${o.order_number}`,
        detail: o.customer_name ? `Cliente: ${o.customer_name}` : 'Atendimento Ativo',
        path: '/pos',
        icon: 'receipt'
      }));

    return [...tables, ...orders];
  });

  toggleDropdown(groupName: string | null, event?: Event) {
    if (event) event.stopPropagation();
    if (this.openDropdown() === groupName) {
      this.openDropdown.set(null);
    } else {
      this.openDropdown.set(groupName);
    }
  }

  @HostListener('document:click', ['$event'])
  closeDropdowns(event?: Event) {
    const target = event?.target as HTMLElement;
    if (target && target.closest('.top-dropdown')) {
      return;
    }
    this.openDropdown.set(null);
  }

  @HostListener('document:keydown.control.k', ['$event'])
  @HostListener('document:keydown.meta.k', ['$event'])
  onKeydownSearch(event: KeyboardEvent) {
    event.preventDefault();
    this.openSearch(event);
  }

  openSearch(event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.isSearchOpen.set(true);
    this.searchQuery.set('');
    setTimeout(() => {
      this.searchInputRef?.nativeElement?.focus();
    }, 60);
  }

  closeSearch() {
    this.isSearchOpen.set(false);
    this.searchQuery.set('');
  }

  onSearchInput(event: Event) {
    const val = (event.target as HTMLInputElement).value;
    this.searchQuery.set(val);
  }

  selectItem(path: string) {
    this.router.navigate([path]);
    this.closeSearch();
  }

  switchUnit(unitId: string, event?: Event) {
    if (event) event.stopPropagation();
    this.unitContextService.setUnit(unitId);
    this.openDropdown.set(null);
  }

  onSearchKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      this.closeSearch();
      return;
    }
    if (event.key === 'Enter') {
      const pages = this.filteredPages();
      const prods = this.filteredProducts();
      const orders = this.filteredOrdersAndTables();

      if (pages.length > 0) {
        this.selectItem(pages[0].path);
      } else if (prods.length > 0) {
        this.selectItem(prods[0].path);
      } else if (orders.length > 0) {
        this.selectItem(orders[0].path);
      }
    }
  }

  handleLinkClick() {
    this.isMobileMenuOpen.set(false);
    this.openDropdown.set(null);
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
