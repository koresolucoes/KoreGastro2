import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CashierDataService, ReportData } from '../../services/cashier-data.service';
import { NotificationService } from '../../services/notification.service';

type ReportType = 'sales' | 'items';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './reports.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsComponent implements OnInit {
    private cashierDataService = inject(CashierDataService);
    private notificationService = inject(NotificationService);

    // Form inputs
    startDate = signal('');
    endDate = signal('');
    reportType = signal<ReportType>('sales');

    // State
    isLoading = signal(false);
    generatedReport = signal<ReportData | null>(null);
    
    reportTitle = computed(() => {
        switch (this.reportType()) {
            case 'sales': return 'Relatório de Vendas';
            case 'items': return 'Relatório de Itens Mais Vendidos';
            default: return 'Relatório';
        }
    });

    ngOnInit() {
        const today = new Date().toISOString().split('T')[0];
        this.startDate.set(today);
        this.endDate.set(today);
    }

    async generateReport() {
        if (!this.startDate() || !this.endDate()) {
            await this.notificationService.alert('Por favor, selecione as datas de início e fim.');
            return;
        }
        this.isLoading.set(true);
        this.generatedReport.set(null);
        try {
            const data = await this.cashierDataService.generateReportData(this.startDate(), this.endDate(), this.reportType());
            this.generatedReport.set(data);
        } catch (error) {
            console.error("Error generating report", error);
            await this.notificationService.alert(`Falha ao gerar o relatório: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
        } finally {
            this.isLoading.set(false);
        }
    }
    
    printReport() {
        window.print();
    }
}