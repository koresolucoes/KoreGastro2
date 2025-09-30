import { Component, ChangeDetectionStrategy, inject, computed, signal, effect, untracked, OnInit } from '@angular/core';
import { CdkDragDrop, moveItemInArray, CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { CommonModule, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

import { SupabaseStateService } from '../../services/supabase-state.service';
import { CashierDataService, DailySalesCogs, PeakHoursData } from '../../services/cashier-data.service';
import { SalesCogsChartComponent } from './sales-cogs-chart/sales-cogs-chart.component';
import { HourlySalesChartComponent } from './hourly-sales-chart/hourly-sales-chart.component';
import { DashboardStateService } from '../../services/dashboard-state.service';
import { RecipeStateService } from '../../services/recipe-state.service';
import { PosStateService } from '../../services/pos-state.service';
import { SettingsStateService } from '../../services/settings-state.service';
import { HrStateService } from '../../services/hr-state.service';
import { InventoryStateService } from '../../services/inventory-state.service';

// NOVO: Interfaces para um sistema de widgets unificado
interface KpiWidget {
  type: 'kpi';
  id: string; // Usaremos o label como ID único para KPIs
  label: string;
  value: string | number;
  icon: string;
  route: string;
}

interface ChartWidget {
  type: 'chart_sales' | 'chart_hourly';
  id: string; // ID único para os gráficos
  title: string;
}

// NOVO: Um tipo união para qualquer widget do dashboard
type DashboardWidget = KpiWidget | ChartWidget;


@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, 
    SalesCogsChartComponent, 
    HourlySalesChartComponent,
    CdkDropList,
    CdkDrag,
    DatePipe,
    RouterLink // Adicionado para [routerLink]
  ],
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DatePipe]
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
  private router = inject(Router);
  
  // UI State
  editMode = signal(false);
  
  isLoading = computed(() => !this.supabaseStateService.isDataLoaded());

  // Chart state
  isChartLoading = signal(true);
  chartPeriod = signal<7 | 30>(7);
  salesCogsData = signal<DailySalesCogs[]>([]);
  
  isHourlyChartLoading = signal(true);
  hourlySalesData = signal<PeakHoursData[]>([]);

  // NOVO: Signal unificado para todos os widgets do dashboard
  dashboardWidgets = signal<DashboardWidget[]>([]);

  constructor() {
    // NOVO: Efeito para manter os valores dos widgets atualizados de forma reativa
    this.dashboardWidgets.set(this.buildWidgets());
    effect(() => {
      // Este effect será re-executado sempre que um dos signals (totalSales, etc.) mudar
      const updatedData = this.buildWidgets();
      
      // Mapeia os novos dados para a ordem atual para não resetar o layout do usuário
      this.dashboardWidgets.update(currentWidgets => {
        const dataMap = new Map(updatedData.map(d => [d.id, d]));
        return currentWidgets.map(widget => {
          const newWidgetData = dataMap.get(widget.id);
          return newWidgetData ? { ...widget, ...newWidgetData } : widget;
        });
      });

      // Efeito para carregar dados do gráfico quando o período muda
      const period = this.chartPeriod();
      untracked(() => this.loadChartData(period));
    });
  }

  ngOnInit() {
    this.loadHourlySalesData();
    this.loadLayout();
  }

  // NOVO: Função para construir o array de widgets. Centraliza a criação de dados.
  private buildWidgets(): DashboardWidget[] {
    return [
      { 
        type: 'kpi',
        id: 'Vendas Totais (Hoje)',
        label: 'Vendas Totais (Hoje)', 
        value: this.totalSales().toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 
        icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01',
        route: '/reports/sales'
      },
      { 
        type: 'kpi',
        id: 'Lucro Bruto (Hoje)',
        label: 'Lucro Bruto (Hoje)', 
        value: this.grossProfitToday().toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 
        icon: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125-1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0z',
        route: '/reports/profit'
      },
      { 
        type: 'kpi',
        id: 'Ticket Médio (Hoje)',
        label: 'Ticket Médio (Hoje)', 
        value: this.averageTicketToday().toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 
        icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
        route: '/reports/performance'
      },
      { 
        type: 'kpi',
        id: 'Pedidos Totais (Hoje)',
        label: 'Pedidos Totais (Hoje)', 
        value: this.totalOrdersToday().toString(), 
        icon: 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12',
        route: '/orders'
      },
      { 
        type: 'kpi',
        id: 'Pedidos iFood (Abertos)',
        label: 'Pedidos iFood (Abertos)', 
        value: this.openIfoodOrders().toString(), 
        icon: 'M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125V14.25m-17.25 4.5v-1.875a3.375 3.375 0 013.375-3.375h1.5a1.125 1.125 0 011.125 1.125v1.5a3.375 3.375 0 00-3.375 3.375H3.375z',
        route: '/orders?source=ifood'
      },
      { 
        type: 'kpi',
        id: 'Reservas (Hoje)',
        label: 'Reservas (Hoje)', 
        value: this.reservationsToday().length.toString(), 
        icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
        route: '/reservations'
      },
      {
        type: 'chart_sales',
        id: 'chart_sales_1',
        title: `Vendas (últimos ${this.chartPeriod()} dias)`
      },
      {
        type: 'chart_hourly',
        id: 'chart_hourly_1',
        title: 'Vendas por Hora (Hoje)'
      }
    ];
  }

  async loadChartData(days: 7 | 30) {
    this.isChartLoading.set(true);
    try {
      const data = await this.cashierDataService.getSalesAndCogsForPeriod(days);
      this.salesCogsData.set(data);
    } catch (error) {
      console.error('Error loading chart data:', error);
    } finally {
      this.isChartLoading.set(false);
    }
  }

  async loadHourlySalesData() {
    this.isHourlyChartLoading.set(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const data = await this.cashierDataService.getSalesByHourForPeriod(today, today);
      this.hourlySalesData.set(data);
    } catch (error) {
      console.error('Error loading hourly sales data:', error);
    } finally {
      this.isHourlyChartLoading.set(false);
    }
  }

  setChartPeriod(days: 7 | 30) {
    this.chartPeriod.set(days);
  }
  
  toggleEditMode() {
    this.editMode.update(mode => !mode);
    if (!this.editMode()) {
      this.saveLayout();
    }
  }
  
  // MODIFICADO: Função drop para manipular a lista unificada de widgets
  drop(event: CdkDragDrop<DashboardWidget[]>) {
    if (event.previousIndex !== event.currentIndex) {
      const widgets = [...this.dashboardWidgets()];
      moveItemInArray(widgets, event.previousIndex, event.currentIndex);
      this.dashboardWidgets.set(widgets);
    }
  }
  
  // MODIFICADO: Salva o layout com base nos IDs dos widgets
  private saveLayout() {
    const layout = this.dashboardWidgets().map(widget => widget.id);
    localStorage.setItem('dashboardLayout', JSON.stringify(layout));
  }
  
  // MODIFICADO: Carrega o layout e reordena os widgets
  private loadLayout() {
    const savedLayout = localStorage.getItem('dashboardLayout');
    if (savedLayout) {
      try {
        const layoutOrder: string[] = JSON.parse(savedLayout);
        const currentWidgets = [...this.dashboardWidgets()];
        const widgetMap = new Map(currentWidgets.map(widget => [widget.id, widget]));
        
        const reorderedWidgets = layoutOrder
          .map(id => widgetMap.get(id))
          .filter((widget): widget is DashboardWidget => widget !== undefined);
        
        const newWidgets = currentWidgets.filter(widget => !layoutOrder.includes(widget.id));
        
        this.dashboardWidgets.set([...reorderedWidgets, ...newWidgets]);
      } catch (e) {
        console.error('Failed to load dashboard layout', e);
      }
    }
  }

  // MODIFICADO: Função para obter a rota a partir do label do KPI
  getRouteForStat(label: string): string {
    const widget = this.dashboardWidgets().find(w => w.type === 'kpi' && w.label === label) as KpiWidget | undefined;
    return widget ? widget.route : '/dashboard';
  }

  // REMOVIDO: Funções `updateStats` e `getStatValue` agora são desnecessárias
  // O `effect` no construtor cuida das atualizações de forma reativa e mais eficiente.

  // Funções de comparação (mantidas como exemplo)
  hasComparison(label: string): boolean {
    return ['Vendas Totais (Hoje)', 'Lucro Bruto (Hoje)', 'Ticket Médio (Hoje)', 'Pedidos Totais (Hoje)'].includes(label);
  }
  
  isPositiveComparison(label: string): boolean {
    return Math.random() > 0.5; // Lógica de exemplo
  }
  
  getComparisonText(label: string): string {
    const value = Math.floor(Math.random() * 20) + 1;
    return `${value}% em relação ao período anterior`; // Lógica de exemplo
  }

  // Todos os computed signals permanecem os mesmos
  totalSales = computed(() => this.dashboardState.dashboardTransactions().filter(t => t.type === 'Receita').reduce((sum, item) => sum + item.amount, 0));
  
  cogsToday = computed(() => {
    const recipeCosts = this.recipeState.recipeCosts();
    return this.dashboardState.dashboardCompletedOrders().flatMap(o => o.order_items).reduce((sum, item) => {
      const cost = recipeCosts.get(item.recipe_id)?.totalCost ?? 0;
      return sum + (cost * item.quantity);
    }, 0);
  });

  grossProfitToday = computed(() => this.totalSales() - this.cogsToday());

  averageTicketToday = computed(() => {
    const totalOrders = this.dashboardState.dashboardCompletedOrders().length;
    return totalOrders > 0 ? this.totalSales() / totalOrders : 0;
  });
  
  totalOrdersToday = computed(() => this.dashboardState.dashboardCompletedOrders().length);

  openIfoodOrders = computed(() => this.posState.openOrders().filter(o => o.order_type.startsWith('iFood')).length);

  reservationsToday = computed(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return this.settingsState.reservations().filter(r => new Date(r.reservation_time).toISOString().split('T')[0] === todayStr && r.status === 'CONFIRMED');
  });

  lowStockItemsList = computed(() => this.inventoryState.ingredients().filter(i => i.stock < i.min_stock).slice(0, 5));

  employeesOnLeaveToday = computed(() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const todayStr = today.toISOString().split('T')[0];
    return this.hrState.leaveRequests().filter(r => r.status === 'Aprovada' && r.start_date <= todayStr && r.end_date >= todayStr);
  });

  // REMOVIDO: A declaração inicial do `stats = signal<KpiStat[]>` foi apagada.
}