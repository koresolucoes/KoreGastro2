import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Employee, Order, ProductionPlan } from '../../models/db.models';
import { DashboardStateService } from '../../services/dashboard-state.service';
import { HrStateService } from '../../services/hr-state.service';
import { PosStateService } from '../../services/pos-state.service';
import { SupabaseStateService } from '../../services/supabase-state.service'; // Keep for fetch trigger

type ReportPeriod = 'day' | 'week' | 'month';
type PerformanceView = 'sales' | 'kitchen';

interface EmployeePerformance {
  employee: Employee;
  totalSales: number;
  totalTips: number;
  totalOrders: number;
  averageTicket: number;
  tipPercentage: number;
}

interface EmployeePerfData {
  employee: Employee;
  totalSales: number;
  totalTips: number;
  attendedOrderIds: Set<string>;
}

interface MiseEnPlacePerfData {
  employee: Employee;
  completedTasks: number;
}


@Component({
  selector: 'app-performance',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './performance.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PerformanceComponent implements OnInit {
    private supabaseStateService = inject(SupabaseStateService);
    private dashboardState = inject(DashboardStateService);
    private hrState = inject(HrStateService);
    private posState = inject(PosStateService);

    period = signal<ReportPeriod>('day');
    performanceView = signal<PerformanceView>('sales');
    isLoading = signal(true);
    
    performanceTransactions = this.dashboardState.performanceTransactions;
    employees = this.hrState.employees;
    performanceProductionPlans = this.dashboardState.performanceProductionPlans;
    performanceCompletedOrders = this.dashboardState.performanceCompletedOrders;

    ngOnInit() {
        this.loadData();
    }
    
    async setPeriod(newPeriod: ReportPeriod) {
        this.period.set(newPeriod);
        await this.loadData();
    }
    
    private async loadData() {
        this.isLoading.set(true);
        try {
            const { startDate, endDate } = this.getDateRange();
            await this.supabaseStateService.fetchPerformanceDataForPeriod(startDate, endDate);
        } catch (error) {
            console.error("Error loading performance data", error);
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
                const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // Monday=0, Sunday=6
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
    
    formatTime(seconds: number): string {
      if (isNaN(seconds) || seconds < 0) return '00:00';
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    totalSales = computed(() => {
        return this.performanceTransactions()
            .filter(t => t.type === 'Receita')
            .reduce((sum, t) => sum + t.amount, 0);
    });
    
    totalTips = computed(() => {
        return this.performanceTransactions()
            .filter(t => t.type === 'Gorjeta')
            .reduce((sum, t) => sum + t.amount, 0);
    });

    totalOrders = computed(() => {
        const orderIdRegex = /#([a-f0-9-]+)/;
        const orderIds = new Set<string>();
        this.performanceTransactions().forEach(t => {
            const match = t.description.match(orderIdRegex);
            if (match) {
                orderIds.add(match[1]);
            }
        });
        return orderIds.size;
    });
    
    employeePerformance = computed((): EmployeePerformance[] => {
        const employeesMap = new Map<string, EmployeePerfData>(this.employees().map(e => [e.id, { 
            employee: e,
            totalSales: 0,
            totalTips: 0,
            attendedOrderIds: new Set<string>(),
        }]));

        const orderIdRegex = /#([a-f0-9-]+)/;

        for (const transaction of this.performanceTransactions()) {
            if (transaction.employee_id && employeesMap.has(transaction.employee_id)) {
                const employeeData = employeesMap.get(transaction.employee_id)!;
                
                if (transaction.type === 'Receita') {
                    employeeData.totalSales += transaction.amount;
                    const match = transaction.description.match(orderIdRegex);
                    if (match) {
                        employeeData.attendedOrderIds.add(match[1]);
                    }
                } else if (transaction.type === 'Gorjeta') {
                    employeeData.totalTips += transaction.amount;
                }
            }
        }
        
        const performanceData: EmployeePerformance[] = [];
        employeesMap.forEach(data => {
            if (data.totalSales > 0 || data.totalTips > 0) {
                performanceData.push({
                    employee: data.employee,
                    totalSales: data.totalSales,
                    totalTips: data.totalTips,
                    totalOrders: data.attendedOrderIds.size,
                    averageTicket: data.attendedOrderIds.size > 0 ? data.totalSales / data.attendedOrderIds.size : 0,
                    tipPercentage: data.totalSales > 0 ? (data.totalTips / data.totalSales) * 100 : 0,
                });
            }
        });
        
        return performanceData.sort((a, b) => b.totalSales - a.totalSales);
    });

    topPerformersBySales = computed(() => this.employeePerformance().slice(0, 5));
    
    maxSales = computed(() => {
        const top = this.topPerformersBySales();
        if (top.length === 0) return 0;
        return Math.max(...top.map(p => p.totalSales));
    });

    stats = computed(() => [
      { label: 'Vendas Totais', value: this.totalSales(), isCurrency: true },
      { label: 'Total de Gorjetas', value: this.totalTips(), isCurrency: true },
      { label: 'Pedidos Atendidos', value: this.totalOrders(), isCurrency: false },
    ]);
    
    // --- Kitchen Performance Computeds ---
    kitchenStats = computed(() => [
        { label: 'Tarefas de Mise en Place Concluídas', value: this.totalMiseEnPlaceTasksCompleted() },
        { label: 'Tempo Médio de Preparo', value: this.formatTime(this.averagePrepTime()) },
        { label: 'Itens Preparados no Período', value: this.performanceCompletedOrders().flatMap(o => o.order_items).length },
    ]);

    miseEnPlacePerformance = computed((): { employee: Employee, completedTasks: number }[] => {
      const employeesMap = new Map<string, MiseEnPlacePerfData>(this.employees().map(e => [e.id, { employee: e, completedTasks: 0 }]));
      const tasks = this.performanceProductionPlans().flatMap(plan => plan.production_tasks || []);
      for (const task of tasks) {
        if (task.status === 'Concluído' && task.employee_id && employeesMap.has(task.employee_id)) {
          employeesMap.get(task.employee_id)!.completedTasks++;
        }
      }
      return Array.from(employeesMap.values())
        .filter(data => data.completedTasks > 0)
        .sort((a, b) => b.completedTasks - a.completedTasks);
    });

    totalMiseEnPlaceTasksCompleted = computed(() => {
      return this.performanceProductionPlans()
        .flatMap(p => p.production_tasks || [])
        .filter(t => t.status === 'Concluído').length;
    });

    maxTasksCompleted = computed(() => {
      const performers = this.miseEnPlacePerformance();
      if (performers.length === 0) return 0;
      return Math.max(...performers.map(p => p.completedTasks));
    });

    stationPerformance = computed(() => {
      const stationsMap = new Map<string, { name: string, totalPrepTime: number, itemCount: number }>();
      const allStations = this.posState.stations();
      allStations.forEach(s => stationsMap.set(s.id, { name: s.name, totalPrepTime: 0, itemCount: 0 }));

      const items = this.performanceCompletedOrders().flatMap(o => o.order_items || []);

      for (const item of items) {
        const timestamps = item.status_timestamps;
        if (timestamps && (timestamps['PRONTO']) && (timestamps['EM_PREPARO'] || timestamps['PENDENTE'])) {
          const start = new Date(timestamps['EM_PREPARO'] || timestamps['PENDENTE']).getTime();
          const end = new Date(timestamps['PRONTO']).getTime();
          const prepTime = (end - start) / 1000; // in seconds

          if (prepTime > 0 && item.station_id && stationsMap.has(item.station_id)) {
            const stationData = stationsMap.get(item.station_id)!;
            stationData.totalPrepTime += prepTime;
            stationData.itemCount++;
          }
        }
      }

      return Array.from(stationsMap.values())
        .filter(s => s.itemCount > 0)
        .map(s => ({
          ...s,
          averagePrepTime: s.totalPrepTime / s.itemCount
        }))
        .sort((a, b) => a.averagePrepTime - b.averagePrepTime);
    });

    averagePrepTime = computed(() => {
      const items = this.performanceCompletedOrders().flatMap(o => o.order_items || []);
      let totalTime = 0;
      let count = 0;
      for (const item of items) {
        const timestamps = item.status_timestamps;
        if (timestamps && (timestamps['PRONTO']) && (timestamps['EM_PREPARO'] || timestamps['PENDENTE'])) {
          const start = new Date(timestamps['EM_PREPARO'] || timestamps['PENDENTE']).getTime();
          const end = new Date(timestamps['PRONTO']).getTime();
          const prepTime = (end - start) / 1000;
          if (prepTime > 0) {
            totalTime += prepTime;
            count++;
          }
        }
      }
      return count > 0 ? totalTime / count : 0;
    });
}
