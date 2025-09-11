import { Injectable, inject, LOCALE_ID } from '@angular/core';
import { Order, OrderItem, Station } from '../models/db.models';
import { DatePipe, CurrencyPipe, DecimalPipe } from '@angular/common';
import { CashierClosing } from '../models/db.models';
import { NotificationService } from './notification.service';

interface PreBillOptions {
  includeServiceFee: boolean;
  splitBy: number;
  total: number;
}

@Injectable({
  providedIn: 'root',
})
export class PrintingService {
  private datePipe: DatePipe;
  private currencyPipe: CurrencyPipe;
  private decimalPipe: DecimalPipe;
  private notificationService = inject(NotificationService);

  constructor() {
    const locale = inject(LOCALE_ID);
    this.datePipe = new DatePipe(locale);
    this.currencyPipe = new CurrencyPipe(locale);
    this.decimalPipe = new DecimalPipe(locale);
  }

  /**
   * Immediately triggers the print dialog for an order.
   * Used for manual printing.
   * @param order The order to print.
   * @param items The specific items from the order to print.
   * @param station The destination station for the print job.
   */
  async printOrder(order: Order, items: OrderItem[], station: Station) {
    if (!order || items.length === 0) return;

    const printWindow = window.open('', '_blank', 'width=300,height=500');
    if (!printWindow) {
      this.notificationService.show('Por favor, habilite pop-ups para imprimir.', 'warning');
      return;
    }
    
    const title = `Comanda - Estação: ${station.name}`;
    printWindow.document.title = title;

    const ticketHtml = this.generateTicketHtml(order, items, station);
    printWindow.document.write(ticketHtml);
    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250); // Timeout allows content to render
  }

  async printPreBill(order: Order, options: PreBillOptions) {
    const printWindow = window.open('', '_blank', 'width=300,height=500');
    if (!printWindow) {
      this.notificationService.show('Por favor, habilite pop-ups para imprimir.', 'warning');
      return;
    }
    printWindow.document.title = `Pré-conta - Mesa #${order.table_number}`;
    const receiptHtml = this.generatePreBillHtml(order, options);
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  }

  async printCustomerReceipt(order: Order, payments: {method: string, amount: number}[]) {
    const printWindow = window.open('', '_blank', 'width=300,height=500');
    if (!printWindow) {
        this.notificationService.show('Por favor, habilite pop-ups para imprimir.', 'warning');
        return;
    }
    printWindow.document.title = `Recibo - Pedido #${order.id.slice(0, 8)}`;
    const receiptHtml = this.generateReceiptHtml(order, payments);
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 250);
  }

  async printCashierClosingReport(closingData: CashierClosing, expenseTransactions: any[]) {
      const printWindow = window.open('', '_blank', 'width=300,height=500');
      if (!printWindow) {
          this.notificationService.show('Por favor, habilite pop-ups para imprimir.', 'warning');
          return;
      }
      printWindow.document.title = `Fechamento de Caixa - ${this.datePipe.transform(closingData.closed_at, 'short')}`;
      const reportHtml = this.generateClosingReportHtml(closingData, expenseTransactions);
      printWindow.document.write(reportHtml);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
          printWindow.print();
          printWindow.close();
      }, 250);
  }

  async printPayslip(payslipHtml: string, employeeName: string) {
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      this.notificationService.show('Por favor, habilite pop-ups para imprimir.', 'warning');
      return;
    }
    const title = `Contracheque - ${employeeName}`;
    printWindow.document.title = title;
    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            body { 
              font-family: sans-serif;
              color: #000;
              background-color: #fff;
            }
            @media print {
              @page { 
                size: A4;
                margin: 20mm; 
              }
              body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
               .payslip-printable-area * {
                color: #000 !important;
                background-color: transparent !important;
                border-color: #ccc !important;
                box-shadow: none !important;
              }

              .payslip-printable-area table {
                  width: 100%;
                  border-collapse: collapse;
              }
              .payslip-printable-area th, .payslip-printable-area td {
                  border: 1px solid #ccc !important;
                  padding: 6px;
              }
              .payslip-printable-area thead {
                  background-color: #f2f2f2 !important;
              }
              
              .payslip-container {
                page-break-inside: avoid; 
                margin-bottom: 2rem;
              }
            }
          </style>
        </head>
        <body class="bg-white">
          ${payslipHtml}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    
    // Timeout is crucial to allow styles (especially from CDN) to load and apply
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500); 
  }


  private generateTicketHtml(order: Order, items: OrderItem[], station: Station): string {
    const formattedTimestamp = this.datePipe.transform(new Date(), 'dd/MM/yyyy HH:mm:ss');
    const orderId = order.id.substring(0, 8).toUpperCase();
    const headerText = order.table_number === 0 ? 'Caixa' : `Mesa ${order.table_number}`;
    
    let itemsHtml = items.map(item => {
        const notesHtml = item.notes ? `<p style="font-style: italic; margin-left: 15px;"> -> ${item.notes}</p>` : '';
        const itemName = item.name.includes('(') ? item.name.split('(')[0].trim() : item.name;
        const prepName = item.name.includes('(') ? `<div style="font-size: 10px; margin-left: 15px;">(${item.name.split('(')[1].replace(')','')})</div>` : '';

        return `
            <div style="margin-bottom: 8px;">
                <div style="font-weight: bold; font-size: 14px;">
                    <span>${item.quantity}x</span>
                    <span style="margin-left: 5px;">${itemName}</span>
                </div>
                ${prepName}
                ${notesHtml}
            </div>
        `;
    }).join('');

    return `
      <html>
        <head>
          <title>Comanda - Estação: ${station.name}</title>
          <style>
            body { 
              font-family: 'Courier New', Courier, monospace;
              width: 280px; 
              font-size: 12px;
              line-height: 1.4;
              color: #000;
              margin: 0;
              padding: 10px;
            }
            .header {
              font-size: 20px;
              font-weight: bold;
              text-align: center;
              margin-bottom: 5px;
            }
             .station {
              font-size: 16px;
              font-weight: bold;
              text-align: center;
              margin-bottom: 10px;
              text-transform: uppercase;
            }
            .info {
              font-size: 12px;
              border-bottom: 1px dashed #000;
              padding-bottom: 5px;
              margin-bottom: 10px;
              display: flex;
              justify-content: space-between;
            }
            .items { margin-top: 10px; }
            @media print {
              @page { margin: 0; }
              body { margin: 0.5cm; }
            }
          </style>
        </head>
        <body>
          <div class="header">${headerText}</div>
          <div class="station">${station.name}</div>
          <div class="info">
            <span>Pedido: #${orderId}</span>
            <span>${formattedTimestamp}</span>
          </div>
          <div class="items">${itemsHtml}</div>
        </body>
      </html>
    `;
  }

  private generatePreBillHtml(order: Order, options: PreBillOptions): string {
    const date = this.datePipe.transform(new Date(), 'dd/MM/yyyy HH:mm');
    const subtotal = order.order_items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const serviceFee = options.includeServiceFee ? subtotal * 0.1 : 0;
    const total = subtotal + serviceFee;

    const itemsHtml = order.order_items
        .filter(item => item.price > 0)
        .map(item => `
        <tr>
            <td style="vertical-align: top;">${item.quantity}x</td>
            <td>${item.name}</td>
            <td style="text-align: right; vertical-align: top;">${this.decimalPipe.transform(item.price * item.quantity, '1.2-2')}</td>
        </tr>
    `).join('');

    let splitHtml = '';
    if (options.splitBy > 1) {
        splitHtml = `
            <div class="divider"></div>
            <div style="text-align: center; font-weight: bold; margin: 5px 0;">
                Valor por Pessoa (${options.splitBy})
            </div>
            <div class="total-row" style="display: flex; justify-content: space-between;">
                <span>TOTAL POR PESSOA</span>
                <span>${this.currencyPipe.transform(total / options.splitBy, 'BRL', 'R$')}</span>
            </div>
        `;
    }

    return `
      <html>
        <head>
          <title>Pré-conta - Mesa #${order.table_number}</title>
           <style>
            body { font-family: 'Courier New', monospace; width: 280px; font-size: 12px; color: #000; margin: 0; padding: 10px; }
            .center { text-align: center; }
            .header { font-size: 16px; font-weight: bold; }
            .divider { border-top: 1px dashed #000; margin: 5px 0; }
            table { width: 100%; border-collapse: collapse; }
            td { padding: 2px 0; }
            .total-row { font-weight: bold; font-size: 14px; }
            .info-text { font-size: 10px; text-align: center; margin-top: 10px; }
            @media print {
              @page { margin: 0; }
              body { margin: 0.5cm; }
            }
          </style>
        </head>
        <body>
          <div class="center header"><span>Chef</span><span style="color: #1e40af;">OS</span></div>
          <div class="center">CONFERÊNCIA DE CONTA</div>
          <div class="divider"></div>
          <div>Data: ${date}</div>
          <div>Mesa: ${order.table_number}</div>
          <div class="divider"></div>
          <table>
              <thead>
                  <tr>
                      <th style="text-align: left;">Qtd</th>
                      <th style="text-align: left;">Item</th>
                      <th style="text-align: right;">Total</th>
                  </tr>
              </thead>
              <tbody>${itemsHtml}</tbody>
          </table>
          <div class="divider"></div>
          <table>
            <tr>
              <td colspan="2">Subtotal</td>
              <td style="text-align: right;">${this.currencyPipe.transform(subtotal, 'BRL', 'R$', '1.2-2')}</td>
            </tr>
             <tr>
              <td colspan="2">Serviço (10%)</td>
              <td style="text-align: right;">${options.includeServiceFee ? this.currencyPipe.transform(serviceFee, 'BRL', 'R$', '1.2-2') : 'Opcional'}</td>
            </tr>
            <tr class="total-row">
              <td colspan="2">TOTAL</td>
              <td style="text-align: right;">${this.currencyPipe.transform(total, 'BRL', 'R$', '1.2-2')}</td>
            </tr>
          </table>
          ${splitHtml}
          <div class="divider"></div>
          <div class="info-text">Este não é um documento fiscal. Solicite o cupom fiscal no caixa.</div>
        </body>
      </html>
    `;
  }

  private generateReceiptHtml(order: Order, payments: {method: string, amount: number}[]): string {
    const date = this.datePipe.transform(order.completed_at || order.timestamp, 'dd/MM/yyyy HH:mm');
    const total = order.order_items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const orderOrigin = order.order_type === 'QuickSale' ? 'Balcão' : `Mesa ${order.table_number}`;

    const itemsHtml = order.order_items
        .filter(item => item.price > 0)
        .map(item => `
        <tr>
            <td style="vertical-align: top;">${item.quantity}x</td>
            <td>${item.name}</td>
            <td style="text-align: right; vertical-align: top;">${this.decimalPipe.transform(item.price * item.quantity, '1.2-2')}</td>
        </tr>
    `).join('');

    const paymentsHtml = payments.map(p => `
      <div style="display: flex; justify-content: space-between;">
        <span>${p.method}</span>
        <span>${this.currencyPipe.transform(p.amount, 'BRL', 'R$', '1.2-2')}</span>
      </div>
    `).join('');

    return `
      <html>
        <head>
          <title>Recibo - Pedido #${order.id.slice(0, 8)}</title>
          <style>
            body { font-family: 'Courier New', monospace; width: 280px; font-size: 12px; color: #000; margin: 0; padding: 10px; }
            .center { text-align: center; }
            .header { font-size: 16px; font-weight: bold; }
            .divider { border-top: 1px dashed #000; margin: 5px 0; }
            table { width: 100%; border-collapse: collapse; }
            td { padding: 2px 0; }
            .total-row { font-weight: bold; font-size: 14px; }
            .payments { margin-top: 10px; padding-top: 5px; border-top: 1px dashed #000; }
            @media print {
              @page { margin: 0; }
              body { margin: 0.5cm; }
            }
          </style>
        </head>
        <body>
          <div class="center header"><span>Chef</span><span style="color: #1e40af;">OS</span></div>
          <div class="center">Cumpom Não Fiscal</div>
          <div class="divider"></div>
          <div>Pedido: #${order.id.slice(0, 8)}</div>
          <div>Data: ${date}</div>
          <div>Origem: ${orderOrigin}</div>
          <div class="divider"></div>
          <table>
              <thead>
                  <tr>
                      <th style="text-align: left;">Qtd</th>
                      <th style="text-align: left;">Item</th>
                      <th style="text-align: right;">Total</th>
                  </tr>
              </thead>
              <tbody>${itemsHtml}</tbody>
          </table>
          <div class="divider"></div>
          <table>
            <tr class="total-row">
              <td colspan="2">TOTAL</td>
              <td style="text-align: right;">${this.currencyPipe.transform(total, 'BRL', 'R$', '1.2-2')}</td>
            </tr>
          </table>
          <div class="payments">
            <div style="font-weight: bold; margin-bottom: 5px;">Pagamento:</div>
            ${paymentsHtml}
          </div>
          <div class="divider"></div>
          <div class="center" style="margin-top: 10px;">Obrigado pela preferência!</div>
        </body>
      </html>
    `;
  }

  private generateClosingReportHtml(closing: CashierClosing, expenses: any[]): string {
    const f = (n: number) => this.currencyPipe.transform(n, 'BRL', 'R$');
    const closedAt = this.datePipe.transform(closing.closed_at, 'dd/MM/yyyy HH:mm:ss');

    const paymentSummaryHtml = closing.payment_summary.map((p: any) => `
      <div class="line"><span>${p.method}</span><span>${f(p.total)}</span></div>
    `).join('');

    const expensesHtml = expenses.map(e => `
        <div class="line"><span>${e.description}</span><span>-${f(e.amount)}</span></div>
    `).join('');

    return `
      <html>
        <head>
          <title>Fechamento de Caixa</title>
          <style>
            body { font-family: 'Courier New', monospace; width: 280px; font-size: 12px; color: #000; margin: 0; padding: 10px; }
            .center { text-align: center; }
            .header { font-size: 16px; font-weight: bold; }
            .divider { border-top: 1px dashed #000; margin: 8px 0; }
            .line { display: flex; justify-content: space-between; margin-bottom: 2px; }
            .section-title { font-weight: bold; margin-top: 10px; margin-bottom: 5px; }
            .total { font-weight: bold; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="center header">FECHAMENTO DE CAIXA</div>
          <div class="center">${closedAt}</div>

          <div class="divider"></div>
          <div class="section-title">RESUMO DE VENDAS</div>
          ${paymentSummaryHtml}
          <div class="divider"></div>
          <div class="line total"><span>TOTAL VENDAS</span><span>${f(closing.total_revenue)}</span></div>
          
          <div class="divider"></div>
          <div class="section-title">DESPESAS</div>
          ${expenses.length > 0 ? expensesHtml : '<div class="line"><span>Nenhuma despesa</span><span>-R$ 0,00</span></div>'}
          <div class="divider"></div>
          <div class="line total"><span>TOTAL DESPESAS</span><span>-${f(closing.total_expenses)}</span></div>

          <div class="divider"></div>
          <div class="section-title">CONFERÊNCIA DE CAIXA</div>
          <div class="line"><span>(+) Saldo Inicial</span><span>${f(closing.opening_balance)}</span></div>
          <div class="line"><span>(+) Entradas Dinheiro</span><span>${f(closing.payment_summary.find((p: any) => p.method === 'Dinheiro')?.total || 0)}</span></div>
          <div class="line"><span>(-) Despesas</span><span>-${f(closing.total_expenses)}</span></div>
          <div class="divider"></div>
          <div class="line total"><span>(=) ESPERADO EM CAIXA</span><span>${f(closing.expected_cash_in_drawer)}</span></div>
          
          <div class="divider"></div>
          <div class="line"><span>VALOR CONTADO</span><span>${f(closing.counted_cash)}</span></div>
          <div class="line total"><span>DIFERENÇA</span><span>${f(closing.difference)} ${closing.difference > 0 ? '(SOBRA)' : closing.difference < 0 ? '(FALTA)' : ''}</span></div>

          ${closing.notes ? `<div class="divider"></div><div class="section-title">OBSERVAÇÕES</div><div style="font-size: 11px;">${closing.notes}</div>` : ''}

          <div class="divider"></div>
          <div class="center" style="margin-top: 20px;">_________________________</div>
          <div class="center">Assinatura Responsável</div>
        </body>
      </html>
    `;
  }
}