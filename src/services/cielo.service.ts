import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class CieloService {
  private http = inject(HttpClient);

  async createCreditCardPayment(amount: number, orderId: string, cardDetails?: any): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.http.post<any>('/api/payments/cielo', {
          action: 'credit_card',
          amount,
          orderId,
          card: cardDetails
        })
      );
      return response;
    } catch (error) {
      console.error('Error creating credit card payment via server API:', error);
      throw error;
    }
  }

  async createPixPayment(amount: number, orderId: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.http.post<any>('/api/payments/cielo', {
          action: 'pix',
          amount,
          orderId
        })
      );
      return response;
    } catch (error) {
      console.error('Error creating Pix payment via server API:', error);
      throw error;
    }
  }

  async simulateLioPayment(amount: number, orderId: string): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.http.post<any>('/api/payments/cielo', {
          action: 'simulate_lio',
          amount,
          orderId
        })
      );
      return !!response?.success;
    } catch (error) {
      console.error('Error simulating LIO payment via server API:', error);
      throw error;
    }
  }
}

