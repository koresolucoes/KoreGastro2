
import { Component, ChangeDetectionStrategy, inject, computed, signal, effect, untracked, OnInit } from '@angular/core';
import { CdkDragDrop, moveItemInArray, CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

import { SupabaseStateService } from '../../services/supabase-state.service';
import { CashierDataService, DailySalesCogs, PeakHoursData } from '../../services/cashier-data.service';
import { UnitContextService } from '../../services/unit-context.service';
import { SalesCogsChartComponent } from './sales-cogs-chart/sales-cogs-chart.component';
import { HourlySalesChartComponent } from './hourly-sales-chart/hourly-sales-chart.component';
import { DashboardStateService } from '../../services/dashboard-state.service';
import { RecipeStateService } from '../../services/recipe-state.service';
import { PosStateService } from '../../services/pos-state.service';
import { SettingsStateService } from '../../services/settings-state.service';
import { HrStateService } from '../../services/hr-state.service';
import { InventoryStateService } from '../../services/inventory-state.service';
import { Order } from '../../models/db.models';
import { OperationalAuthService } from '../../services/operational-auth.service';
import { DemoService } from '../../services/demo.service';

export interface LaunchpadItem {
  name: string;
  path: string;
  icon: string;
  color: string;
  description: string;
}

export interface LaunchpadCategory {
  id: string;
  title: string;
  icon: string;
  iconBgClass: string;
  textColorClass: string;
  description: string;
  items: LaunchpadItem[];
}


interface BaseWidget {
  id: string;
  cols: number; // 1 (small), 2 (medium), 3 (large/full width on desktop)
}

interface KpiWidget extends BaseWidget {
  type: 'kpi';
  label: string;
  value: string | number;
  subValue?: string;
  icon: string;
  colorClass: string; // e.g. 'text-blue-400'
  route: string;
}

interface ChartWidget extends BaseWidget {
  type: 'chart_sales' | 'chart_hourly';
  title: string;
}

interface ListWidget extends BaseWidget {
  type: 'list_top_items' | 'list_recent_orders' | 'list_payment_methods' | 'list_low_stock' | 'list_waiter_ranking';
  title: string;
}

interface DreWidget extends BaseWidget {
  type: 'dre_summary';
  title: string;
}

interface MenuEngineeringWidget extends BaseWidget {
  type: 'menu_engineering';
  title: string;
}

type DashboardWidget = KpiWidget | ChartWidget | ListWidget | DreWidget | MenuEngineeringWidget;
type ReportPeriod = 'day' | 'week' | 'month';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, 
    SalesCogsChartComponent, 
    HourlySalesChartComponent,
    CdkDropList,
    CdkDrag,
    RouterLink,
    CurrencyPipe,
    DatePipe
  ],
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
  private supabaseStateService = inject(SupabaseStateService);
  private cashierDataService = inject(CashierDataService);
  
  private dashboardState = inject(DashboardStateService);
  private recipeState = inject(RecipeStateService);
  private posState = inject(PosStateService);
  private settingsState = inject(SettingsStateService);
  private hrState = inject(HrStateService);
  private inventoryState = inject(InventoryStateService);
  private unitContextService = inject(UnitContextService);
  private operationalAuthService = inject(OperationalAuthService);
  private demoService = inject(DemoService);
  private router = inject(Router);
  
  userName = computed(() => {
    const emp = this.operationalAuthService.activeEmployee();
    if (emp?.name) {
      return emp.name.split(' ')[0];
    }
    return 'Luciano';
  });

  greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  });

  occupiedTablesCount = computed(() => {
    const tables = this.posState.tables();
    if (tables.length === 0) return 0;

    const openDineInTableNumbers = new Set(
      this.posState.openOrders()
        .filter(o => o.table_number && (o.order_type === 'Dine-in' || !o.order_type))
        .map(o => o.table_number)
    );

    return tables.filter(t => 
      t.status === 'OCUPADA' || t.status === 'PAGANDO' || 
      (openDineInTableNumbers.has(t.number) && t.status !== 'LIVRE')
    ).length;
  });

  totalTablesCount = computed(() => {
    return this.posState.tables().length;
  });

  delayedKitchenOrders = computed(() => {
    const now = Date.now();
    return this.posState.orders().filter(o => {
      if (o.status !== 'OPEN') return false;
      const hasActiveKitchenItems = o.order_items?.some(item => 
        (item.status === 'PENDENTE' || item.status === 'EM_PREPARO')
      );
      if (!hasActiveKitchenItems) return false;
      const startTime = o.timestamp ? new Date(o.timestamp).getTime() : now;
      return (now - startTime) > 15 * 60 * 1000;
    }).length;
  });

  activeDeliveriesCount = computed(() => {
    return this.posState.orders().filter(o => (o.order_type === 'iFood-Delivery' || o.order_type === 'External-Delivery') && o.status === 'OPEN').length;
  });

  lowStockCount = computed(() => {
    return this.inventoryState.ingredients().filter(i => i.stock < i.min_stock).length;
  });

  private allCategories: LaunchpadCategory[] = [
    {
      id: 'vendas',
      title: 'Vendas & Atendimento',
      icon: 'point_of_sale',
      iconBgClass: 'bg-rose-500/10 text-rose-500',
      textColorClass: 'text-rose-500',
      description: 'Gerencie vendas, pedidos, clientes e reservas.',
      items: [
        { name: 'PDV', path: '/pos', icon: 'point_of_sale', color: 'bg-rose-500 shadow-rose-500/20', description: 'Realize vendas e gerencie atendimento.' },
        { name: 'Salão & Mesas', path: '/pos', icon: 'table_restaurant', color: 'bg-pink-500 shadow-pink-500/20', description: 'Gestão de mesas e comandas.' },
        { name: 'Clientes', path: '/customers', icon: 'group', color: 'bg-purple-500 shadow-purple-500/20', description: 'Cadastros e histórico de clientes.' },
        { name: 'Reservas', path: '/reservations', icon: 'calendar_month', color: 'bg-rose-600 shadow-rose-600/20', description: 'Gerencie reservas de mesas.' },
        { name: 'Caixa', path: '/cashier', icon: 'account_balance_wallet', color: 'bg-emerald-500 shadow-emerald-500/20', description: 'Controle de fluxo de caixa.' },
      ]
    },
    {
      id: 'delivery',
      title: 'Delivery',
      icon: 'local_shipping',
      iconBgClass: 'bg-emerald-500/10 text-emerald-500',
      textColorClass: 'text-emerald-500',
      description: 'Gerencie delivery, integrações, cardápios e entregas.',
      items: [
        { name: 'Entregas', path: '/delivery', icon: 'local_shipping', color: 'bg-emerald-500 shadow-emerald-500/20', description: 'Painel geral de entregas.' },
        { name: 'iFood KDS', path: '/ifood-kds', icon: 'two_wheeler', color: 'bg-red-500 shadow-red-500/20', description: 'Integração e pedidos iFood.' },
        { name: 'Cardápio iFood', path: '/ifood-menu', icon: 'menu_book', color: 'bg-emerald-600 shadow-emerald-600/20', description: 'Gestão de cardápio iFood.' },
        { name: 'Loja iFood', path: '/ifood-store-manager', icon: 'store', color: 'bg-teal-500 shadow-teal-500/20', description: 'Status e horários da loja.' },
      ]
    },
    {
      id: 'producao',
      title: 'Produção & Estoque',
      icon: 'restaurant',
      iconBgClass: 'bg-amber-500/10 text-amber-500',
      textColorClass: 'text-amber-500',
      description: 'Controle produção, estoque, fichas técnicas e insumos.',
      items: [
        { name: 'Cozinha (KDS)', path: '/kds', icon: 'soup_kitchen', color: 'bg-orange-500 shadow-orange-500/20', description: 'Gerencie o preparo dos pedidos.' },
        { name: 'Cardápio', path: '/menu', icon: 'restaurant_menu', color: 'bg-amber-600 shadow-amber-600/20', description: 'Gerencie produtos e preços.' },
        { name: 'Estoque', path: '/inventory', icon: 'inventory_2', color: 'bg-yellow-600 shadow-yellow-600/20', description: 'Controle de insumos e saldos.' },
        { name: 'Mise en Place', path: '/mise-en-place', icon: 'checklist', color: 'bg-lime-600 shadow-lime-600/20', description: 'Pré-preparo e porcionamento.' },
        { name: 'Fichas Técnicas', path: '/technical-sheets', icon: 'menu_book', color: 'bg-orange-600 shadow-orange-600/20', description: 'Fichas técnicas e custos.' },
        { name: 'Compras', path: '/purchasing', icon: 'shopping_cart', color: 'bg-amber-500 shadow-amber-500/20', description: 'Ordem de compras e cotações.' },
        { name: 'Fornecedores', path: '/suppliers', icon: 'local_shipping', color: 'bg-amber-700 shadow-amber-700/20', description: 'Cadastro de fornecedores.' },
      ]
    },
    {
      id: 'rotina',
      title: 'Rotina & Qualidade',
      icon: 'fact_check',
      iconBgClass: 'bg-purple-500/10 text-purple-500',
      textColorClass: 'text-purple-500',
      description: 'Padronize processos, checklists e qualidade.',
      items: [
        { name: 'Checklists', path: '/checklists', icon: 'fact_check', color: 'bg-purple-500 shadow-purple-500/20', description: 'Checklists de abertura e rotinas.' },
        { name: 'Temperaturas', path: '/temperatures', icon: 'thermostat', color: 'bg-indigo-500 shadow-indigo-500/20', description: 'Controle térmico de geladeiras.' },
        { name: 'Requisições', path: '/requisitions', icon: 'assignment', color: 'bg-violet-500 shadow-violet-500/20', description: 'Requisições internas de estoque.' },
      ]
    },
    {
      id: 'gestao',
      title: 'Gestão & Equipe',
      icon: 'groups',
      iconBgClass: 'bg-blue-500/10 text-blue-500',
      textColorClass: 'text-blue-500',
      description: 'Gestão de equipe, escalas, permissões e desempenho.',
      items: [
        { name: 'Funcionários', path: '/employees', icon: 'badge', color: 'bg-blue-500 shadow-blue-500/20', description: 'Gestão de equipe e permissões.' },
        { name: 'Escalas', path: '/schedules', icon: 'calendar_view_week', color: 'bg-indigo-600 shadow-indigo-600/20', description: 'Visualize e gerencie as escalas.' },
        { name: 'Ponto', path: '/time-clock', icon: 'schedule', color: 'bg-sky-500 shadow-sky-500/20', description: 'Registro e gestão de jornada.' },
        { name: 'Folha', path: '/payroll', icon: 'payments', color: 'bg-blue-600 shadow-blue-600/20', description: 'Cálculo de folha e holerites.' },
        { name: 'Ausências & Férias', path: '/leave-management', icon: 'event_available', color: 'bg-cyan-600 shadow-cyan-600/20', description: 'Gestão de férias e atestados.' },
      ]
    },
    {
      id: 'financeiro',
      title: 'Financeiro',
      icon: 'attach_money',
      iconBgClass: 'bg-emerald-500/10 text-emerald-500',
      textColorClass: 'text-emerald-500',
      description: 'Contas, fluxo de caixa, DRE, pagamentos e recebimentos.',
      items: [
        { name: 'Desempenho', path: '/performance', icon: 'trending_up', color: 'bg-emerald-500 shadow-emerald-500/20', description: 'Indicadores financeiros e DRE.' },
        { name: 'Caixa', path: '/cashier', icon: 'account_balance_wallet', color: 'bg-green-600 shadow-green-600/20', description: 'Lançamentos e conciliação.' },
        { name: 'Assinatura', path: '/subscription', icon: 'card_membership', color: 'bg-teal-600 shadow-teal-600/20', description: 'Plano e faturamento ChefOS.' },
      ]
    },
    {
      id: 'relatorios',
      title: 'Relatórios & BI',
      icon: 'insights',
      iconBgClass: 'bg-violet-500/10 text-violet-500',
      textColorClass: 'text-violet-500',
      description: 'Relatórios analíticos, indicadores e inteligência de dados.',
      items: [
        { name: 'Relatórios', path: '/reports', icon: 'analytics', color: 'bg-violet-500 shadow-violet-500/20', description: 'Análises detalhadas e relatórios.' },
        { name: 'Desempenho BI', path: '/performance', icon: 'insights', color: 'bg-purple-600 shadow-purple-600/20', description: 'Inteligência de mercado e margens.' },
      ]
    },
    {
      id: 'sistema',
      title: 'Sistema',
      icon: 'settings',
      iconBgClass: 'bg-slate-500/10 text-slate-500',
      textColorClass: 'text-slate-500',
      description: 'Configurações do sistema, integrações e preferências.',
      items: [
        { name: 'Configurações', path: '/settings', icon: 'settings', color: 'bg-slate-600 shadow-slate-600/20', description: 'Ajustes gerais do sistema.' },
        { name: 'Tutoriais', path: '/tutorials', icon: 'play_circle', color: 'bg-slate-500 shadow-slate-500/20', description: 'Central de ajuda e vídeos.' },
        { name: 'WhatsApp', path: '/whatsapp-chats', icon: 'chat', color: 'bg-emerald-500 shadow-emerald-500/20', description: 'Atendimento via WhatsApp.' },
      ]
    }
  ];

  visibleCategories = computed(() => {
    const isDemo = this.demoService.isDemoMode();
    const demoAllowedPaths = ['/dashboard', '/pos', '/cashier', '/kds', '/inventory', '/requisitions', '/mise-en-place', '/checklists', '/temperatures', '/menu', '/customers', '/technical-sheets', '/purchasing', '/suppliers', '/employees', '/leave-management', '/my-leave', '/payroll', '/whatsapp-chats', '/reports', '/performance', '/schedules', '/time-clock', '/reservations', '/settings', '/tutorials', '/subscription', '/ifood-kds', '/ifood-menu', '/ifood-store-manager', '/delivery'];
    
    return this.allCategories.map(cat => ({
      ...cat,
      items: cat.items.filter(item => {
        if (isDemo) return demoAllowedPaths.includes(item.path);
        return this.operationalAuthService.hasPermission(item.path);
      })
    })).filter(cat => cat.items.length > 0);
  });
  
  viewMode = signal<'grid' | 'list'>('grid');
  selectedCategoryForModal = signal<LaunchpadCategory | null>(null);
  sortMode = signal<'name' | 'default'>('default');
  
  activeCategories = computed(() => {
    let cats = this.visibleCategories();
    
    if (this.sortMode() === 'name') {
       cats = cats.map(cat => ({
           ...cat,
           items: [...cat.items].sort((a,b) => a.name.localeCompare(b.name))
       }));
    }
    
    return cats;
  });

  // UI State
  editMode = signal(false);
  period = signal<ReportPeriod>('day');
  selectedOrderPreview = signal<Order | null>(null);
  
  // Chart state
  isLoading = signal(true);
  isChartLoading = signal(true);
  salesCogsData = signal<DailySalesCogs[]>([]);
  
  isHourlyChartLoading = signal(true);
  hourlySalesData = signal<PeakHoursData[]>([]);

  // BCG Selected Tab
  selectedBcgTab = signal<'stars' | 'plowhorses' | 'puzzles' | 'dogs'>('stars');

  // Layout Management
  private defaultWidgetOrder = [
    'kpi_turnover', 'kpi_kds_time',
    'dre_summary',
    'chart_sales_1', 'menu_engineering', 'list_top_items', 
    'chart_hourly_1', 'list_waiter_ranking',
    'list_recent_orders', 'list_payment_methods', 'list_low_stock'
  ];
  private widgetOrder = signal<string[]>([]);
  
  constructor() {
    effect(() => {
      const activeUnitId = this.unitContextService.activeUnitId(); // Track activeUnitId
      if (activeUnitId) {
          this.loadData();
      }
    });
  }

  ngOnInit() {
    this.loadLayout();
  }

  private async loadData() {
    this.isLoading.set(true);
    const { startDate, endDate } = this.getDateRange();
    try {
        await this.supabaseStateService.fetchPerformanceDataForPeriod(startDate, endDate);
        this.loadChartData(startDate, endDate);
        this.loadHourlySalesData(startDate, endDate);
    } catch (error) {
        console.error("Error loading dashboard data", error);
    } finally {
        this.isLoading.set(false);
    }
  }

  private getDateRange(): { startDate: Date, endDate: Date } {
    const now = new Date();
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);
    let startDate = new Date(now);

    switch (this.period()) {
        case 'day':
            startDate.setHours(0, 0, 0, 0);
            break;
        case 'week':
            const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // Monday=0
            startDate = new Date(new Date().setDate(now.getDate() - dayOfWeek));
            startDate.setHours(0, 0, 0, 0);
            break;
        case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            startDate.setHours(0, 0, 0, 0);
            break;
    }
    return { startDate, endDate };
  }

  // --- Widget Definition ---
  dashboardWidgets = computed(() => {
    const order = this.widgetOrder();
    
    // KPI Data
    const turnover = this.averageTurnoverTime();
    const kdsTime = this.averageKdsTime();

    const allWidgets: Record<string, DashboardWidget> = {
      'kpi_turnover': { 
        type: 'kpi', id: 'kpi_turnover', cols: 1, label: 'Turnover (Ciclo Médio)', 
        value: `${turnover} min`, 
        subValue: 'Tempo na mesa', icon: 'timer', colorClass: 'text-rose-500 bg-rose-500/10', route: '/pos'
      },
      'kpi_kds_time': { 
        type: 'kpi', id: 'kpi_kds_time', cols: 1, label: 'Tempo de Cozinha', 
        value: `${kdsTime} min`, 
        subValue: 'Média de preparo', icon: 'skillet', colorClass: kdsTime > 15 ? 'text-rose-500 bg-rose-500/10' : 'text-amber-500 bg-amber-500/10', route: '/kds'
      },
      'dre_summary': {
        type: 'dre_summary', id: 'dre_summary', cols: 2, title: 'DRE - Demonstrativo de Resultado'
      },
      'menu_engineering': {
        type: 'menu_engineering', id: 'menu_engineering', cols: 2, title: 'Matriz BCG de Engenharia do Cardápio'
      },
      'chart_sales_1': {
        type: 'chart_sales', id: 'chart_sales_1', cols: 2,
        title: 'Evolução de Vendas vs. Custo'
      },
      'chart_hourly_1': {
        type: 'chart_hourly', id: 'chart_hourly_1', cols: 2,
        title: 'Horários de Pico'
      },
      'list_top_items': {
        type: 'list_top_items', id: 'list_top_items', cols: 1,
        title: 'Top 5 Mais Vendidos'
      },
      'list_waiter_ranking': {
        type: 'list_waiter_ranking', id: 'list_waiter_ranking', cols: 1,
        title: 'Ranking de Garçons (Ticket Médio)'
      },
      'list_recent_orders': {
        type: 'list_recent_orders', id: 'list_recent_orders', cols: 1,
        title: 'Últimos Pedidos Finalizados'
      },
      'list_payment_methods': {
        type: 'list_payment_methods', id: 'list_payment_methods', cols: 1,
        title: 'Formas de Pagamento'
      },
      'list_low_stock': {
        type: 'list_low_stock', id: 'list_low_stock', cols: 1,
        title: 'Alerta de Estoque'
      }
    };

    return order
      .map(id => allWidgets[id])
      .filter(w => w !== undefined);
  });

  // --- Data Loading for Charts ---
  async loadChartData(startDate: Date, endDate: Date) {
    this.isChartLoading.set(true);
    try {
      const data = await this.cashierDataService.getSalesAndCogsForPeriod(startDate, endDate);
      this.salesCogsData.set(data);
    } catch (error) {
      console.error('Error loading chart data:', error);
    } finally {
      this.isChartLoading.set(false);
    }
  }

  async loadHourlySalesData(startDate: Date, endDate: Date) {
    this.isHourlyChartLoading.set(true);
    try {
      const formatLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const data = await this.cashierDataService.getSalesByHourForPeriod(formatLocal(startDate), formatLocal(endDate));
      this.hourlySalesData.set(data);
    } catch (error) {
      console.error('Error loading hourly sales data:', error);
    } finally {
      this.isHourlyChartLoading.set(false);
    }
  }

  // --- Layout Management ---
  setPeriod(p: ReportPeriod) {
    this.period.set(p);
  }
  
  toggleEditMode() {
    this.editMode.update(mode => !mode);
    if (!this.editMode()) {
      this.saveLayout();
    }
  }
  
  drop(event: CdkDragDrop<string[]>) {
    if (event.previousIndex !== event.currentIndex) {
      this.widgetOrder.update(currentOrder => {
        const newOrder = [...currentOrder];
        moveItemInArray(newOrder, event.previousIndex, event.currentIndex);
        return newOrder;
      });
    }
  }
  
  private saveLayout() {
    localStorage.setItem('dashboardLayoutV2', JSON.stringify(this.widgetOrder()));
  }
  
  private loadLayout() {
    const savedLayout = localStorage.getItem('dashboardLayoutV2');
    
    if (savedLayout && savedLayout !== 'undefined') {
      try {
        const savedOrder: string[] = JSON.parse(savedLayout);
        // Ensure new widgets are added if layout is old
        const savedSet = new Set(savedOrder);
        const missingWidgets = this.defaultWidgetOrder.filter(id => !savedSet.has(id));
        
        this.widgetOrder.set([...savedOrder, ...missingWidgets]);
      } catch (e) {
        console.error('Failed to parse dashboard layout, reverting to default.', e);
        this.widgetOrder.set(this.defaultWidgetOrder);
      }
    } else {
      this.widgetOrder.set(this.defaultWidgetOrder);
    }
  }

  // --- Computed Data Signals ---

  // Financials
  totalSales = computed(() => this.dashboardState.performanceTransactions().filter(t => t.type === 'Receita').reduce((sum, item) => sum + item.amount, 0));
  
  cogs = computed(() => {
    const recipeCosts = this.recipeState.recipeCosts();
    return this.dashboardState.performanceCompletedOrders().flatMap(o => o.order_items).reduce((sum, item) => {
      if (item.status === 'CANCELADO') return sum;
      // AUDIT: Usa unit_cost salvo na venda (furo de precisão temporal corrigido)
      const cost = item.unit_cost && item.unit_cost > 0 ? item.unit_cost : (recipeCosts.get(item.recipe_id)?.totalCost ?? 0);
      return sum + (cost * item.quantity);
    }, 0);
  });

  opex = computed(() => this.dashboardState.performanceTransactions().filter(t => t.type === 'Despesa').reduce((sum, item) => sum + item.amount, 0));

  grossProfit = computed(() => this.totalSales() - this.cogs());
  netProfit = computed(() => this.grossProfit() - this.opex());
  totalOrders = computed(() => this.dashboardState.performanceCompletedOrders().length);
  
  averageTicket = computed(() => {
    const totalOrders = this.totalOrders();
    return totalOrders > 0 ? this.totalSales() / totalOrders : 0;
  });
  
  openOrdersCount = computed(() => this.posState.orders().filter(o => o.status === 'OPEN').length);

  occupancyRate = computed(() => {
    const total = this.totalTablesCount();
    if (total === 0) return 0;
    return this.occupiedTablesCount() / total;
  });

  averageTurnoverTime = computed(() => {
    const tableOrders = this.dashboardState.performanceCompletedOrders().filter(o => o.order_type === 'Dine-in' && o.completed_at && o.timestamp);
    if (tableOrders.length === 0) return 0;
    
    const totalMinutes = tableOrders.reduce((sum, order) => {
       const start = new Date(order.timestamp).getTime();
       const end = new Date(order.completed_at!).getTime();
       return sum + ((end - start) / (1000 * 60));
    }, 0);
    return Math.round(totalMinutes / tableOrders.length);
  });

  averageKdsTime = computed(() => {
    let totalMinutes = 0;
    let count = 0;
    
    const orders = this.dashboardState.performanceCompletedOrders();
    for (const order of orders) {
       for (const item of order.order_items) {
           if (item.notes?.includes('[AUX_PREP_IDX:') && !item.notes?.includes('[AUX_PREP_IDX:0]')) continue;
           if (item.status_timestamps && item.status_timestamps['PRONTO'] && item.created_at) {
               const start = new Date(item.created_at).getTime();
               const end = new Date(item.status_timestamps['PRONTO']).getTime();
               totalMinutes += ((end - start) / (1000 * 60));
               count++;
           }
       }
    }
    
    return count > 0 ? Math.round(totalMinutes / count) : 0;
  });

  // Lists Data
  
  topSellingItems = computed(() => {
    const orders = this.dashboardState.performanceCompletedOrders();
    const itemCounts = new Map<string, {name: string, quantity: number, revenue: number}>();

    for (const order of orders) {
      for (const item of order.order_items) {
        if (!item.recipe_id || item.status === 'CANCELADO') continue;
        if (item.notes?.includes('[AUX_PREP_IDX:') && !item.notes?.includes('[AUX_PREP_IDX:0]')) continue;
        const existing = itemCounts.get(item.recipe_id) || { name: item.name, quantity: 0, revenue: 0 };
        existing.quantity += item.quantity;
        existing.revenue += (item.price * item.quantity);
        itemCounts.set(item.recipe_id, existing);
      }
    }

    return Array.from(itemCounts.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
  });

  recentCompletedOrders = computed(() => {
    return this.dashboardState.performanceCompletedOrders()
      .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())
      .slice(0, 5)
      .map(o => ({
         id: o.id.slice(0, 6),
         time: o.completed_at,
         total: o.order_items.reduce((s, i) => s + (i.price * i.quantity), 0),
         type: o.order_type,
         fullOrder: o
      }));
  });

  paymentMethodsDistribution = computed(() => {
    const transactions = this.dashboardState.performanceTransactions().filter(t => t.type === 'Receita');
    const methodCounts = new Map<string, number>();
    let totalValue = 0;

    const methodRegex = /\(([^)]+)\)/; // Extracts text inside parentheses

    for (const t of transactions) {
        const match = t.description.match(methodRegex);
        let method = match ? match[1] : 'Outros';

        // Normalize
        method = method.split('|')[0].trim();
        const methodUpper = method.toUpperCase();
        
        if (methodUpper.includes('CREDIT') || methodUpper.includes('CRÉDITO')) {
            method = 'Crédito';
        } else if (methodUpper.includes('DEBIT') || methodUpper.includes('DÉBITO')) {
            method = 'Débito';
        } else if (methodUpper.includes('PIX')) {
            method = 'PIX';
        } else if (methodUpper.includes('DINHEIRO') || methodUpper.includes('CASH')) {
            method = 'Dinheiro';
        } else if (methodUpper.includes('CONTATO:')) {
            method = 'Delivery/App';
        } else if (method.length > 20) {
            method = method.substring(0, 20) + '...';
        }

        methodCounts.set(method, (methodCounts.get(method) || 0) + t.amount);
        totalValue += t.amount;
    }

    return Array.from(methodCounts.entries())
      .map(([method, value]) => ({ 
        method, 
        value, 
        percentage: totalValue > 0 ? (value / totalValue) * 100 : 0 
      }))
      .sort((a, b) => b.value - a.value);
  });

  waiterRanking = computed(() => {
    const tableOrders = this.dashboardState.performanceCompletedOrders().filter(o => o.order_type === 'Dine-in' && o.created_by_employee_id);
    const waiterStats = new Map<string, { name: string, totalRevenue: number, orderCount: number }>();
    const staff = this.hrState.employees() || [];
    
    for (const order of tableOrders) {
      if (!order.created_by_employee_id) continue;
      const waiterId = order.created_by_employee_id;
      const existing = waiterStats.get(waiterId) || { name: staff.find(s => s.id === waiterId)?.name || 'Atendente ' + waiterId.slice(0, 4), totalRevenue: 0, orderCount: 0 };
      
      const orderTotal = order.order_items.reduce((s, i) => s + (i.price * i.quantity), 0);
      existing.totalRevenue += orderTotal;
      existing.orderCount++;
      waiterStats.set(waiterId, existing);
    }
    
    return Array.from(waiterStats.values())
      .map(w => ({
         name: w.name,
         avgTicket: w.orderCount > 0 ? w.totalRevenue / w.orderCount : 0,
         totalRevenue: w.totalRevenue,
         orders: w.orderCount
      }))
      .sort((a, b) => b.avgTicket - a.avgTicket)
      .slice(0, 5);
  });

  lowStockItems = computed(() => {
     return this.inventoryState.ingredients()
       .filter(i => i.stock < i.min_stock)
       .slice(0, 5)
       .map(i => ({
         name: i.name,
         stock: i.stock,
         unit: i.unit,
         min: i.min_stock
       }));
  });

  // BCG Matrix for Menu Engineering (Fase 1: BCG Menu Engineering Analytics)
  bcgMatrix = computed(() => {
    const orders = this.dashboardState.performanceCompletedOrders();
    const recipes = this.recipeState.recipes();
    const recipeCosts = this.recipeState.recipeCosts();
    
    // 1. Calculate sales of all items sold in order_items
    const salesMap = new Map<string, { quantity: number; revenue: number }>();
    let totalItemsQuantity = 0;
    
    for (const order of orders) {
      for (const item of order.order_items) {
        if (!item.recipe_id || item.status === 'CANCELADO') continue;
        if (item.notes?.includes('[AUX_PREP_IDX:') && !item.notes?.includes('[AUX_PREP_IDX:0]')) continue;
        const current = salesMap.get(item.recipe_id) || { quantity: 0, revenue: 0 };
        current.quantity += item.quantity;
        current.revenue += (item.price * item.quantity);
        salesMap.set(item.recipe_id, current);
        totalItemsQuantity += item.quantity;
      }
    }

    // 2. Define minimum quantities and margins for BCG analysis
    // If no sales exist in selected period, populate with all recipes with fallback simulated volumes for demo/launch purposes
    const itemDataList: Array<{
      id: string;
      name: string;
      price: number;
      cost: number;
      margin: number;
      marginPercent: number;
      quantitySold: number;
    }> = [];

    const hasSales = salesMap.size > 0;

    for (const recipe of recipes) {
      if (recipe.is_sub_recipe) continue; // Skip sub-recipes, we only analyze final dishes sold
      const sales = salesMap.get(recipe.id);
      
      // Seed pseudo-random fallback sales volume if zero sales total exist in current filter to avoid blank display
      const hash = recipe.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const quantitySold = sales ? sales.quantity : (hasSales ? 0 : (hash % 15) + 3); 
      
      // For Menu Engineering, we intentionally use the CURRENT cost (recipeCosts), 
      // not historical, because we need to know the CURRENT profitability to make pricing decisions.
      const cost = recipeCosts.get(recipe.id)?.totalCost ?? 0;
      const margin = (recipe.price || 0) - cost;
      const marginPercent = recipe.price > 0 ? (margin / recipe.price) * 100 : 0;

      itemDataList.push({
        id: recipe.id,
        name: recipe.name,
        price: recipe.price,
        cost,
        margin,
        marginPercent,
        quantitySold
      });
    }

    if (itemDataList.length === 0) {
      return {
        stars: [],
        plowhorses: [],
        puzzles: [],
        dogs: [],
        stats: { avgQuantity: 0, avgMargin: 0 }
      };
    }

    // Calculate averages (Averages are weighted / simple averages of the set)
    const totalQuantity = itemDataList.reduce((sum, item) => sum + item.quantitySold, 0);
    const avgQuantity = totalQuantity / itemDataList.length;
    
    const totalMargin = itemDataList.reduce((sum, item) => sum + item.margin, 0);
    const avgMargin = totalMargin / itemDataList.length;

    const stars: typeof itemDataList = [];
    const plowhorses: typeof itemDataList = [];
    const puzzles: typeof itemDataList = [];
    const dogs: typeof itemDataList = [];

    for (const item of itemDataList) {
      const isHighPopularity = item.quantitySold >= avgQuantity;
      const isHighProfitability = item.margin >= avgMargin;

      if (isHighPopularity && isHighProfitability) {
        stars.push(item);
      } else if (isHighPopularity && !isHighProfitability) {
        plowhorses.push(item);
      } else if (!isHighPopularity && isHighProfitability) {
        puzzles.push(item);
      } else {
        dogs.push(item);
      }
    }

    // Sort descending by popularity
    const sortByQuantity = (a: any, b: any) => b.quantitySold - a.quantitySold;
    stars.sort(sortByQuantity);
    plowhorses.sort(sortByQuantity);
    puzzles.sort(sortByQuantity);
    dogs.sort(sortByQuantity);

    return {
      stars,
      plowhorses,
      puzzles,
      dogs,
      stats: {
        avgQuantity: Math.round(avgQuantity * 10) / 10,
        avgMargin: Math.round(avgMargin * 100) / 100
      }
    };
  });

  // IA Recommendations based on quadrants performance
  bcgAdvisorRecommendations = computed(() => {
    const matrix = this.bcgMatrix();
    const recs: Array<{ title: string; action: string; badge: string; type: 'success' | 'warning' | 'info' | 'danger' }> = [];

    if (matrix.stars.length > 0) {
      const topStar = matrix.stars[0];
      recs.push({
        title: `Proteger Margem de "${topStar.name}"`,
        action: `Este é seu prato estrela mais popular. Certifique-se de manter rígido o controle de desperdício dele e destaque-o com selo "Chefe Recomenda" no iFood e cardápio digital.`,
        badge: 'Estrela',
        type: 'success'
      });
    }

    if (matrix.plowhorses.length > 0) {
      const topHorse = matrix.plowhorses[0];
      const targetPrice = Math.ceil(topHorse.price * 1.08); // recommend 8% raising
      recs.push({
        title: `Reajuste em "${topHorse.name}" Detectado`,
        action: `Alta popularidade, mas rentabilidade abaixo da média (margem de ${topHorse.marginPercent.toFixed(0)}%). Recomendamos aumentar o preço de venda para R$ ${targetPrice.toFixed(2)} ou negociar custos de insumo para elevar a margem de lucro sem sacrificar volume.`,
        badge: 'Cavalo de Batalha',
        type: 'warning'
      });
    }

    if (matrix.puzzles.length > 0) {
      const topPuzzle = matrix.puzzles[0];
      recs.push({
        title: `Promover "${topPuzzle.name}" com Urgência`,
        action: `Prato altamente rentável (margem de R$ ${topPuzzle.margin.toFixed(2)}), porém com venda tímida (${topPuzzle.quantitySold} unidades). Insira-o no menu executivo da semana ou sugira como "Up-sell" obrigatório pelos garçons no PDV.`,
        badge: 'Quebra-Cabeça',
        type: 'info'
      });
    }

    if (matrix.dogs.length > 0) {
      const topDog = matrix.dogs[0];
      recs.push({
        title: `Revisar Receita de "${topDog.name}"`,
        action: `Consumo e lucro baixos. Considere agrupar este item em combos promocionais temporários ou retirar definitivamente do cardápio para simplificar a operação de estoque.`,
        badge: 'Vira-Lata',
        type: 'danger'
      });
    } else {
      recs.push({
        title: 'Engenharia de Cardápio Otimizada',
        action: 'Parabéns, seu cardápio está equilibrado! Continue monitorando os insumos diários para evitar que a flutuação de inflação reduza suas margens.',
        badge: 'IA Insight',
        type: 'success'
      });
    }

    return recs;
  });

}
