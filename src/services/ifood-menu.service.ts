import { inject, Injectable, signal } from '@angular/core';
import { SupabaseStateService } from './supabase-state.service';
import { NotificationService } from './notification.service';
import { Recipe } from '../models/db.models';

export interface IfoodCatalog {
  catalogId: string;
  context: string[];
  status: string;
}

export interface IfoodCategory {
  id: string;
  name: string;
  status: string;
  sequence: number;
  items: IfoodItem[];
}

export interface IfoodItem {
  id: string;
  name: string;
  description: string;
  externalCode: string;
  status: string;
  price: {
    value: number;
    originalValue?: number;
  };
  hasOptionGroups: boolean;
}

export interface UnsellableItem {
  id: string;
  productId: string;
  restrictions: string[];
}

export interface UnsellableCategory {
  id: string;
  status: string;
  restrictions: string[];
  unsellableItems: UnsellableItem[];
}


@Injectable({
  providedIn: 'root'
})
export class IfoodMenuService {
  private stateService = inject(SupabaseStateService);
  private notificationService = inject(NotificationService);

  private companyProfile = this.stateService.companyProfile;

  private async proxyRequest<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH', endpoint: string, body: any = null): Promise<T> {
    const merchantId = this.companyProfile()?.ifood_merchant_id;
    if (!merchantId) {
      throw new Error('O iFood Merchant ID não está configurado.');
    }

    const fullEndpoint = endpoint.replace('{merchantId}', merchantId);

    try {
      const response = await fetch('/api/ifood-catalog', {
        method: 'POST', // The proxy itself is always called with POST
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, endpoint: fullEndpoint, payload: body })
      });

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.message || `Proxy error (${response.status})`);
      }
      
      if (response.status === 202 || response.status === 204) {
        return null as T;
      }

      return await response.json() as T;

    } catch (error) {
      console.error(`[IfoodMenuService] Error calling proxy for ${method} ${fullEndpoint}:`, error);
      throw error;
    }
  }

  async getCatalogs(): Promise<IfoodCatalog[]> {
    return this.proxyRequest<IfoodCatalog[]>('GET', '/catalog/v2.0/merchants/{merchantId}/catalogs');
  }

  async getCategories(catalogId: string): Promise<IfoodCategory[]> {
    return this.proxyRequest<IfoodCategory[]>('GET', `/catalog/v2.0/merchants/{merchantId}/catalogs/${catalogId}/categories?include_items=true`);
  }
  
  async getUnsellableItems(catalogId: string): Promise<{categories: UnsellableCategory[]}> {
     return this.proxyRequest<{categories: UnsellableCategory[]}>('GET', `/catalog/v2.0/merchants/{merchantId}/catalogs/${catalogId}/unsellableItems`);
  }
  
  async createCategory(catalogId: string, name: string): Promise<{ id: string }> {
    const payload = {
      name: name,
      status: 'AVAILABLE',
      template: 'DEFAULT',
      sequence: 0
    };
    return this.proxyRequest<{ id: string }>('POST', `/catalog/v2.0/merchants/{merchantId}/catalogs/${catalogId}/categories`, payload);
  }

  async syncItem(itemPayload: any): Promise<void> {
    return this.proxyRequest<void>('PUT', '/catalog/v2.0/merchants/{merchantId}/items', itemPayload);
  }
}