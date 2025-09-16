import { inject, Injectable, signal } from '@angular/core';
import { SupabaseStateService } from './supabase-state.service';
import { NotificationService } from './notification.service';
import { Recipe } from '../models/db.models';
import { supabase } from './supabase-client';
import { AuthService } from './auth.service';

export interface IfoodCatalog {
  catalogId: string;
  context: string[];
  status: string;
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
  image?: string;
}

export interface IfoodCategory {
  id: string;
  name: string;
  status: string;
  sequence: number;
  items: IfoodItem[];
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
  private authService = inject(AuthService);

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

      const responseText = await response.text();

      if (!response.ok) {
        let errorMessage = `Proxy error (${response.status})`;
        if (responseText) {
            try {
                const errorJson = JSON.parse(responseText);
                errorMessage = errorJson.message || JSON.stringify(errorJson.details || errorJson.error || responseText);
            } catch(e) {
                errorMessage = responseText; // Use raw text if it's not JSON
            }
        }
        throw new Error(errorMessage);
      }
      
      if (response.status === 202 || response.status === 204) {
        return null as T;
      }

      return responseText ? JSON.parse(responseText) as T : null as T;

    } catch (error) {
      console.error(`[IfoodMenuService] Error calling proxy for ${method} ${fullEndpoint}:`, error);
      throw error;
    }
  }

  async getCatalogs(): Promise<IfoodCatalog[]> {
    return this.proxyRequest<IfoodCatalog[]>('GET', '/catalog/v2.0/merchants/{merchantId}/catalogs');
  }

  async getCategories(catalogId: string): Promise<IfoodCategory[]> {
    // The include_items=true parameter is crucial for fetching items nested in categories.
    return this.proxyRequest<IfoodCategory[]>('GET', `/catalog/v2.0/merchants/{merchantId}/catalogs/${catalogId}/categories?includeItems=true`);
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

  async syncItem(itemPayload: any, recipe: Recipe, syncHash: string): Promise<void> {
    const { item, products } = await this.proxyRequest<{item: any, products: any[]}>('PUT', '/catalog/v2.0/merchants/{merchantId}/items', itemPayload);
    
    // After successful sync, save to our DB
    const userId = this.authService.currentUser()?.id;
    if (!userId || !item) throw new Error("User not found or invalid iFood response");

    const syncRecord = {
      recipe_id: recipe.id,
      user_id: userId,
      ifood_item_id: item.id,
      ifood_product_id: products[0].id,
      ifood_category_id: item.categoryId,
      last_sync_hash: syncHash,
      last_synced_at: new Date().toISOString(),
    };
    
    const { error } = await supabase.from('ifood_menu_sync').upsert(syncRecord, { onConflict: 'recipe_id' });
    
    if (error) {
        console.error("Failed to save sync status to DB", error);
        this.notificationService.show(`Item sincronizado com iFood, mas falha ao salvar estado local.`, 'warning');
    }
  }

  async patchItemPrice(externalCode: string, newPrice: number): Promise<void> {
    const endpoint = `/catalog/v2.0/merchants/{merchantId}/products/price`;
    const payload = [{
        externalCode: externalCode,
        price: {
            value: newPrice,
            originalValue: newPrice
        },
        resources: ["ITEM"]
    }];
    await this.proxyRequest<any>('PATCH', endpoint, payload);
  }

  async patchItemStatus(externalCode: string, status: 'AVAILABLE' | 'UNAVAILABLE'): Promise<void> {
      const endpoint = `/catalog/v2.0/merchants/{merchantId}/products/status`;
      const payload = [{
          externalCode: externalCode,
          status: status,
          resources: ["ITEM"]
      }];
      await this.proxyRequest<any>('PATCH', endpoint, payload);
  }
  
  async updateItemImage(itemPayload: any, recipe: Recipe, syncHash: string): Promise<void> {
    const { item, products } = await this.proxyRequest<{item: any, products: any[]}>('PUT', '/catalog/v2.0/merchants/{merchantId}/items', itemPayload);
    
    const userId = this.authService.currentUser()?.id;
    if (!userId || !item) throw new Error("User not found or invalid iFood response");

    const syncRecord = {
      recipe_id: recipe.id,
      user_id: userId,
      ifood_item_id: item.id,
      ifood_product_id: products[0].id,
      ifood_category_id: item.categoryId,
      last_sync_hash: syncHash,
      last_synced_at: new Date().toISOString(),
    };
    
    const { error } = await supabase.from('ifood_menu_sync').upsert(syncRecord, { onConflict: 'recipe_id' });
    
    if (error) {
        console.error("Failed to save sync status to DB after image update", error);
    }
  }
}