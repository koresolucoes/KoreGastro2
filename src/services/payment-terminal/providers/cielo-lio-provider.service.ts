import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { PaymentTerminalProvider, PaymentTerminalCommand, TerminalConfig, TerminalPaymentResult } from '../payment-terminal.models';

/**
 * INTEGRAÇÃO CIELO LIO ORDER MANAGER (API REST REMOTA)
 */
@Injectable({
  providedIn: 'root'
})
export class CieloLioProviderService implements PaymentTerminalProvider {
  // baseUrl = 'https://api.cielo.com.br/order-management/v1'; // Produção
  private baseUrl = 'https://api.cielo.com.br/sandbox/order-management/v1'; // Sandbox

  constructor(private http: HttpClient) {}

  private getHeaders(credentials: Record<string, string> | undefined) {
    if (!credentials || !credentials['clientId'] || !credentials['accessToken'] || !credentials['merchantId']) {
      throw new Error('Credenciais da Cielo ausentes ou incompletas. Vá em Configurações > Maquininhas e preencha Client ID, Access Token e Merchant ID.');
    }
    return {
      'Client-Id': credentials['clientId'],
      'Access-Token': credentials['accessToken'],
      'Merchant-Id': credentials['merchantId'],
      'Content-Type': 'application/json'
    };
  }

  async sendPayment(terminal: TerminalConfig, command: PaymentTerminalCommand): Promise<TerminalPaymentResult> {
    try {
      console.log(`[CieloLioProvider] Iniciando pagamento na maquininha ${terminal.identifier}`, command);
      
      const payload = {
        number: command.orderId.substring(0, 50), // orderId size limit
        reference: command.reference || `REF-${command.orderId}`.substring(0, 50),
        status: 'ENTERED',
        notes: `Cobrança terminal ${terminal.identifier}`,
        items: [
           {
              sku: "PAYMENT",
              name: "Consumo ChefOS",
              unitPrice: Math.round(command.amount * 100), // convert to cents
              quantity: 1,
              unitOfMeasure: "EACH"
           }
        ]
      };

      const res = await firstValueFrom(this.http.post<any>(`${this.baseUrl}/orders`, payload, {
          headers: this.getHeaders(terminal.credentials)
      }));

      return { 
        success: true, 
        status: 'PENDING', 
        rawResponse: res,
        transactionId: res.id // This is the Cielo Order ID, we'll need it to poll
      };
    } catch (error: any) {
      console.error('[CieloLioProvider] Erro ao enviar pagamento', error);
      let errMsg = error.message;
      if (error.error && error.error.message) {
         errMsg = error.error.message;
      }
      return { success: false, status: 'ERROR', errorMessage: errMsg };
    }
  }

  async checkPaymentStatus(terminal: TerminalConfig, orderIdOrCieloId: string): Promise<TerminalPaymentResult> {
     try {
       console.log(`[CieloLioProvider] Checando status da ordem ${orderIdOrCieloId}`);
       const res = await firstValueFrom(this.http.get<any>(`${this.baseUrl}/orders/${orderIdOrCieloId}`, {
           headers: this.getHeaders(terminal.credentials)
       }));

       // Resumo de Status LIO: 'ENTERED', 'CANCELED', 'PAID', 'APPROVED', 'REJECTED'
       if (res.status === 'PAID') {
          return { success: true, status: 'APPROVED', rawResponse: res };
       } else if (res.status === 'CANCELED' || res.status === 'REJECTED') {
          return { success: false, status: 'REJECTED', rawResponse: res, errorMessage: 'Transação não aprovada na maquininha.' };
       }

       return { success: true, status: 'PENDING', rawResponse: res };

     } catch (error: any) {
         console.error('[CieloLioProvider] Erro checando pagamento', error);
         return { success: false, status: 'ERROR', errorMessage: error.message };
     }
  }

  async cancelPayment(terminal: TerminalConfig, cieloOrderId: string): Promise<boolean> {
     try {
       console.log(`[CieloLioProvider] Cancelando pagamento ${cieloOrderId}`);
       await firstValueFrom(this.http.put<any>(
          `${this.baseUrl}/orders/${cieloOrderId}`, 
          { status: 'CANCELED' },
          { headers: this.getHeaders(terminal.credentials) }
       ));
       return true;
     } catch (e) {
       console.error('[CieloLioProvider] Erro ao cancelar pela nuvem', e);
       return false;
     }
  }
}
