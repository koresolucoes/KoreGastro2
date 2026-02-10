
import { Component, ChangeDetectionStrategy, inject, signal, effect, input, InputSignal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CashierDataService, CancellationData } from '../../../services/cashier-data.service';

@Component({
  selector: 'app-cancellation-report',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cancellation-report.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CancellationReportComponent {
  private cashierDataService = inject(CashierDataService);

  startDate: InputSignal<string> = input.required<string>();
  endDate: InputSignal<string> = input.required<string>();

  isLoading = signal(true);
  reportData = signal<CancellationData[]>([]);

  totalLostValue = computed(() => this.reportData().reduce((sum, item) => sum + item.valueLost, 0));
  totalCancelledItems = computed(() => this.reportData().filter(i => i.type === 'ITEM').reduce((sum, item) => sum + item.quantity, 0));
  totalCancelledOrders = computed(() => this.reportData().filter(i => i.type === 'ORDER').length);

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
      const { data, error } = await this.cashierDataService.getCancellationReport(start, end);
      if (error) {
        console.error('Error loading cancellation report:', error);
        this.reportData.set([]);
      } else {
        this.reportData.set(data);
      }
    } catch (error) {
      console.error('Error loading cancellation data:', error);
      this.reportData.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  getTypeLabel(type: 'ITEM' | 'ORDER'): string {
      return type === 'ITEM' ? 'Item' : 'Pedido Completo';
  }
}
