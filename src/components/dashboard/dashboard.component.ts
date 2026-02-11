
import { Component, ChangeDetectionStrategy, inject, computed, signal, effect, untracked, OnInit } from '@angular/core';
import { CdkDragDrop, moveItemInArray, CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
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
import { Order } from '../../models/db.models';

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
  type: 'list_top_items' | 'list_recent_orders' | 'list_payment_methods' | 'list_low_stock';
  title: string;
}

type DashboardWidget = KpiWidget | ChartWidget | ListWidget;
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

  // Layout Management
  private defaultWidgetOrder = [
    'kpi_sales', 'kpi_profit', 'kpi_ticket', 'kpi_orders', 
    'chart_sales_1', 'list_top_items', 
    'chart_hourly_1', 'list_payment_methods',
    'list_recent_orders', 'list_low_stock'
  ];
  private widgetOrder = signal<string[]>([]);
  
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

  // --- Widget Definition ---
  dashboardWidgets = computed(() => {
    const order = this.widgetOrder();
    const periodLabel = { day: 'Hoje', week: 'Esta Semana', month: 'Este Mês' }[this.period()];
    
    // KPI Data
    const totalSales = this.totalSales();
    const grossProfit = this.grossProfit();
    const avgTicket = this.averageTicket();
    const orderCount = this.totalOrders();

    const allWidgets: Record<string, DashboardWidget> = {
      'kpi_sales': { 
        type: 'kpi', id: 'kpi_sales', cols: 1, label: 'Vendas Totais', 
        value: totalSales.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 
        subValue: periodLabel, icon: 'monetization_on', colorClass: 'text-green-400', route: '/reports'
      },
      'kpi_profit': { 
        type: 'kpi', id: 'kpi_profit', cols: 1, label: 'Lucro Bruto (Est.)', 
        value: grossProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 
        subValue: 'Baseado no CMV', icon: 'trending_up', colorClass: 'text-blue-400', route: '/reports'
      },
      'kpi_ticket': { 
        type: 'kpi', id: 'kpi_ticket', cols: 1, label: 'Ticket Médio', 
        value: avgTicket.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 
        subValue: 'Por pedido', icon: 'receipt_long', colorClass: 'text-purple-400', route: '/performance'
      },
      'kpi_orders': { 
        type: 'kpi', id: 'kpi_orders', cols: 1, label: 'Pedidos Realizados', 
        value: orderCount.toString(), 
        subValue: `${this.openOrdersCount()} abertos agora`, icon: 'shopping_cart_checkout', colorClass: 'text-yellow-400', route: '/pos'
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
      const data = await this.cashierDataService.getSalesByHourForPeriod(startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]);
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
  
  openOrdersCount = computed(() => this.posState.orders().filter(o => o.status === 'OPEN').length);

  // Lists Data
  
  topSellingItems = computed(() => {
    const orders = this.dashboardState.performanceCompletedOrders();
    const itemCounts = new Map<string, {name: string, quantity: number, revenue: number}>();

    for (const order of orders) {
      for (const item of order.order_items) {
        if (!item.recipe_id) continue;
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
         type: o.order_type
      }));
  });

  paymentMethodsDistribution = computed(() => {
    const transactions = this.dashboardState.performanceTransactions().filter(t => t.type === 'Receita');
    const methodCounts = new Map<string, number>();
    let totalValue = 0;

    const methodRegex = /\(([^)]+)\)/; // Extracts text inside parentheses

    for (const t of transactions) {
        const match = t.description.match(methodRegex);
        const method = match ? match[1] : 'Outros';
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

}
