import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { PaymentTerminalProvider, PaymentTerminalCommand, TerminalConfig, TerminalPaymentResult } from '../payment-terminal.models';

/**
 * INTEGRAÇÃO REDE (API DE TERMINAIS / APP TEF PAA)
 * A arquitetura tradicional da Rede Smart usa APIs locais quando em Android (LIO, Rede Smart),
 * e usa integrações cloud (e.Rede API ou AppTef Server) quando comandadas da nuvem.
 * Este serviço implementa a estrutura base para integração.
 */
@Injectable({
  providedIn: 'root'
})
export class RedeProviderService implements PaymentTerminalProvider {
  // baseUrl de simulação
  private baseUrl = 'https://api.userede.com.br/tef/v1';

  constructor(private http: HttpClient) {}

  private getHeaders(credentials: Record<string, string> | undefined) {
    if (!credentials) throw new Error('Credenciais da Rede ausentes.');
    return {
      'Authorization': `Basic ${btoa(credentials['clientId'] + ':' + credentials['clientSecret'])}`,
      'Content-Type': 'application/json'
    };
  }

  async sendPayment(terminal: TerminalConfig, command: PaymentTerminalCommand): Promise<TerminalPaymentResult> {
    try {
      console.log(`[RedeProvider] Iniciando pagamento na maquininha Rede (PV: ${terminal.identifier})`, command);
      
      const payload = {
        pv: terminal.identifier, // Ponto de venda (Terminal/Loja)
        amount: Math.round(command.amount * 100), // Valor em centavos
        transactionType: this.mapOperationTarget(command.paymentType),
        installments: command.installments || 1,
        reference: command.orderId
      };

      console.log('Payload a enviar para Rede (SIMULADO): ', payload, 'Headers:', this.getHeaders(terminal.credentials));
      
      return {
        success: true,
        status: 'PENDING',
        transactionId: `RD-${Date.now()}`,
        rawResponse: { message: 'Mensagem de pagamento enviada para terminal Rede' }
      };
    } catch (error: any) {
      console.error('[RedeProvider] Erro ao enviar pagamento', error);
      return { success: false, status: 'ERROR', errorMessage: error.message };
    }
  }

  async checkPaymentStatus(terminal: TerminalConfig, orderId: string): Promise<TerminalPaymentResult> {
     console.log(`[RedeProvider] Checando status do pagamento na Rede (Order: ${orderId})`);
     return {
         success: true,
         status: 'PENDING'
     };
  }

  async cancelPayment(terminal: TerminalConfig, orderId: string): Promise<boolean> {
     console.log(`[RedeProvider] Cancelando pagamento Rede ${orderId}`);
     return true;
  }

  private mapOperationTarget(paymentType: string): string {
    switch (paymentType) {
      case 'CREDIT': return 'credit';
      case 'DEBIT': return 'debit';
      case 'PIX': return 'pix';
      case 'VOUCHER': return 'voucher';
      default: return 'credit'; 
    }
  }
}
