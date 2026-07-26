import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class NtpService {
  // Simulando sincronização com NTP.br (em um app real, chamaria um endpoint no servidor para pegar o horário confiável)
  async getNetworkTime(): Promise<Date> {
    try {
      const res = await fetch('/api/v2/health'); // fallback para usar o cabeçalho Date ou o tempo do servidor se houver
      if (res.headers.has('date')) {
        return new Date(res.headers.get('date')!);
      }
      return new Date();
    } catch {
      return new Date();
    }
  }
}
