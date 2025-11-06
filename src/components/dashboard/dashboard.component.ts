import { Component, ChangeDetectionStrategy, inject, computed, signal, effect, untracked, OnInit } from '@angular/core';
import { CdkDragDrop, moveItemInArray, CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
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

interface KpiWidget {
  type: 'kpi';
  id: string;
  label: string;
  value: string | number;
  icon: string;
  route: string;
}

interface ChartWidget {
  type: 'chart_sales' | 'chart_hourly';
  id: string;
  title: string;
}

type DashboardWidget = KpiWidget | ChartWidget;
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
    RouterLink
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
  private router = inject(Router);
  
  // UI State
  editMode = signal(false);
  period = signal<ReportPeriod>('day');
  
  // Chart state
  isLoading = signal(true);
  isChartLoading = signal(true);
  salesCogsData = signal<DailySalesCogs[]>([]);
  
  isHourlyChartLoading = signal(true);
  hourlySalesData = signal<PeakHoursData[]>([]);

  // --- NEW STATE MANAGEMENT ---
  private widgetOrder = signal<string[]>([]);
  
  private allWidgetsDataMap = computed(() => {
    const widgets = this.buildWidgets();
    return new Map(widgets.map(w => [w.id, w]));
  });
  
  dashboardWidgets = computed(() => {
    const order = this.widgetOrder();
    const dataMap = this.allWidgetsDataMap();
    if (order.length === 0) return [];
    return order
      .map(id => dataMap.get(id))
      .filter((w): w is DashboardWidget => w !== undefined);
  });
  
  constructor() {
    effect(() => {
      this.loadData();
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


  private buildWidgets(): DashboardWidget[] {
    const periodLabel = { day: '(Hoje)', week: '(Esta Semana)', month: '(Este Mês)' }[this.period()];
    
    return [
      { 
        type: 'kpi', id: 'Vendas Totais', label: `Vendas Totais ${periodLabel}`, 
        value: this.totalSales().toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 
        icon: 'monetization_on', route: '/reports'
      },
      { 
        type: 'kpi', id: 'Lucro Bruto', label: `Lucro Bruto ${periodLabel}`, 
        value: this.grossProfit().toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 
        icon: 'trending_up', route: '/reports'
      },
      { 
        type: 'kpi', id: 'Ticket Médio', label: `Ticket Médio ${periodLabel}`, 
        value: this.averageTicket().toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 
        icon: 'receipt_long', route: '/performance'
      },
      { 
        type: 'kpi', id: 'Pedidos Totais', label: `Pedidos Totais ${periodLabel}`, 
        value: this.totalOrders().toString(), 
        icon: 'list_alt', route: '/cashier'
      },
      { 
        type: 'kpi', id: 'Pedidos iFood (Abertos)', label: 'Pedidos iFood (Abertos)', 
        value: this.openIfoodOrders().toString(), 
        icon: 'delivery_dining', route: '/ifood-kds'
      },
      { 
        type: 'kpi', id: 'Reservas (Hoje)', label: 'Reservas (Hoje)', 
        value: this.reservationsToday().length.toString(), 
        icon: 'event_available', route: '/reservations'
      },
      {
        type: 'chart_sales', id: 'chart_sales_1',
        title: 'Vendas vs. Custo (CMV)'
      },
      {
        type: 'chart_hourly', id: 'chart_hourly_1',
        title: 'Vendas por Hora'
      }
    ];
  }

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
      const data = await this.cashierDataService.getSalesByHourForPeriod(startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]);
      this.hourlySalesData.set(data);
    } catch (error) {
      console.error('Error loading hourly sales data:', error);
    } finally {
      this.isHourlyChartLoading.set(false);
    }
  }

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
    localStorage.setItem('dashboardLayout', JSON.stringify(this.widgetOrder()));
  }
  
  private loadLayout() {
    const defaultOrder = this.buildWidgets().map(w => w.id);
    const savedLayout = localStorage.getItem('dashboardLayout');
    
    if (savedLayout && savedLayout !== 'undefined') {
      try {
        const savedOrder: string[] = JSON.parse(savedLayout);
        if (Array.isArray(savedOrder)) {
          const savedOrderSet = new Set(savedOrder);
          const newWidgetIds = defaultOrder.filter(id => !savedOrderSet.has(id));
          this.widgetOrder.set([...savedOrder, ...newWidgetIds]);
        } else {
          this.widgetOrder.set(defaultOrder);
        }
      } catch (e) {
        console.error('Failed to parse dashboard layout, reverting to default.', e);
        this.widgetOrder.set(defaultOrder);
      }
    } else {
      this.widgetOrder.set(defaultOrder);
    }
  }

  getRouteForStat(label: string): string {
    const widget = this.allWidgetsDataMap().get(label.split(' (')[0]) as KpiWidget | undefined;
    return widget ? widget.route : '/dashboard';
  }

  hasComparison(label: string): boolean {
    return false; // Comparison logic removed for simplicity, can be re-added later
  }
  
  isPositiveComparison(label: string): boolean {
    return true; 
  }
  
  getComparisonText(label: string): string {
    return ``; 
  }

  // --- Computed Data Signals ---

  totalSales = computed(() => this.dashboardState.performanceTransactions().filter(t => t.type === 'Receita').reduce((sum, item) => sum + item.amount, 0));
  
  cogs = computed(() => {
    const recipeCosts = this.recipeState.recipeCosts();
    return this.dashboardState.performanceCompletedOrders().flatMap(o => o.order_items).reduce((sum, item) => {
      const cost = recipeCosts.get(item.recipe_id)?.totalCost ?? 0;
      return sum + (cost * item.quantity);
    }, 0);
  });

  grossProfit = computed(() => this.totalSales() - this.cogs());

  totalOrders = computed(() => this.dashboardState.performanceCompletedOrders().length);

  averageTicket = computed(() => {
    const totalOrders = this.totalOrders();
    return totalOrders > 0 ? this.totalSales() / totalOrders : 0;
  });
  
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
}
