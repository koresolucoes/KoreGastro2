import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { PaymentTerminalProvider, PaymentTerminalCommand, TerminalConfig, TerminalPaymentResult } from '../payment-terminal.models';

/**
 * INTEGRAÇÃO STONE (SMART POS / API CONNECT)
 * A arquitetura Stone permite integração via App Connect / PDV Sync.
 * Fluxo:
 * 1. O PDV envia um POST payload (intent) para a API cloud da Stone contendo o Stone Code da maquininha e os dados do pagamento.
 * 2. A maquininha recebe um web push / WebSocket alertando do pagamento.
 * 3. O operador passa o cartão e a maquininha envia a confirmação para a conveniência da Stone.
 * 4. O sistema (PDV) fica consultando (Polling via GET) o status do /intent (Aprovado, Rejeitado, etc.), ou escuta Webhooks.
 */
@Injectable({
  providedIn: 'root'
})
export class StoneProviderService implements PaymentTerminalProvider {
  // baseUrl da API Stone Openbank / PDV Sync
  private baseUrl = 'https://api.stone.com.br/v1/pos-integrations'; 

  constructor(private http: HttpClient) {}

  private getHeaders(credentials: Record<string, string> | undefined) {
    if (!credentials) throw new Error('Credenciais da Stone ausentes.');
    return {
      'Authorization': `Bearer ${credentials['accessToken']}`, // Token de API Stone
      'Content-Type': 'application/json',
      'X-Partner-Id': credentials['partnerId'] // Se for uma software house parceira
    };
  }

  async sendPayment(terminal: TerminalConfig, command: PaymentTerminalCommand): Promise<TerminalPaymentResult> {
    try {
      console.log(`[StoneProvider] Iniciando pagamento na maquininha (StoneCode: ${terminal.identifier})`, command);
      
      const payload = {
        stoneCode: terminal.identifier, // Opcional, usado caso a conta tenha múltiplas máquinas
        amount: Math.round(command.amount * 100), // Valor em centavos
        paymentType: this.mapOperationTarget(command.paymentType),
        installments: command.installments || 1,
        orderId: command.orderId,
        metadata: {
           reference: command.reference
        }
      };

      // FAKE SIMULATION para testes de UI sem chaves HTTP reais:
      console.log('Payload a enviar para Stone Connect (SIMULADO): ', payload, 'Headers:', this.getHeaders(terminal.credentials));
      
      return {
        success: true,
        status: 'PENDING',
        transactionId: `ST-${Date.now()}`,
        rawResponse: { message: 'Intenção de pagamento enviada para maquininha Stone' }
      };

      /* CÓDIGO REAL:
      const res = await firstValueFrom(this.http.post<any>(`${this.baseUrl}/intents`, payload, {
          headers: this.getHeaders(terminal.credentials)
      }));
      return { success: true, status: 'PENDING', transactionId: res.id, rawResponse: res };
      */
    } catch (error: any) {
      console.error('[StoneProvider] Erro ao enviar pagamento', error);
      return { success: false, status: 'ERROR', errorMessage: error.message };
    }
  }

  async checkPaymentStatus(terminal: TerminalConfig, orderId: string): Promise<TerminalPaymentResult> {
     console.log(`[StoneProvider] Checando status da intenção de pagamento na Stone (Order: ${orderId})`);
     // Na lógica real, chamaria GET /pos-integrations/intents/{intentId}
     return {
         success: true,
         status: 'PENDING'
     };
  }

  async cancelPayment(terminal: TerminalConfig, orderId: string): Promise<boolean> {
     console.log(`[StoneProvider] Cancelando pagamento Stone ${orderId}`);
     // Na lógica real, POST para cancelamento passando o id
     return true;
  }

  private mapOperationTarget(paymentType: string): string {
    switch (paymentType) {
      case 'CREDIT': return 'credit';
      case 'DEBIT': return 'debit';
      case 'PIX': return 'pix';
      case 'VOUCHER': return 'voucher';
      default: return 'credit'; // fallback
    }
  }
}
