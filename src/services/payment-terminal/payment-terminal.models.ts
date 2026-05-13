export type TerminalProviderType = 'cielo_lio' | 'stone' | 'pagseguro' | 'mercado_pago';

export interface TerminalConfig {
  id: string;
  name: string; // Ex: Caixa 1, Maquininha Balcão
  provider: TerminalProviderType;
  identifier: string; // O Device ID, Número lógico, etc.
  credentials?: Record<string, string>; // Client ID, Access Token (ideally from backend)
}

export interface PaymentTerminalCommand {
  orderId: string;
  amount: number; // In cents or real, we'll standardise
  paymentType: 'CREDIT' | 'DEBIT' | 'PIX' | 'VOUCHER';
  installments?: number;
  reference?: string;
}

export interface TerminalPaymentResult {
  success: boolean;
  status: 'APPROVED' | 'CANCELLED' | 'PENDING' | 'REJECTED' | 'ERROR';
  transactionId?: string;
  authorizationCode?: string;
  errorMessage?: string;
  rawResponse?: any;
}

export interface PaymentTerminalProvider {
  /**
   * Envia o comando de pagamento para a maquininha
   */
  sendPayment(terminal: TerminalConfig, command: PaymentTerminalCommand): Promise<TerminalPaymentResult>;

  /**
   * Checa o status do pagamento na provedora (Útil para Lio Remoto que é Assíncrono via Nuvem)
   */
  checkPaymentStatus(terminal: TerminalConfig, orderId: string): Promise<TerminalPaymentResult>;

  /**
   * Cancela uma transação de pagamento pendente que foi enviada para maquininha.
   */
  cancelPayment(terminal: TerminalConfig, orderId: string): Promise<boolean>;
}
