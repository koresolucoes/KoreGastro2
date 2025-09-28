import { Component, ChangeDetectionStrategy, inject, computed, signal, effect, untracked, OnInit } from '@angular/core';
import { CdkDragDrop, moveItemInArray, CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';

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

interface KpiStat {
  label: string;
  value: string | number;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, 
    SalesCogsChartComponent, 
    HourlySalesChartComponent,
    CdkDropList,
    CdkDrag,
    DatePipe
  ],
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DatePipe]
})
export class DashboardComponent implements OnInit {
  private supabaseStateService = inject(SupabaseStateService);
  private cashierDataService = inject(CashierDataService);
  
  // Inject new state services
  private dashboardState = inject(DashboardStateService);
  private recipeState = inject(RecipeStateService);
  private posState = inject(PosStateService);
  private settingsState = inject(SettingsStateService);
  private hrState = inject(HrStateService);
  private inventoryState = inject(InventoryStateService);
  private router = inject(Router);
  
  // UI State
  editMode = signal(false);
  
  // Store the original order to reset if needed
  private originalStats: KpiStat[] = [];
  
  isLoading = computed(() => !this.supabaseStateService.isDataLoaded());

  // Chart state
  isChartLoading = signal(true);
  chartPeriod = signal<7 | 30>(7);
  salesCogsData = signal<DailySalesCogs[]>([]);
  
  isHourlyChartLoading = signal(true);
  hourlySalesData = signal<PeakHoursData[]>([]);

  constructor() {
    effect(() => {
        const period = this.chartPeriod();
        untracked(() => this.loadChartData(period));
    });
    
    // Store the initial order of stats
    this.originalStats = [...this.stats()];
  }

  ngOnInit() {
    this.loadHourlySalesData();
    this.loadLayout();
  }

