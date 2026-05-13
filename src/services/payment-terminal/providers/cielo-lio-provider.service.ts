import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { PaymentTerminalProvider, PaymentTerminalCommand, TerminalConfig, TerminalPaymentResult } from '../payment-terminal.models';

/**
 * INTEGRAÇÃO CIELO LIO ORDER MANAGER (API REST REMOTA)
 * A arquitetura baseia-se em:
 * 1. Criar a Ordem (POST /order) na nuvem da cielo.
 * 2. Atualizar ou colocar status aguardando sincronizar com a máquina
 * 3. Polling (GET) pra pegar a situação da transação se finalizou.
 */
@Injectable({
  providedIn: 'root'
})
export class CieloLioProviderService implements PaymentTerminalProvider {
  // baseUrl = 'https://api.cielo.com.br/order-management/v1'; // Produção
  private baseUrl = 'https://api.cielo.com.br/sandbox/order-management/v1'; // Sandbox

  constructor(private http: HttpClient) {}

  private getHeaders(credentials: Record<string, string> | undefined) {
    if (!credentials) throw new Error('Credenciais da Cielo ausentes.');
    return {
      'Client-Id': credentials['clientId'],
      'Access-Token': credentials['accessToken'],
      'Merchant-Id': credentials['merchantId'],
      'Content-Type': 'application/json'
    };
  }

  async sendPayment(terminal: TerminalConfig, command: PaymentTerminalCommand): Promise<TerminalPaymentResult> {
    try {
      // 1. Criar o pedido (Order) na Cielo LIO
      console.log(`[CieloLioProvider] Iniciando pagamento na maquininha ${terminal.identifier}`, command);
      
      const payload = {
        number: command.orderId,
        reference: command.reference || `REF-${command.orderId}`,
        status: 'ENTERED', // Inicial. Pode ser colocar itens.
        items: [
           {
              sku: "PAYMENT",
              name: "Pagamento de Conta",
              unitPrice: Math.round(command.amount * 100), // Cielo usa centavos geralmente
              quantity: 1,
              unitOfMeasure: "EACH"
           }
        ]
        // Se quisermos faturar via terminal específico de forma automática, podemos usar campos específicos (se suportado pelo device).
      };

      // FAKE SIMULATION for UI testing without making actual HTTP requests yet
      console.log('Payload a enviar (SIMULADO): ', payload, 'Headers:', this.getHeaders(terminal.credentials));
      
      return {
        success: true,
        status: 'PENDING',
        rawResponse: { message: 'Ordem criada, aguardando maquininha' }
      };

      /* CÓDIGO REAL:
      const res = await firstValueFrom(this.http.post<any>(`${this.baseUrl}/orders`, payload, {
          headers: this.getHeaders(terminal.credentials)
      }));
      return { success: true, status: 'PENDING', rawResponse: res };
      */
    } catch (error: any) {
      console.error('[CieloLioProvider] Erro ao enviar pagamento', error);
      return { success: false, status: 'ERROR', errorMessage: error.message };
    }
  }

  async checkPaymentStatus(terminal: TerminalConfig, orderId: string): Promise<TerminalPaymentResult> {
     // FAKE SIMULATION: 
     console.log(`[CieloLioProvider] Checando status da ordem ${orderId}`);
     // ...
     return {
         success: true,
         status: 'PENDING'
     };
  }

  async cancelPayment(terminal: TerminalConfig, orderId: string): Promise<boolean> {
     console.log(`[CieloLioProvider] Cancelando pagamento ${orderId}`);
     return true;
  }
}
