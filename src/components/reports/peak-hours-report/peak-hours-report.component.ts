import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, input, InputSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CashierDataService, PeakHoursData, PeakDaysData } from '../../../services/cashier-data.service';

interface ChartData extends PeakHoursData {
  percentage: number;
}

interface DayOfWeekChartData extends PeakDaysData {
  percentage: number;
}

@Component({
  selector: 'app-peak-hours-report',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './peak-hours-report.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PeakHoursReportComponent {
  private cashierDataService = inject(CashierDataService);

  startDate: InputSignal<string> = input.required<string>();
  endDate: InputSignal<string> = input.required<string>();

  isLoading = signal(true);
  reportData = signal<PeakHoursData[]>([]);
  dayOfWeekData = signal<PeakDaysData[]>([]);

  constructor() {
    effect(() => {
      const start = this.startDate();
      const end = this.endDate();
      this.loadData(start, end);
    }, { allowSignalWrites: true });
  }

  async loadData(start: string, end: string) {
    if (!start || !end) return;
    this.isLoading.set(true);
    try {
      const [peakHours, peakDays] = await Promise.all([
        this.cashierDataService.getSalesByHourForPeriod(start, end),
        this.cashierDataService.getSalesByDayOfWeekForPeriod(start, end)
      ]);
      this.reportData.set(peakHours);
      this.dayOfWeekData.set(peakDays);
    } catch (error) {
      console.error('Error loading peak hours/days data:', error);
      this.reportData.set([]);
      this.dayOfWeekData.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  maxSales = computed(() => {
    const data = this.reportData();
    if (data.length === 0) return 0;
    return Math.max(...data.map(d => d.sales));
  });

  chartData = computed<ChartData[]>(() => {
    const data = this.reportData();
    const max = this.maxSales();
    if (max === 0) {
      return data.map(d => ({ ...d, percentage: 0 }));
    }
    return data.map(d => ({
      ...d,
      percentage: (d.sales / max) * 100,
    }));
  });

  maxSalesByDay = computed(() => {
    const data = this.dayOfWeekData();
    if (data.length === 0) return 0;
    return Math.max(...data.map(d => d.sales));
  });

  dayOfWeekChartData = computed<DayOfWeekChartData[]>(() => {
    const data = this.dayOfWeekData();
    const max = this.maxSalesByDay();
    if (max === 0) {
      return data.map(d => ({ ...d, percentage: 0 }));
    }
    return data.map(d => ({
      ...d,
      percentage: (d.sales / max) * 100,
    }));
  });
}