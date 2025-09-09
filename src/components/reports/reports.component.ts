import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CashierDataService, ReportData } from '../../services/cashier-data.service';
import { NotificationService } from '../../services/notification.service';

type ReportType = 'sales' | 'items' | 'financial';

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
    reportType = signal<ReportType>('financial');

    // State
    isLoading = signal(false);
    generatedReport = signal<ReportData | null>(null);
    
    reportTitle = computed(() => {
        switch (this.reportType()) {
            case 'sales': return 'Relatório de Vendas';
            case 'items': return 'Relatório de Desempenho por Item';
            case 'financial': return 'Relatório Financeiro';
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

    async exportReportAsCsv() {
        if (!this.generatedReport()) {
            this.notificationService.show('Gere um relatório primeiro para poder exportar.', 'warning');
            return;
        }
        this.isLoading.set(true);
        try {
            const { data: transactions, error } = await this.cashierDataService.getTransactionsForPeriod(this.startDate(), this.endDate());
            if (error) throw error;

            if (!transactions || transactions.length === 0) {
                this.notificationService.show('Nenhuma transação encontrada no período para exportar.', 'info');
                return;
            }
            
            const csvHeader = ['Data', 'Hora', 'Descrição', 'Tipo', 'Valor'];
            const csvRows = transactions.map(t => {
                const date = new Date(t.date);
                const formattedDate = date.toLocaleDateString('pt-BR');
                const formattedTime = date.toLocaleTimeString('pt-BR');
                const value = t.type === 'Despesa' ? -t.amount : t.amount;
                const description = `"${t.description.replace(/"/g, '""')}"`; // Escape quotes
                return [formattedDate, formattedTime, description, t.type, value.toFixed(2).replace('.', ',')].join(';');
            });

            const csvContent = [csvHeader.join(';'), ...csvRows].join('\n');
            const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' }); // \uFEFF for BOM to handle special characters in Excel

            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `relatorio_contabil_${this.startDate()}_a_${this.endDate()}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            this.notificationService.show(`Erro ao exportar CSV: ${(err as Error).message}`, 'error');
        } finally {
            this.isLoading.set(false);
        }
    }
}