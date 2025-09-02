
import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Employee, Transaction } from '../../models/db.models';
import { SupabaseStateService } from '../../services/supabase-state.service';

type ReportPeriod = 'day' | 'week' | 'month';

interface EmployeePerformance {
  employee: Employee;
  totalTips: number;
  tipCount: number;
  averageTip: number;
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
    
    tipTransactions = this.stateService.performanceTipTransactions;
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
                const dayOfWeek = now.getDay();
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
    
    totalTips = computed(() => {
        return this.tipTransactions().reduce((sum, t) => sum + t.amount, 0);
    });
    
    employeePerformance = computed(() => {
        const tips = this.tipTransactions();
        const employeesMap = new Map(this.employees().map(e => [e.id, { ...e, totalTips: 0, tipCount: 0 }]));

        for (const tip of tips) {
            if (tip.employee_id && employeesMap.has(tip.employee_id)) {
                const employeeData = employeesMap.get(tip.employee_id)!;
                employeeData.totalTips += tip.amount;
                employeeData.tipCount += 1;
            }
        }
        
        const performanceData: EmployeePerformance[] = [];
        employeesMap.forEach((data, id) => {
            if (data.tipCount > 0) {
                performanceData.push({
                    employee: this.employees().find(e => e.id === id)!,
                    totalTips: data.totalTips,
                    tipCount: data.tipCount,
                    averageTip: data.totalTips / data.tipCount,
                });
            }
        });
        
        return performanceData.sort((a, b) => b.totalTips - a.totalTips);
    });

    stats = computed(() => [
      { label: 'Total de Gorjetas', value: this.totalTips(), isCurrency: true },
      { label: 'Gorjetas Distribuídas', value: this.tipTransactions().length, isCurrency: false },
      { label: 'Funcionários com Gorjeta', value: this.employeePerformance().length, isCurrency: false },
    ]);
}