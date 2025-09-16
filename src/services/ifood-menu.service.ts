import { Injectable, inject } from '@angular/core';
import { SupabaseStateService } from './supabase-state.service';
import { Recipe, IfoodMenuSync } from '../models/db.models';
import { supabase } from './supabase-client';

// Interfaces for iFood catalog objects
export interface IfoodPrice {
  value: number;
  originalValue?: number;
}

export interface IfoodItem {
  id: string;
  name: string;
  description: string;
  price: IfoodPrice;
  externalCode: string;
  order: number;
}

export interface IfoodCategory {
  id: string;
  name: string;
  order: number;
  items: IfoodItem[];
}

@Injectable({
  providedIn: 'root'
})
export class IfoodMenuService {
  private stateService = inject(SupabaseStateService);

  private getMerchantId(): string {
    const merchantId = this.stateService.companyProfile()?.ifood_merchant_id;
    if (!merchantId) {
      throw new Error('iFood Merchant ID não está configurado no perfil da empresa.');
    }
    return merchantId;
  }

  private async callCatalogApi(method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', endpoint: string, payload?: any): Promise<any> {
    const response = await fetch('/api/ifood-catalog', {
      method: 'POST', // The proxy itself is always POSTed to
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, endpoint, payload })
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: `iFood Catalog API error (${response.status})` }));
      throw new Error(errorBody.message || `iFood Catalog API error (${response.status})`);
    }

    if (response.status === 204 || response.status === 202) {
      return null; // No content
    }
    return response.json();
  }

  async getCatalog(): Promise<IfoodCategory[]> {
    const merchantId = this.getMerchantId();
    // This endpoint fetches categories and their items
    return this.callCatalogApi('GET', `/catalog/v2.0/merchants/${merchantId}/menus`);
  }

  private async generateSyncHash(recipe: Recipe): Promise<string> {
    const data = `${recipe.name}|${recipe.description || ''}|${recipe.price}|${recipe.is_available}`;
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async syncRecipe(recipe: Recipe, categoryId: string): Promise<{ success: boolean, error?: any }> {
    const merchantId = this.getMerchantId();
    const existingSync = this.stateService.ifoodMenuSync().find(s => s.recipe_id === recipe.id);
    const currentHash = await this.generateSyncHash(recipe);

    const itemPayload = {
      name: recipe.name,
      description: recipe.description || '',
      price: { value: Math.round(recipe.price * 100) }, // iFood uses cents
      externalCode: recipe.id,
    };

    try {
      if (existingSync) {
        await this.callCatalogApi('PATCH', `/catalog/v2.0/merchants/${merchantId}/categories/${existingSync.ifood_category_id}/products/${existingSync.ifood_item_id}`, itemPayload);
        await supabase.from('ifood_menu_sync').update({ last_sync_hash: currentHash, last_synced_at: new Date().toISOString() }).eq('recipe_id', recipe.id);
      } else {
        const newItem = await this.callCatalogApi('POST', `/catalog/v2.0/merchants/${merchantId}/categories/${categoryId}/products`, itemPayload);
        const syncData: Omit<IfoodMenuSync, 'created_at' | 'last_synced_at'> = {
            recipe_id: recipe.id,
            user_id: this.stateService.currentUser()!.id,
            ifood_item_id: newItem.id,
            ifood_product_id: newItem.id,
            ifood_category_id: categoryId,
            last_sync_hash: currentHash,
        };
        const { error } = await supabase.from('ifood_menu_sync').insert(syncData);
        if (error) throw error;
      }
      
      await this.updateItemAvailability(recipe);
      return { success: true };
    } catch(error) {
      return { success: false, error };
    }
  }

  async updateItemAvailability(recipe: Recipe): Promise<void> {
    const merchantId = this.getMerchantId();
    const syncInfo = this.stateService.ifoodMenuSync().find(s => s.recipe_id === recipe.id);
    if (!syncInfo) return;

    const endpoint = `/catalog/v2.0/merchants/${merchantId}/products/${syncInfo.ifood_item_id}/${recipe.is_available ? 'activate' : 'deactivate'}`;
    await this.callCatalogApi('POST', endpoint);
  }

  async unlinkRecipe(recipeId: string): Promise<{ success: boolean, error?: any }> {
    const merchantId = this.getMerchantId();
    const syncInfo = this.stateService.ifoodMenuSync().find(s => s.recipe_id === recipeId);
    if (!syncInfo) return { success: true };

    try {
      await this.callCatalogApi('DELETE', `/catalog/v2.0/merchants/${merchantId}/categories/${syncInfo.ifood_category_id}/products/${syncInfo.ifood_item_id}`);
    } catch (error: any) {
        if (!error.message.includes('404')) { // Ignore if it's already deleted on iFood's side
            return { success: false, error };
        }
    }
    
    const { error } = await supabase.from('ifood_menu_sync').delete().eq('recipe_id', recipeId);
    if (error) return { success: false, error };

    return { success: true };
  }
}
