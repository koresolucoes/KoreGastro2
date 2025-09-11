import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, input, InputSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CashierDataService, ComparativeData } from '../../../services/cashier-data.service';

@Component({
  selector: 'app-comparative-report',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './comparative-report.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComparativeReportComponent {
  private cashierDataService = inject(CashierDataService);

  startDate: InputSignal<string> = input.required<string>();
  endDate: InputSignal<string> = input.required<string>();

  isLoading = signal(true);
  reportData = signal<ComparativeData | null>(null);

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
      const data = await this.cashierDataService.getSalesDataForComparativeReport(start, end);
      this.reportData.set(data);
    } catch (error) {
      console.error('Error loading comparative data:', error);
      this.reportData.set(null);
    } finally {
      this.isLoading.set(false);
    }
  }

  calculateChange(current: number, previous: number): number {
    if (previous === 0) {
      return current > 0 ? Infinity : 0;
    }
    return ((current - previous) / previous) * 100;
  }

  isPositiveChange(change: number): boolean {
    return change > 0;
  }

  salesChange = computed(() => {
    const data = this.reportData();
    if (!data) return 0;
    return this.calculateChange(data.current.totalSales, data.previous.totalSales);
  });

  ordersChange = computed(() => {
    const data = this.reportData();
    if (!data) return 0;
    return this.calculateChange(data.current.orderCount, data.previous.orderCount);
  });

  ticketChange = computed(() => {
    const data = this.reportData();
    if (!data) return 0;
    return this.calculateChange(data.current.averageTicket, data.previous.averageTicket);
  });
}
