
import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RequisitionService, StationCostSummary } from '../../../services/requisition.service';

@Component({
  selector: 'app-requisition-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe, DecimalPipe],
  templateUrl: './requisition-reports.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe, DecimalPipe]
})
export class RequisitionReportsComponent {
  requisitionService = inject(RequisitionService);
  
  startDate = signal(new Date().toISOString().split('T')[0]);
  endDate = signal(new Date().toISOString().split('T')[0]);
  
  isLoading = signal(false);
  reportData = signal<StationCostSummary[]>([]);
  
  // Totals for header
  totalPeriodCost = signal(0);
  totalRequisitions = signal(0);

  constructor() {
      // Set to first day of current month by default
      const date = new Date();
      this.startDate.set(new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0]);
      
      effect(() => {
          this.loadReport();
      }, { allowSignalWrites: true });
  }

  async loadReport() {
      this.isLoading.set(true);
      const data = await this.requisitionService.getRequisitionStats(this.startDate(), this.endDate());
      this.reportData.set(data);
      
      this.totalPeriodCost.set(data.reduce((acc, curr) => acc + curr.totalCost, 0));
      this.totalRequisitions.set(data.reduce((acc, curr) => acc + curr.requisitionCount, 0));
      
      this.isLoading.set(false);
  }
  
  getHighestCostStation(): string {
      if (this.reportData().length === 0) return '---';
      return this.reportData()[0].stationName;
  }

  exportCsv() {
      const data = this.reportData();
      if (data.length === 0) return;

      const headers = ['Estação', 'Custo Total', 'Qtd. Requisições', '% do Total'];
      const rows = data.map(d => [
          `"${d.stationName}"`,
          d.totalCost.toFixed(2),
          d.requisitionCount,
          d.percentage.toFixed(2) + '%'
      ]);

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `custos_setoriais_${this.startDate()}_${this.endDate()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  }
}
