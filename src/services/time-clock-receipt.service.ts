import { Injectable, signal } from '@angular/core';

export interface TimeClockReceipt {
  employeeName: string;
  matricula: string;
  cpf: string;
  action: 'INICIO_TURNO' | 'INICIO_PAUSA' | 'FIM_PAUSA' | 'FIM_TURNO';
  timestamp: string;
  hash: string;
  nsr: string; // Número Sequencial de Registro
}

@Injectable({
  providedIn: 'root'
})
export class TimeClockReceiptService {
  currentReceipt = signal<TimeClockReceipt | null>(null);

  showReceipt(receipt: TimeClockReceipt) {
    this.currentReceipt.set(receipt);
  }

  closeReceipt() {
    this.currentReceipt.set(null);
  }
}
