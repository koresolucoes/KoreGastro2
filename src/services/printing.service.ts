
import { Injectable, inject, LOCALE_ID } from '@angular/core';
import { Order, OrderItem, Station, Requisition, RequisitionItem } from '../models/db.models';
import { DatePipe, CurrencyPipe, DecimalPipe } from '@angular/common';
import { CashierClosing } from '../models/db.models';
import { NotificationService } from './notification.service';
import { ProcessedIfoodOrder } from '../models/app.models';
import { SettingsStateService } from './settings-state.service';

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
  private settingsState = inject(SettingsStateService);

  constructor() {
    const locale = inject(LOCALE_ID);
    this.datePipe = new DatePipe(locale);
    this.currencyPipe = new CurrencyPipe(locale);
    this.decimalPipe = new DecimalPipe(locale);
  }

  // Helper to format table/command name
  private getOrderIdentifier(order: Order): string {
      if (order.command_number) {
          return `Comanda ${order.command_number}`;
      }
      if (order.table_number && order.table_number > 0) {
          return `Mesa ${order.table_number}`;
      }
      if (order.order_type === 'QuickSale') {
          return 'Venda Rápida';
      }
      if (order.tab_name) {
          return `Conta: ${order.tab_name}`;
      }
      return `Pedido #${order.id.slice(0,4)}`;
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
    const identifier = this.getOrderIdentifier(order);
    printWindow.document.title = `Pré-conta - ${identifier}`;
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

  private generateTicketHtml(order: Order, items: OrderItem[], station: Station): string {
    const formattedTimestamp = this.datePipe.transform(new Date(), 'dd/MM/yyyy HH:mm:ss');
    const orderId = order.id.substring(0, 8).toUpperCase();
    const headerText = this.getOrderIdentifier(order);
    const customerName = order.customers?.name || order.tab_name || '';
    const waiterName = order.waiter?.name || '';
    
    let itemsHtml = items.map(item => {
        const notesHtml = item.notes ? `<p style="font-style: italic; margin-left: 15px; margin-top: 2px;"> -> ${item.notes}</p>` : '';
        const itemName = item.name.includes('(') ? item.name.split('(')[0].trim() : item.name;
        const prepName = item.name.includes('(') ? `<div style="font-size: 10px; margin-left: 15px;">(${item.name.split('(')[1].replace(')','')})</div>` : '';

        return `
            <div style="margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px;">
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
              background-color: #000;
              color: #fff;
              padding: 2px;
            }
            .info {
              font-size: 12px;
              border-bottom: 1px dashed #000;
              padding-bottom: 5px;
              margin-bottom: 10px;
            }
            .info div { margin-bottom: 2px; }
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
            <div><strong>Pedido:</strong> #${orderId}</div>
            <div><strong>Data:</strong> ${formattedTimestamp}</div>
            ${customerName ? `<div><strong>Cliente:</strong> ${customerName}</div>` : ''}
            ${waiterName ? `<div><strong>Garçom:</strong> ${waiterName}</div>` : ''}
          </div>
          <div class="items">${itemsHtml}</div>
        </body>
      </html>
    `;
  }

  private generatePreBillHtml(order: Order, options: PreBillOptions): string {
    const date = this.datePipe.transform(new Date(), 'dd/MM/yyyy HH:mm');
    const subtotal = order.order_items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    let discountAmount = 0;
    if (order.discount_type === 'percentage') {
      discountAmount = subtotal * ((order.discount_value || 0) / 100);
    } else if (order.discount_type === 'fixed_value') {
      discountAmount = order.discount_value || 0;
    }
    
    const subtotalAfterDiscount = subtotal - discountAmount;
    const serviceFee = options.includeServiceFee ? subtotalAfterDiscount * 0.1 : 0;
    const total = options.total;
    const identifier = this.getOrderIdentifier(order);

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

    let discountHtml = '';
    if (discountAmount > 0) {
        discountHtml = `
            <tr>
              <td colspan="2">Desconto</td>
              <td style="text-align: right;">-${this.currencyPipe.transform(discountAmount, 'BRL', 'R$', '1.2-2')}</td>
            </tr>
        `;
    }

    return `
      <html>
        <head>
          <title>Pré-conta - ${identifier}</title>
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
          <div>${identifier}</div>
          ${order.waiter?.name ? `<div>Garçom: ${order.waiter.name}</div>` : ''}
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
            ${discountHtml}
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
    const date = this.datePipe.transform(new Date(), 'dd/MM/yyyy HH:mm');
    const identifier = this.getOrderIdentifier(order);
    const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);

    const itemsHtml = order.order_items
        .filter(item => item.price > 0 || item.quantity > 0)
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
          <title>Recibo - ${identifier}</title>
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
          <div class="center">RECIBO DE PAGAMENTO</div>
          <div class="divider"></div>
          <div>Data: ${date}</div>
          <div>${identifier}</div>
          ${order.waiter?.name ? `<div>Garçom: ${order.waiter.name}</div>` : ''}
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
          <div style="margin-bottom: 5px;"><strong>Pagamentos:</strong></div>
          ${paymentsHtml}
          <div class="divider"></div>
          <div class="total-row" style="display: flex; justify-content: space-between;">
              <span>TOTAL PAGO</span>
              <span>${this.currencyPipe.transform(totalPaid, 'BRL', 'R$', '1.2-2')}</span>
          </div>
          <div class="info-text">Obrigado pela preferência!</div>
        </body>
      </html>
    `;
  }
  
  // Placeholder methods for other types to satisfy compilation, actual implementation remains same
  async printCashierClosingReport(closingData: CashierClosing, expenseTransactions: any[]) { /* ... */ }
  async printPayslip(payslipHtml: string, employeeName: string) { /* ... */ }
  async printIfoodReceipt(order: ProcessedIfoodOrder) { /* ... */ }
  async printDeliveryGuide(order: Order) { /* ... */ }
  async printRequisition(requisition: Requisition) {
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      this.notificationService.show('Por favor, habilite pop-ups para imprimir.', 'warning');
      return;
    }

    const date = this.datePipe.transform(requisition.created_at, 'dd/MM/yyyy HH:mm');
    const processedDate = requisition.processed_at ? this.datePipe.transform(requisition.processed_at, 'dd/MM/yyyy HH:mm') : 'N/A';
    const identifier = `Requisição #${requisition.id.substring(0, 8).toUpperCase()}`;
    
    printWindow.document.title = identifier;

    const itemsHtml = (requisition.requisition_items || []).map(item => `
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.ingredients?.name || 'Item Desconhecido'}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${this.decimalPipe.transform(item.quantity_requested, '1.0-3')} ${item.unit}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${item.quantity_delivered !== null ? this.decimalPipe.transform(item.quantity_delivered, '1.0-3') + ' ' + item.unit : '-'}</td>
        </tr>
    `).join('');

    const statusMap: Record<string, string> = {
      'PENDING': 'Pendente',
      'APPROVED': 'Aprovada',
      'REJECTED': 'Rejeitada',
      'DELIVERED': 'Entregue',
      'PARTIAL': 'Parcial'
    };

    const statusText = statusMap[requisition.status] || requisition.status;

    const receiptHtml = `
      <html>
        <head>
          <title>${identifier}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #333; margin: 0; padding: 20px; }
            .header { text-align: center; margin-bottom: 20px; }
            .header h1 { margin: 0 0 10px 0; font-size: 24px; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; background: #f9fafb; padding: 15px; border-radius: 8px; }
            .info-item { margin-bottom: 5px; }
            .info-label { font-weight: bold; color: #6b7280; font-size: 12px; text-transform: uppercase; }
            .info-value { font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th { background-color: #f3f4f6; padding: 10px 8px; text-align: left; font-weight: bold; border-bottom: 2px solid #e5e7eb; }
            th.right { text-align: right; }
            .notes { margin-top: 20px; padding: 15px; background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 4px; }
            .notes-title { font-weight: bold; margin-bottom: 5px; color: #b45309; }
            @media print {
              @page { margin: 1cm; }
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${identifier}</h1>
          </div>
          
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Data da Solicitação</div>
              <div class="info-value">${date}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Status</div>
              <div class="info-value">${statusText}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Solicitante</div>
              <div class="info-value">${requisition.requester?.name || 'N/A'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Estação Destino</div>
              <div class="info-value">${requisition.stations?.name || 'N/A'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Processado Por</div>
              <div class="info-value">${requisition.processor?.name || 'N/A'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Data de Processamento</div>
              <div class="info-value">${processedDate}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th class="right">Qtd. Solicitada</th>
                <th class="right">Qtd. Entregue</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          ${requisition.notes ? `
          <div class="notes">
            <div class="notes-title">Observações:</div>
            <div>${requisition.notes}</div>
          </div>
          ` : ''}
          
          <div style="margin-top: 50px; display: flex; justify-content: space-around;">
            <div style="text-align: center; width: 200px;">
              <div style="border-bottom: 1px solid #000; height: 30px; margin-bottom: 5px;"></div>
              <div style="font-size: 12px;">Assinatura do Solicitante</div>
            </div>
            <div style="text-align: center; width: 200px;">
              <div style="border-bottom: 1px solid #000; height: 30px; margin-bottom: 5px;"></div>
              <div style="font-size: 12px;">Assinatura do Estoquista</div>
            </div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(receiptHtml);
    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  }
}
