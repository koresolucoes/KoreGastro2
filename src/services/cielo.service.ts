import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CieloService {

  // For sandbox testing, we use the local proxy to avoid CORS
  private apiUrl = '/api/cielo/1/sales/';

  constructor() {}

  async createCreditCardPayment(amount: number, orderId: string): Promise<any> {
    if (!CIELO_MERCHANT_ID || !CIELO_MERCHANT_KEY) {
      console.warn('Cielo credentials are not configured. Make sure CIELO_MERCHANT_ID and CIELO_MERCHANT_KEY are set.');
      throw new Error('Cielo credentials are required');
    }

    // Amount must be in cents
    const amountInCents = Math.round(amount * 100);

    const payload = {
      MerchantOrderId: orderId,
      Customer: {
        Name: "Comprador Teste",
        Identity: "11111111111",
        IdentityType: "CPF"
      },
      Payment: {
        Type: "CreditCard",
        Amount: amountInCents,
        Installments: 1,
        SoftDescriptor: "SISTEMA PRINCIPAL",
        CreditCard: {
          CardNumber: "0000000000000001", // Sandbox valid test card
          Holder: "Teste Holder",
          ExpirationDate: "12/2030",
          SecurityCode: "123",
          Brand: "Visa"
        }
      }
    };

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'MerchantId': CIELO_MERCHANT_ID,
          'MerchantKey': CIELO_MERCHANT_KEY,
          // Cielo might fail with CORS if it's not proxied correctly, but we're using Vite proxy
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Cielo API error:', errorText);
        throw new Error(`Cielo payment failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Network or Cielo error:', error);
      throw error;
    }
  }

  async createPixPayment(amount: number, orderId: string): Promise<any> {
    if (!CIELO_MERCHANT_ID || !CIELO_MERCHANT_KEY) {
      console.warn('Cielo credentials are not configured.');
      throw new Error('Cielo credentials are required');
    }

    const amountInCents = Math.round(amount * 100);

    const payload = {
      MerchantOrderId: orderId,
      Customer: {
        Name: "Comprador Teste",
        Identity: "11111111111",
        IdentityType: "CPF"
      },
      Payment: {
        Type: "Pix",
        Amount: amountInCents
      }
    };

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'MerchantId': CIELO_MERCHANT_ID,
          'MerchantKey': CIELO_MERCHANT_KEY,
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Cielo API error:', errorText);
        throw new Error(`Cielo payment failed: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Network or Cielo error:', error);
      throw error;
    }
  }

  // Simulates Cielo LIO Maquininha Integration
  // In a real scenario, this would call the Cielo LIO Order Manager API
  async simulateLioPayment(amount: number, orderId: string): Promise<boolean> {
    if (!CIELO_MERCHANT_ID || !CIELO_MERCHANT_KEY) {
      throw new Error('Cielo credentials are required');
    }
    
    return new Promise((resolve) => {
      // Simulate terminal processing delay
      setTimeout(() => {
        resolve(true); 
      }, 4000); // 4 seconds delay
    });
  }
}
