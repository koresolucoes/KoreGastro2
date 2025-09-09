import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, input, output, InputSignal, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Employee, TimeClockEntry, Transaction } from '../../../models/db.models';
import { TimeClockService } from '../../../services/time-clock.service';
import { supabase } from '../../../services/supabase-client';
import { AuthService } from '../../../services/auth.service';

interface EmployeeStats {
  totalSales: number;
  totalTips: number;
  averageTicket: number;
  totalOrders: number;
  workedHours: number;
  overtimeHours: number; // Placeholder for future logic
  recentEntries: TimeClockEntry[];
  dailyHoursChartData: { label: string; hours: number; percentage: number }[];
}

@Component({
  selector: 'app-employee-details-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './employee-details-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmployeeDetailsModalComponent {
  employee: InputSignal<Employee> = input.required<Employee>();
  close: OutputEmitterRef<void> = output<void>();

  private timeClockService = inject(TimeClockService);
  private authService = inject(AuthService);

  activeTab = signal<'performance' | 'details'>('performance');
  period = signal<'7d' | '30d'>('7d');
  isLoading = signal(true);
  stats = signal<EmployeeStats | null>(null);

  constructor() {
    effect(() => {
      const emp = this.employee();
      const p = this.period();
      this.loadEmployeeStats(emp.id, p);
    }, { allowSignalWrites: true });
  }

  private async loadEmployeeStats(employeeId: string, period: '7d' | '30d') {
    this.isLoading.set(true);
    const days = period === '7d' ? 7 : 30;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const userId = this.authService.currentUser()?.id;
    if (!userId) {
        this.isLoading.set(false);
        return;
    }

    const [timeEntriesRes, transactionsRes] = await Promise.all([
      this.timeClockService.getEntriesForPeriod(startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0], employeeId),
      supabase.from('transactions').select('*').eq('user_id', userId).eq('employee_id', employeeId).gte('date', startDate.toISOString())
    ]);

    const timeEntries = timeEntriesRes.data || [];
    const transactions = transactionsRes.data || [];

    // --- Process Data ---
    const totalSales = transactions.filter(t => t.type === 'Receita').reduce((sum, t) => sum + t.amount, 0);
    const totalTips = transactions.filter(t => t.type === 'Gorjeta').reduce((sum, t) => sum + t.amount, 0);
    const orderIds = new Set(transactions.filter(t => t.type === 'Receita').map(t => t.description.match(/#(\S+)/)?.[1]).filter(Boolean));
    const totalOrders = orderIds.size;
    const averageTicket = totalOrders > 0 ? totalSales / totalOrders : 0;

    const totalWorkedMs = timeEntries.reduce((sum, entry) => sum + this.calculateDurationInMs(entry), 0);
    const workedHours = totalWorkedMs / (1000 * 60 * 60);

    const dailyHours = this.calculateDailyHours(timeEntries, 7);
    const maxHours = Math.max(...dailyHours.map(d => d.hours), 8); // Ensure a baseline height for the chart
    const dailyHoursChartData = dailyHours.map(d => ({
        ...d,
        percentage: maxHours > 0 ? (d.hours / maxHours) * 100 : 0
    })).reverse();


    this.stats.set({
      totalSales,
      totalTips,
      averageTicket,
      totalOrders,
      workedHours,
      overtimeHours: 0, // Simplified for now
      recentEntries: timeEntries.slice(0, 5),
      dailyHoursChartData
    });

    this.isLoading.set(false);
  }

  private calculateDailyHours(entries: TimeClockEntry[], days: number): { label: string; hours: number }[] {
    const dailyMap = new Map<string, number>();
    const labels: string[] = [];
    const today = new Date();

    for (let i = 0; i < days; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateString = date.toISOString().split('T')[0];
        const dayLabel = date.toLocaleDateString('pt-BR', { weekday: 'short' });
        dailyMap.set(dateString, 0);
        labels.push(dayLabel);
    }
    
    for (const entry of entries) {
        const dateString = new Date(entry.clock_in_time).toISOString().split('T')[0];
        if (dailyMap.has(dateString)) {
            const durationMs = this.calculateDurationInMs(entry);
            dailyMap.set(dateString, (dailyMap.get(dateString) || 0) + durationMs);
        }
    }

    return Array.from(dailyMap.entries()).map(([date, ms]) => ({
        label: new Date(date + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3) + '.',
        hours: ms / (1000 * 60 * 60)
    }));
  }


  private calculateDurationInMs(entry: TimeClockEntry): number {
    if (!entry.clock_out_time) return 0;
    const start = new Date(entry.clock_in_time).getTime();
    const end = new Date(entry.clock_out_time).getTime();
    const totalDuration = end > start ? end - start : 0;
    let breakDuration = 0;
    if (entry.break_start_time && entry.break_end_time) {
      const breakStart = new Date(entry.break_start_time).getTime();
      const breakEnd = new Date(entry.break_end_time).getTime();
      if (breakEnd > breakStart) breakDuration = breakEnd - breakStart;
    }
    return Math.max(0, totalDuration - breakDuration);
  }

  getFormattedDuration(entry: TimeClockEntry): string {
    if (!entry.clock_out_time) return 'Em andamento';
    const durationMs = this.calculateDurationInMs(entry);
    if (durationMs <= 0) return '00:00';

    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
  }

}