  async loadChartData(days: 7 | 30) {
    this.isChartLoading.set(true);
    try {
      const data = await this.cashierDataService.getSalesAndCogsForPeriod(days);
      this.salesCogsData.set(data);
      this.updateStats();
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
  
  // Toggle edit mode for dashboard customization
  toggleEditMode() {
    this.editMode.update(mode => !mode);
    
    // Save layout when exiting edit mode
    if (!this.editMode()) {
      this.saveLayout();
    }
  }
  
  // Handle drop event for drag and drop
  drop(event: CdkDragDrop<KpiStat[]>) {
    if (event.previousIndex !== event.currentIndex) {
      const stats = [...this.stats()];
      moveItemInArray(stats, event.previousIndex, event.currentIndex);
      this.stats.set(stats);
    }
  }
  
  // Save layout to localStorage
  private saveLayout() {
    const layout = this.stats().map(stat => stat.label);
    localStorage.setItem('dashboardLayout', JSON.stringify(layout));
  }
  
  // Load layout from localStorage
  private loadLayout() {
    const savedLayout = localStorage.getItem('dashboardLayout');
    if (savedLayout) {
      try {
        const layoutOrder: string[] = JSON.parse(savedLayout);
        const currentStats = [...this.stats()];
        
        // Create a map for quick lookup
        const statMap = new Map(currentStats.map(stat => [stat.label, stat]));
        
        // Reorder stats based on saved layout
        const reorderedStats = layoutOrder
          .map(label => statMap.get(label))
          .filter((stat): stat is KpiStat => stat !== undefined);
          
        // Add any new stats that weren't in the saved layout
        const newStats = currentStats.filter(stat => !layoutOrder.includes(stat.label));
        
        this.stats.set([...reorderedStats, ...newStats]);
      } catch (e) {
        console.error('Failed to load dashboard layout', e);
      }
    }
  }
  
  // Navigation helper
  navigateTo(route: string) {
    this.router.navigate([route]);
  }
  
  // Get background color for KPI cards
  getBgColor(label: string): string {
    const colors: {[key: string]: string} = {
      'Vendas Totais (Hoje)': 'bg-blue-600',
      'Lucro Bruto (Hoje)': 'bg-green-600',
      'Ticket Médio (Hoje)': 'bg-purple-600',
      'Pedidos Totais (Hoje)': 'bg-yellow-600',
      'Pedidos iFood (Abertos)': 'bg-red-600',
      'Reservas (Hoje)': 'bg-pink-600'
    };
    return colors[label] || 'bg-gray-600';
  }
  
  // Update stats with latest values
  private updateStats() {
    this.stats.update(stats => stats.map(stat => {
      const value = this.getStatValue(stat.label);
      return { ...stat, value };
    }));
  }
  
  // Get value for a stat
  private getStatValue(label: string): string | number {
    switch(label) {
      case 'Vendas Totais (Hoje)':
        return this.totalSales().toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      case 'Lucro Bruto (Hoje)':
        return this.grossProfitToday().toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      case 'Ticket Médio (Hoje)':
        return this.averageTicketToday().toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      case 'Pedidos Totais (Hoje)':
        return this.totalOrdersToday().toString();
      case 'Pedidos iFood (Abertos)':
        return this.openIfoodOrders().toString();
      case 'Reservas (Hoje)':
        return this.reservationsToday().length.toString();
      default:
        return '';
    }
  }
  
  // Check if a stat has comparison data
  hasComparison(label: string): boolean {
    return [
      'Vendas Totais (Hoje)',
      'Lucro Bruto (Hoje)',
      'Ticket Médio (Hoje)',
      'Pedidos Totais (Hoje)'
    ].includes(label);
  }
  
  // Check if comparison is positive
  isPositiveComparison(label: string): boolean {
    // In a real app, this would use actual comparison data
    return Math.random() > 0.5;
  }
  
  // Get comparison text
  getComparisonText(label: string): string {
    const value = Math.floor(Math.random() * 20) + 1;
    return `${value}% em relação ao período anterior`;
  }
  
  // Get route for a stat
  getRouteForStat(label: string): string {
    const stat = this.stats().find(s => s.label === label);
    return stat ? stat.route : '/dashboard';
  }
  
  // Get employee sales percentage for progress bar
  getEmployeeSalesPercentage(sales: number): number {
    const maxSales = Math.max(1, ...(this.topEmployeesToday()?.map(e => e.sales) || [0]));
    return (sales / maxSales) * 100;
  }

  totalSales = computed(() => {
    return this.dashboardState.dashboardTransactions()
        .filter(t => t.type === 'Receita')
        .reduce((sum, item) => sum + item.amount, 0);
  });
  
  cogsToday = computed(() => {
    const recipeCosts = this.recipeState.recipeCosts();
    return this.dashboardState.dashboardCompletedOrders()
      .flatMap(o => o.order_items)
      .reduce((sum, item) => {
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
    return this.settingsState.reservations().filter(r => {
        const resDate = new Date(r.reservation_time).toISOString().split('T')[0];
        return resDate === todayStr && r.status === 'CONFIRMED';
    });
  });

  stats = signal<KpiStat[]>([
    { 
      label: 'Vendas Totais (Hoje)', 
      value: this.totalSales().toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 
      icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01',
      route: '/reports/sales'
    },
    { 
      label: 'Lucro Bruto (Hoje)', 
      value: this.grossProfitToday().toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 
      icon: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125-1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0z',
      route: '/reports/profit'
    },
    { 
      label: 'Ticket Médio (Hoje)', 
      value: this.averageTicketToday().toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 
      icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
      route: '/reports/performance'
    },
    { 
      label: 'Pedidos Totais (Hoje)', 
      value: this.totalOrdersToday().toString(), 
      icon: 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12',
      route: '/orders'
    },
    { 
      label: 'Pedidos iFood (Abertos)', 
      value: this.openIfoodOrders().toString(), 
      icon: 'M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125V14.25m-17.25 4.5v-1.875a3.375 3.375 0 013.375-3.375h1.5a1.125 1.125 0 011.125 1.125v1.5a3.375 3.375 0 00-3.375 3.375H3.375z',
      route: '/orders?source=ifood'
    },
    { 
      label: 'Reservas (Hoje)', 
      value: this.reservationsToday().length.toString(), 
      icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
      route: '/reservations'
    },
  ]);

  upcomingReservations = computed(() => {
    const now = new Date();
    return this.reservationsToday()
        .filter(r => new Date(r.reservation_time) > now)
        .sort((a, b) => new Date(a.reservation_time).getTime() - new Date(b.reservation_time).getTime())
        .slice(0, 5);
  });
  
  topEmployeesToday = computed(() => {
      const salesByEmployee = new Map<string, { name: string, sales: number }>();
      const employeeMap = new Map(this.hrState.employees().map(e => [e.id, e.name]));

      this.dashboardState.dashboardTransactions()
          .filter(t => t.type === 'Receita' && t.employee_id)
          .forEach(t => {
              const employeeId = t.employee_id!;
              // FIX: Explicitly type 'name' as string to resolve compiler type inference issue.
              const name: string = employeeMap.get(employeeId) || 'Desconhecido';
              const current = salesByEmployee.get(employeeId) || { name: name, sales: 0 };
              current.sales += t.amount;
              salesByEmployee.set(employeeId, current);
          });
      
      return Array.from(salesByEmployee.values())
          .sort((a, b) => b.sales - a.sales)
          .slice(0, 3);
  });

  lowStockItemsList = computed(() => 
    this.inventoryState.ingredients()
      .filter(i => i.stock < i.min_stock)
      .slice(0, 5)
  );

  employeesOnLeaveToday = computed(() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const todayStr = today.toISOString().split('T')[0];
    
    return this.hrState.leaveRequests()
      .filter(r => r.status === 'Aprovada' && r.start_date <= todayStr && r.end_date >= todayStr);
  });
}
