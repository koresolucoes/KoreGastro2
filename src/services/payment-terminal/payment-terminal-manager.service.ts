import { Injectable, inject } from '@angular/core';
import { PaymentTerminalProvider, TerminalConfig, TerminalProviderType } from './payment-terminal.models';
import { CieloLioProviderService } from './providers/cielo-lio-provider.service'; 

@Injectable({
  providedIn: 'root'
})
export class PaymentTerminalManagerService {
  private cieloProvider = inject(CieloLioProviderService);
  
  private getProviderStrategy(type: TerminalProviderType): PaymentTerminalProvider {
    switch (type) {
      case 'cielo_lio':
        return this.cieloProvider;
      default:
        throw new Error(`Provedor de terminal ${type} não suportado.`);
    }
  }

  async sendPayment(terminal: TerminalConfig, command: any) {
    const provider = this.getProviderStrategy(terminal.provider);
    return provider.sendPayment(terminal, command);
  }

  async checkPaymentStatus(terminal: TerminalConfig, orderId: string) {
    const provider = this.getProviderStrategy(terminal.provider);
    return provider.checkPaymentStatus(terminal, orderId);
  }

  async cancelPayment(terminal: TerminalConfig, orderId: string) {
    const provider = this.getProviderStrategy(terminal.provider);
    return provider.cancelPayment(terminal, orderId);
  }
}
