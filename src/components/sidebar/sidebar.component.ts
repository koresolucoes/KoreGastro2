import { Component, ChangeDetectionStrategy, inject, computed, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { OperationalAuthService } from '../../services/operational-auth.service';
import { DemoService } from '../../services/demo.service';
import { UnitContextService } from '../../services/unit-context.service';

export interface NavLink {
  name: string;
  path: string;
  icon: string;
}

export interface NavGroup {
  name: string;
  id: string;
  children: NavLink[];
}

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
  demoService = inject(DemoService);
  unitContextService = inject(UnitContextService);
  router = inject(Router);

  isDemoMode = this.demoService.isDemoMode;
  activeEmployee = this.operationalAuthService.activeEmployee;
  currentUnitName = this.unitContextService.activeUnitName;
  activeUnitId = this.unitContextService.activeUnitId;
  availableUnits = this.unitContextService.availableUnits;

  isCollapsed = signal(false);
  isUnitSelectorOpen = signal(false);
  
  allNavGroups: NavGroup[] = [
    {
      name: 'Painel',
      id: 'painel',
      children: [
        { name: 'Visão Geral', path: '/dashboard', icon: 'dashboard' },
        { name: 'Tutoriais & Vídeos', path: '/tutorials', icon: 'school' },
      ]
    },
    {
      name: 'Operação & Atendimento',
      id: 'operacao',
      children: [
        { name: 'PDV - Frente de Caixa', path: '/pos', icon: 'point_of_sale' },
        { name: 'Salão & Reservas', path: '/reservations', icon: 'event_seat' },
        { name: 'Cozinha (KDS)', path: '/kds', icon: 'soup_kitchen' },
        { name: 'Delivery & Entregas', path: '/delivery', icon: 'local_shipping' },
        { name: 'Fechamento de Caixa', path: '/cashier', icon: 'payments' },
        { name: 'Atendimento WhatsApp', path: '/whatsapp-chats', icon: 'chat' },
      ]
    },
    {
      name: 'Integrador iFood',
      id: 'ifood',
      children: [
        { name: 'iFood KDS', path: '/ifood-kds', icon: 'takeout_dining' },
        { name: 'Cardápio iFood', path: '/ifood-menu', icon: 'restaurant' },
        { name: 'Gestão da Loja iFood', path: '/ifood-store-manager', icon: 'storefront' },
      ]
    },
    {
      name: 'Cardápio & Produção',
      id: 'producao',
      children: [
        { name: 'Produtos & Cardápio', path: '/menu', icon: 'restaurant_menu' },
        { name: 'Editor de Cardápio', path: '/menu-builder', icon: 'edit_note' },
        { name: 'Fichas Técnicas', path: '/technical-sheets', icon: 'menu_book' },
        { name: 'Mise en Place', path: '/mise-en-place', icon: 'skillet' },
        { name: 'Checklists Operacionais', path: '/checklists', icon: 'checklist' },
        { name: 'Controle de Temperatura', path: '/temperatures', icon: 'thermostat' },
      ]
    },
    {
      name: 'Estoque & Compras',
      id: 'estoque',
      children: [
        { name: 'Estoque Geral', path: '/inventory', icon: 'inventory_2' },
        { name: 'Portionamento', path: '/inventory/portioning', icon: 'content_cut' },
        { name: 'Requisições de Insumos', path: '/requisitions', icon: 'assignment_turned_in' },
        { name: 'Pedidos de Compras', path: '/purchasing', icon: 'shopping_cart' },
        { name: 'Fornecedores', path: '/suppliers', icon: 'fire_truck' },
        { name: 'Auditoria de Estoque', path: '/inventory/audit', icon: 'fact_check' },
      ]
    },
    {
      name: 'Equipe & RH',
      id: 'rh',
      children: [
        { name: 'Funcionários & Equipe', path: '/employees', icon: 'badge' },
        { name: 'Ponto Eletrônico', path: '/time-clock', icon: 'alarm_on' },
        { name: 'Escalas de Trabalho', path: '/schedules', icon: 'calendar_view_week' },
        { name: 'Gestão de Ausências', path: '/leave-management', icon: 'event_busy' },
        { name: 'Minhas Solicitações', path: '/my-leave', icon: 'event_available' },
        { name: 'Folha de Pagamento', path: '/payroll', icon: 'receipt_long' },
        { name: 'Desempenho & Metas', path: '/performance', icon: 'trending_up' },
      ]
    },
    {
      name: 'Clientes & Financeiro',
      id: 'gestao',
      children: [
        { name: 'Clientes & CRM', path: '/customers', icon: 'group' },
        { name: 'Financeiro & Relatórios', path: '/reports', icon: 'analytics' },
      ]
    },
    {
      name: 'Sistema & Suporte',
      id: 'sistema',
      children: [
        { name: 'Configurações', path: '/settings', icon: 'settings' },
        { name: 'Suporte Técnico', path: '/support', icon: 'help_center' },
      ]
    }
  ];

  navGroups = computed(() => {
    const isDemo = this.isDemoMode();
    const demoAllowedPaths = [
      '/dashboard', '/tutorials', '/pos', '/reservations', '/kds', '/delivery', '/cashier',
      '/whatsapp-chats', '/ifood-kds', '/ifood-menu', '/ifood-store-manager', '/menu',
      '/menu-builder', '/technical-sheets', '/mise-en-place', '/checklists', '/temperatures',
      '/inventory', '/inventory/portioning', '/requisitions', '/purchasing', '/suppliers',
      '/inventory/audit', '/employees', '/time-clock', '/schedules', '/leave-management',
      '/my-leave', '/payroll', '/performance', '/customers', '/reports', '/settings', '/support'
    ];
    
    return this.allNavGroups.map(group => ({
      ...group,
      children: group.children.filter(link => {
        if (isDemo) return demoAllowedPaths.includes(link.path);
        return this.operationalAuthService.hasPermission(link.path);
      })
    })).filter(group => group.children.length > 0);
  });

  toggleSidebar() {
    this.isCollapsed.update(v => !v);
  }

  toggleUnitSelector(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.isUnitSelectorOpen.update(v => !v);
  }

  switchUnit(unitId: string, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.unitContextService.setUnit(unitId);
    this.isUnitSelectorOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  closeDropdowns(event: Event) {
    const target = event.target as HTMLElement;
    if (!target.closest('.unit-selector')) {
      this.isUnitSelectorOpen.set(false);
    }
  }
}
