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
import { NotificationService, SystemNotification, NotificationFilter, NotificationType } from '../../services/notification.service';
import { LayoutService } from '../../services/layout.service';
import { PortalContextService } from '../../services/portal-context.service';

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
  notificationService = inject(NotificationService);
  layoutService = inject(LayoutService);
  portalContextService = inject(PortalContextService);
  router: Router = inject(Router);

  portalInfo = this.portalContextService.portalInfo;

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

  // Notifications signals & computed getters
  unreadCount = this.notificationService.unreadCount;
  notifications = this.notificationService.filteredNotifications;
  activeFilter = this.notificationService.activeFilter;
  soundEnabled = this.notificationService.soundEnabled;

  systemPages: SearchPageItem[] = [
    { name: 'Visão Geral & Dashboard', path: '/dashboard', icon: 'dashboard', category: 'Painel' },
    { name: 'PDV e Mesas', path: '/pos', icon: 'point_of_sale', category: 'Operação' },
    { name: 'Reservas', path: '/reservations', icon: 'event_seat', category: 'Operação' },
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
    const allowedPages = this.systemPages.filter(p => this.portalContextService.isRouteAllowedInCurrentPortal(p.path));
    if (!q) return allowedPages.slice(0, 6);
    return allowedPages.filter(p =>
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
        detail: `Insumo - Estoque: ${(i as any).current_stock ?? (i as any).stock ?? 0} ${i.unit || 'un'}`,
        path: '/inventory',
        icon: 'inventory_2'
      }));

    return [...recipes, ...ingredients];
  });

  filteredOrdersAndTables = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return [];

    const tables = (this.posState.tables() || [])
      .filter(t => {
        const num = (t as any).number ?? (t as any).table_number ?? '';
        return `mesa ${num}`.toLowerCase().includes(q) || num.toString().includes(q);
      })
      .slice(0, 3)
      .map(t => {
        const num = (t as any).number ?? (t as any).table_number ?? '';
        const isOccupied = (t as any).status === 'OCCUPIED' || (t as any).status === 'occupied';
        return {
          name: `Mesa ${num}`,
          detail: `Status: ${isOccupied ? 'Ocupada' : 'Livre'}`,
          path: '/pos',
          icon: 'table_restaurant'
        };
      });

    const orders = (this.posState.orders() || [])
      .filter(o => {
        const num = (o as any).order_number ?? (o as any).number ?? o.id ?? '';
        const customer = (o as any).customer_name ?? (o as any).customer_info?.name ?? '';
        return `comanda ${num}`.toLowerCase().includes(q) || num.toString().includes(q) || customer.toLowerCase().includes(q);
      })
      .slice(0, 3)
      .map(o => {
        const num = (o as any).order_number ?? (o as any).number ?? o.id ?? '';
        const customer = (o as any).customer_name ?? (o as any).customer_info?.name ?? '';
        return {
          name: `Comanda / Pedido #${num}`,
          detail: customer ? `Cliente: ${customer}` : 'Atendimento Ativo',
          path: '/pos',
          icon: 'receipt'
        };
      });

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

  handleNotificationAction(notif: SystemNotification, event?: Event) {
    if (event) event.stopPropagation();
    this.notificationService.markAsRead(notif.id);
    if (notif.actionUrl) {
      this.router.navigate([notif.actionUrl]);
      this.openDropdown.set(null);
    }
  }

  setNotificationFilter(filter: NotificationFilter, event?: Event) {
    if (event) event.stopPropagation();
    this.notificationService.setFilter(filter);
  }

  toggleNotificationSound(event?: Event) {
    if (event) event.stopPropagation();
    this.notificationService.toggleSound();
  }

  markAllNotificationsAsRead(event?: Event) {
    if (event) event.stopPropagation();
    this.notificationService.markAllAsRead();
  }

  clearAllNotifications(event?: Event) {
    if (event) event.stopPropagation();
    this.notificationService.clearAll();
  }

  simulateNotification(category?: NotificationType, event?: Event) {
    if (event) event.stopPropagation();
    this.notificationService.simulateNotification(category);
  }

  getNotificationIcon(type: NotificationType): string {
    switch (type) {
      case 'waiter': return 'notifications_active';
      case 'ifood': return 'takeout_dining';
      case 'kds': return 'soup_kitchen';
      case 'inventory': return 'inventory_2';
      case 'rh': return 'badge';
      case 'whatsapp': return 'chat';
      case 'payment': return 'payments';
      default: return 'info';
    }
  }

  getNotificationBadgeClass(type: NotificationType, severity: string): string {
    if (severity === 'error') return 'bg-danger/10 text-danger border-danger/20';
    if (severity === 'warning') return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    if (type === 'ifood') return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
    if (type === 'whatsapp') return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    if (type === 'waiter') return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    return 'bg-brand/10 text-brand border-brand/20';
  }

  getTimeAgo(date: Date): string {
    return this.notificationService.getTimeAgo(date);
  }
}
