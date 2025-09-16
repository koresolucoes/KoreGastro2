import { Injectable, inject } from '@angular/core';
import { NotificationService } from './notification.service';

// Basic interfaces for iFood API responses.
export interface IfoodCategory {
  id: string;
  merchantId: string;
  name: string;
  sequence: number;
  externalCode?: string;
  status: 'AVAILABLE' | 'UNAVAILABLE';
  template?: 'DEFAULT' | 'PIZZA';
  items?: IfoodProduct[]; // When fetching categories with items
}

export interface IfoodProductPrice {
    value: number; // in cents
    originalValue?: number;
}

export interface IfoodProduct {
  id: string;
  merchantId: string;
  name: string;
  description: string;
  externalCode: string;
  ean?: string;
  status: 'AVAILABLE' | 'UNAVAILABLE';
  sequence: number;
  price: IfoodProductPrice;
}

@Injectable({
  providedIn: 'root'
})
export class IfoodMenuService {
  private notificationService = inject(NotificationService);

  private async apiRequest<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'LINK' | 'UNLINK', endpoint: string, payload: any = null): Promise<T> {
    // LINK and UNLINK are custom methods to simplify the endpoint logic
    if (method === 'LINK' || method === 'UNLINK') {
      const actualMethod = 'POST';
      const actualEndpoint = method === 'LINK' ? `${endpoint}:link` : `${endpoint}:unlink`;
      return this.apiRequest<T>(actualMethod, actualEndpoint, payload);
    }

    try {
      const response = await fetch('/api/ifood-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, endpoint, payload })
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ message: response.statusText }));
        const errorMessage = errorBody.message || errorBody.details?.[0]?.message || 'An unknown API error occurred.';
        console.error(`iFood Menu API Error (${method} ${endpoint}):`, errorBody);
        this.notificationService.show(`Erro na API iFood: ${errorMessage}`, 'error');
        throw new Error(errorMessage);
      }
      
      // Handle responses with no content
      if (response.status === 201 || response.status === 202 || response.status === 204) {
        return null as T;
      }
      
      return await response.json();
    } catch (error) {
      console.error(`iFood Menu API Error (${method} ${endpoint}):`, error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown network error occurred.';
      this.notificationService.show(`Erro na API iFood: ${errorMessage}`, 'error');
      throw new Error(errorMessage);
    }
  }

  // Categories
  async getCategories(merchantId: string): Promise<IfoodCategory[]> {
    return this.apiRequest<IfoodCategory[]>('GET', `/catalog/v2.0/merchants/${merchantId}/categories?withItems=true`);
  }

  async upsertCategory(merchantId: string, category: { name: string; externalCode: string; sequence: number }): Promise<void> {
    // iFood uses POST for both create and update based on externalCode
    await this.apiRequest<void>('POST', `/catalog/v2.0/merchants/${merchantId}/categories`, [category]);
  }

  // Products
  async getProductByExternalCode(merchantId: string, externalCode: string): Promise<IfoodProduct | null> {
    const products = await this.apiRequest<IfoodProduct[]>( 'GET', `/catalog/v2.0/merchants/${merchantId}/products?externalCode=${externalCode}`);
    return products?.[0] || null;
  }

  async upsertProduct(merchantId: string, product: { name: string; description: string; externalCode: string; price: IfoodProductPrice; sequence: number }): Promise<void> {
    await this.apiRequest<void>('POST', `/catalog/v2.0/merchants/${merchantId}/products`, [product]);
  }

  // Linking
  async linkProductToCategory(merchantId: string, categoryId: string, productId: string, sequence: number, priceInCents: number): Promise<void> {
    const payload = {
        "items": [{
            "id": productId,
            "sequence": sequence,
            "price": {
                "value": priceInCents,
            }
        }]
    };
    await this.apiRequest<void>('LINK', `/catalog/v2.0/merchants/${merchantId}/categories/${categoryId}/products`, payload);
  }

  async unlinkProductFromCategory(merchantId: string, categoryId: string, productId: string): Promise<void> {
    const payload = {
        "items": [{
            "id": productId
        }]
    };
    await this.apiRequest<void>('UNLINK', `/catalog/v2.0/merchants/${merchantId}/categories/${categoryId}/products`, payload);
  }
}
