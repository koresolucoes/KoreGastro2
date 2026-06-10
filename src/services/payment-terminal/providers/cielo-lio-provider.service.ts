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
  constructor(private http: HttpClient) {}

  private getBaseUrl(credentials: Record<string, any> | undefined): string {
    if (credentials && credentials['isSandbox'] !== undefined && !credentials['isSandbox']) {
      return 'https://api.cielo.com.br/order-management/v1'; // Production
    }
    return 'https://api.cielo.com.br/sandbox-lio/order-management/v1'; // Sandbox
  }

  private getHeaders(credentials: Record<string, string> | undefined) {
    if (!credentials || !credentials['merchantId']) {
      throw new Error('Credenciais da Cielo ausentes ou incompletas. Vá em Configurações > Maquininhas e preencha o Merchant ID.');
    }
    return {
      'Merchant-Id': credentials['merchantId'] as string,
      'Is-Sandbox': credentials['isSandbox'] === false ? 'false' : 'true',
      'Content-Type': 'application/json'
    };
  }

  async sendPayment(terminal: TerminalConfig, command: PaymentTerminalCommand): Promise<TerminalPaymentResult> {
    try {
      console.log(`[CieloLioProvider] Iniciando pagamento na maquininha ${terminal.identifier}`, command);
      
      const payload = {
        number: command.orderId.substring(0, 50), // orderId size limit
        reference: command.reference || `REF-${command.orderId}`.substring(0, 50),
        status: 'DRAFT',
        deviceId: terminal.identifier, // Para Lio V1/V2
        device_id: terminal.identifier, // Envio redundante no caso do backend usar snake_case
        price: Math.round(command.amount * 100),
        notes: `Cobrança terminal ${terminal.identifier}`,
        items: [
           {
              sku: "PAYMENT",
              name: "Consumo ChefOS",
              unit_price: Math.round(command.amount * 100), // convert to cents
              quantity: 1,
              unit_of_measure: "EACH"
           }
        ]
      };

      const res = await firstValueFrom(this.http.post<any>(`/api/proxy-cielo-lio?path=/orders`, payload, {
          headers: this.getHeaders(terminal.credentials)
      }));

      // Release the order to the machine (wake it up)
      try {
         await firstValueFrom(this.http.put<any>(`/api/proxy-cielo-lio?path=/orders/${res.id}&operation=PLACE`, {}, {
             headers: this.getHeaders(terminal.credentials)
         }));
      } catch (placeErr) {
         console.warn('[CieloLioProvider] Aviso: Erro ao realizar o PLACE do pedido.', placeErr);
      }

      return { 
        success: true, 
        status: 'PENDING', 
        rawResponse: res,
        transactionId: res.id // This is the Cielo Order ID, we'll need it to poll
      };
    } catch (error: any) {
      console.error('[CieloLioProvider] Erro ao enviar pagamento', error);
      let errMsg = error.message;
      if (error.error) {
         if (error.error.message) {
            errMsg = error.error.message;
         } else if (Array.isArray(error.error) && error.error.length > 0 && error.error[0].message) {
            errMsg = error.error[0].message;
         } else if (error.error.error) {
            errMsg = error.error.error;
         } else {
            errMsg = JSON.stringify(error.error);
         }
      }
      return { success: false, status: 'ERROR', errorMessage: errMsg };
    }
  }

  async checkPaymentStatus(terminal: TerminalConfig, orderIdOrCieloId: string): Promise<TerminalPaymentResult> {
     try {
       console.log(`[CieloLioProvider] Checando status da ordem ${orderIdOrCieloId}`);
       const res = await firstValueFrom(this.http.get<any>(`/api/proxy-cielo-lio?path=/orders/${orderIdOrCieloId}`, {
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
          `/api/proxy-cielo-lio?path=/orders/${cieloOrderId}`, 
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
