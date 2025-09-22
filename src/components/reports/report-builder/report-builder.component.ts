import { Component, ChangeDetectionStrategy, inject, signal, computed, input, InputSignal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CashierDataService, CustomReportConfig, CustomReportData } from '../../../services/cashier-data.service';
// FIX: Import HrStateService to access employee data
import { HrStateService } from '../../../services/hr-state.service';
import { NotificationService } from '../../../services/notification.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-report-builder',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './report-builder.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportBuilderComponent {
  private cashierDataService = inject(CashierDataService);
  // FIX: Inject HrStateService
  private hrState = inject(HrStateService);
  private notificationService = inject(NotificationService);

  startDate: InputSignal<string> = input.required<string>();
  endDate: InputSignal<string> = input.required<string>();

  isLoading = signal(false);
  generatedReport = signal<CustomReportData | null>(null);

  config = signal<CustomReportConfig>({
    dataSource: 'transactions',
    columns: new Set(['date', 'description', 'amount', 'type']),
    filters: {
        employeeId: 'all'
    },
    groupBy: 'none'
  });
  
  // Use a separate signal for the date range from inputs to avoid direct binding to the config
  filterStartDate = signal('');
  filterEndDate = signal('');

  // FIX: Access employees from the correct state service
  employees = this.hrState.employees;
  
  availableColumns = computed(() => {
    switch(this.config().dataSource) {
        case 'transactions':
            return [
                { key: 'date', label: 'Data' },
                { key: 'description', label: 'Descrição' },
                { key: 'amount', label: 'Valor' },
                { key: 'type', label: 'Tipo' },
                { key: 'employeeName', label: 'Funcionário' }
            ];
        // Add more data sources here in the future
        default:
            return [];
    }
  });

  availableGroupByOptions = computed(() => {
    switch(this.config().dataSource) {
        case 'transactions':
            return [
                { key: 'none', label: 'Nenhum' },
                { key: 'day', label: 'Dia' },
                { key: 'type', label: 'Tipo de Transação' },
                { key: 'employee', label: 'Funcionário' }
            ];
        default:
            return [{ key: 'none', label: 'Nenhum' }];
    }
  });

  constructor() {
    effect(() => {
        this.filterStartDate.set(this.startDate());
        this.filterEndDate.set(this.endDate());
    });
  }

  toggleColumn(key: string) {
    this.config.update(c => {
        const newColumns = new Set(c.columns);
        if (newColumns.has(key)) {
            newColumns.delete(key);
        } else {
            newColumns.add(key);
        }
        return { ...c, columns: newColumns };
    });
  }

  setGroupBy(key: string) {
    this.config.update(c => ({...c, groupBy: key}));
  }

  setFilter(key: 'employeeId', value: string) {
    this.config.update(c => ({
        ...c,
        filters: {
            ...c.filters,
            [key]: value
        }
    }));
  }

  async generateReport() {
    this.isLoading.set(true);
    this.generatedReport.set(null);
    try {
        const reportConfig = this.config();
        const data = await this.cashierDataService.buildCustomReport({
            ...reportConfig,
            filters: {
                ...reportConfig.filters,
                startDate: this.filterStartDate(),
                endDate: this.filterEndDate()
            }
        });
        this.generatedReport.set(data);
    } catch (error) {
        this.notificationService.show(`Erro ao gerar relatório: ${(error as Error).message}`, 'error');
    } finally {
        this.isLoading.set(false);
    }
  }

  exportToCsv() {
    const report = this.generatedReport();
    if (!report) return;

    const headers = report.headers.map(h => h.label);
    const rows = report.rows.map(row => 
      report.headers.map(header => {
        let value = row[header.key];
        // Format numbers for CSV (using comma as decimal separator)
        if (typeof value === 'number') {
          return value.toFixed(2).replace('.', ',');
        }
        // Escape quotes and wrap in quotes if necessary
        value = String(value ?? '').replace(/"/g, '""');
        return `"${value}"`;
      }).join(';')
    );

    const csvContent = [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio_personalizado.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  printReport() {
      window.print();
  }
}
