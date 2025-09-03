
import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Employee } from '../../models/db.models';
import { SupabaseStateService } from '../../services/supabase-state.service';

type ReportPeriod = 'day' | 'week' | 'month';

interface EmployeePerformance {
  employee: Employee;
  totalSales: number;
  totalTips: number;
  totalOrders: number;
  averageTicket: number;
  tipPercentage: number;
}

@Component({
  selector: 'app-performance',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './performance.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PerformanceComponent implements OnInit {
    private stateService = inject(SupabaseStateService);

    period = signal<ReportPeriod>('day');
    isLoading = signal(true);
    
    performanceTransactions = this.stateService.performanceTransactions;
    employees = this.stateService.employees;

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
            await this.stateService.fetchPerformanceDataForPeriod(startDate, endDate);
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
        const employeesMap = new Map(this.employees().map(e => [e.id, { 
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
}
