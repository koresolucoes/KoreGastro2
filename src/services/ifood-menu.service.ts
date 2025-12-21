import { inject, Injectable } from '@angular/core';
import { SettingsStateService } from './settings-state.service';
import { NotificationService } from './notification.service';
import { Recipe } from '../models/db.models';
import { supabase } from './supabase-client';
import { AuthService } from './auth.service';

export interface IfoodCancellationReason {
  code: string;
  description: string;
}

export interface IfoodCatalog {
  catalogId: string;
  context: string[];
  status: string;
  modifiedAt?: string;
  groupId?: string;
}

export interface IfoodItem {
  id: string;
  name: string;
  description: string;
  externalCode: string;
  status: string;
  productId: string;
  index: number;
  price: {
    value: number;
    originalValue?: number;
  };
  hasOptionGroups: boolean;
  imagePath?: string;
  image?: string;
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

export interface IfoodTrackingData {
  deliveryEtaEnd: number;
  expectedDelivery: string;
  latitude: number;
  longitude: number;
  pickupEtaStart: number;
  trackDate: number;
}

export interface IfoodCategory {
  id: string;
  name: string;
  status: string;
  index: number;
  items: IfoodItem[];
}

export interface IfoodOption {
  id: string;
  name: string;
  description: string;
  externalCode: string;
  price: { value: number, originalValue: number };
  status: string;
  index: number;
  productId: string;
}

export interface IfoodOptionGroup {
  id: string;
  name: string;
  externalCode: string;
  status: string;
  index: number;
  optionGroupType: string;
  options: IfoodOption[];
}

// New interfaces for Merchant Management
export interface IfoodMerchant {
  id: string;
  name: string;
  corporateName: string;
}

export interface IfoodMerchantDetails {
  id: string;
  name: string;
  corporateName: string;
  description: string;
  averageTicket: number;
  exclusive: boolean;
  type: string;
  status: string;
  createdAt: string;
  address: {
    country: string;
    state: string;
    city: string;
    postalCode: string;
    district: string;
    street: string;
    number: string;
    latitude: number;
    longitude: number;
  };
}


export interface IfoodMerchantStatus {
  operation: string;
  salesChannel: string;
  available: boolean;
  state: 'OK' | 'WARNING' | 'ERROR' | 'CLOSED';
  reopenable?: {
    identifier: string;
    type: string;
    reopenable: boolean;
  };
  validations?: any[];
  message: {
    title: string;
    subtitle: string;
    description: string;
  };
}

export interface IfoodInterruption {
  id: string;
  start: string; // ISO Date
  end: string;   // ISO Date
  description: string;
}

export interface IfoodOpeningHours {
  dayOfWeek: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
  start: string; // "HH:mm:ss"
  duration: number; // minutes
}


@Injectable({
  providedIn: 'root'
})
export class IfoodMenuService {
  private settingsState = inject(SettingsStateService);
  private notificationService = inject(NotificationService);
  private authService = inject(AuthService);

  private companyProfile = this.settingsState.companyProfile;

  private async proxyRequest<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', endpoint: string, body: any = null, isImageUpload = false): Promise<T> {
    const merchantId = this.companyProfile()?.ifood_merchant_id;
    let fullEndpoint = endpoint;

    // Only try to replace {merchantId} if it's actually in the endpoint string
    if (endpoint.includes('{merchantId}')) {
        if (!merchantId) {
            throw new Error('O iFood Merchant ID precisa ser configurado para esta operação.');
        }
        fullEndpoint = endpoint.replace('{merchantId}', merchantId);
    }

    try {
      const response = await fetch('https://app.chefos.online/api/ifood-catalog', {
        method: 'POST', // The proxy itself is always called with POST
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, endpoint: fullEndpoint, payload: body, isImageUpload })
      });

      const responseText = await response.text();

      if (!response.ok) {
        let errorMessage = `Proxy error (${response.status})`;
        if (responseText) {
          try {
            const errorJson = JSON.parse(responseText);
            errorMessage = errorJson.message || JSON.stringify(errorJson.details || errorJson.error || responseText);
          } catch (e) {
            errorMessage = responseText;
          }
        }
        throw new Error(errorMessage);
      }
      
      if (response.status === 201 || response.status === 202 || response.status === 204) {
        return null as T;
      }

      return responseText ? JSON.parse(responseText) as T : null as T;

    } catch (error) {
      console.error(`[IfoodMenuService] Error calling proxy for ${method} ${fullEndpoint}:`, error);
      throw error;
    }
  }

  // --- Merchant Management ---
  
  async getMerchants(): Promise<IfoodMerchant[]> {
    return this.proxyRequest<IfoodMerchant[]>('GET', '/merchant/v1.0/merchants');
  }

  async getMerchantDetails(): Promise<IfoodMerchantDetails> {
    return this.proxyRequest<IfoodMerchantDetails>('GET', '/merchant/v1.0/merchants/{merchantId}');
  }

  async getMerchantStatus(): Promise<IfoodMerchantStatus[]> {
    return this.proxyRequest<IfoodMerchantStatus[]>('GET', '/merchant/v1.0/merchants/{merchantId}/status');
  }

  async getInterruptions(): Promise<IfoodInterruption[]> {
    return this.proxyRequest<IfoodInterruption[]>('GET', '/merchant/v1.0/merchants/{merchantId}/interruptions');
  }

  async createInterruption(interruption: { start: string; end: string; description: string }): Promise<IfoodInterruption> {
    return this.proxyRequest<IfoodInterruption>('POST', '/merchant/v1.0/merchants/{merchantId}/interruptions', interruption);
  }

  async deleteInterruption(interruptionId: string): Promise<void> {
    await this.proxyRequest<void>('DELETE', `/merchant/v1.0/merchants/{merchantId}/interruptions/${interruptionId}`);
  }

  async getOpeningHours(): Promise<IfoodOpeningHours[]> {
    const response = await this.proxyRequest<{ shifts: IfoodOpeningHours[] }>('GET', '/merchant/v1.0/merchants/{merchantId}/opening-hours');
    
    // Log the raw payload for debugging
    console.log('Raw opening hours payload from iFood:', JSON.stringify(response, null, 2));

    // The response is an object with a "shifts" property which is an array
    if (response && Array.isArray(response.shifts)) {
      return response.shifts;
    }
    
    // Handle cases where the merchant has NO opening hours set. The API might return 404 or an empty object/array.
    // If response is null (from a 204/404) or doesn't have the shifts array, return empty.
    return [];
  }

  async updateOpeningHours(openingHours: IfoodOpeningHours[]): Promise<void> {
    const merchantId = this.companyProfile()?.ifood_merchant_id;
    if (!merchantId) {
      throw new Error('O iFood Merchant ID precisa ser configurado para esta operação.');
    }
    await this.proxyRequest<void>('PUT', '/merchant/v1.0/merchants/{merchantId}/opening-hours', { 
      storeId: merchantId,
      shifts: openingHours 
    });
  }
  
  // --- Catalog Management ---

  async getCatalogs(): Promise<IfoodCatalog[]> {
    return this.proxyRequest<IfoodCatalog[]>('GET', '/catalog/v2.0/merchants/{merchantId}/catalogs');
  }

  async getCategories(catalogId: string): Promise<IfoodCategory[]> {
    const categories = await this.proxyRequest<any[]>('GET', `/catalog/v2.0/merchants/{merchantId}/catalogs/${catalogId}/categories?includeItems=true`);
    return (categories || []).map(category => ({
      id: category.id,
      name: category.name,
      status: category.status,
      index: category.index,
      items: (category.items || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        externalCode: item.externalCode,
        status: item.status,
        productId: item.productId,
        index: item.index,
        price: item.price,
        hasOptionGroups: item.hasOptionGroups,
        imagePath: item.imagePath,
        image: item.imagePath ? `https://static-images.ifood.com.br/image/upload/t_medium/pratos/${item.imagePath}` : undefined,
      })),
    }));
  }

  async getUnsellableItems(catalogId: string): Promise<{ categories: UnsellableCategory[] }> {
    return this.proxyRequest<{ categories: UnsellableCategory[] }>('GET', `/catalog/v2.0/merchants/{merchantId}/catalogs/${catalogId}/unsellableItems`);
  }

  async getCancellationReasons(orderId: string): Promise<IfoodCancellationReason[]> {
    const response = await this.proxyRequest<any[]>('GET', `/order/v1.0/orders/${orderId}/cancellationReasons`);
    return (response || []).map(r => ({ code: r.cancelCodeId, description: r.description }));
  }

  async createCategory(catalogId: string, name: string, index: number): Promise<{ id: string }> {
    return this.proxyRequest<{ id: string }>('POST', `/catalog/v2.0/merchants/{merchantId}/catalogs/${catalogId}/categories`, { name, status: 'AVAILABLE', template: 'DEFAULT', index });
  }

  async deleteCategory(catalogId: string, categoryId: string): Promise<void> {
    await this.proxyRequest<void>('DELETE', `/catalog/v2.0/merchants/{merchantId}/catalogs/${catalogId}/categories/${categoryId}`);
  }

  async syncItem(itemPayload: any, recipe: Recipe, syncHash: string): Promise<void> {
    const { item, products } = await this.proxyRequest<{ item: any, products: any[] }>('PUT', '/catalog/v2.0/merchants/{merchantId}/items', itemPayload);
    const userId = this.authService.currentUser()?.id;
    if (!userId || !item) throw new Error("User not found or invalid iFood response");
    const syncRecord = {
      recipe_id: recipe.id, user_id: userId, ifood_item_id: item.id, ifood_product_id: products[0].id,
      ifood_category_id: item.categoryId, last_sync_hash: syncHash, last_synced_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('ifood_menu_sync').upsert(syncRecord, { onConflict: 'recipe_id' });
    if (error) this.notificationService.show(`Item sincronizado, mas falha ao salvar estado.`, 'warning');
  }

  async patchItemPrice(externalCode: string, newPrice: number): Promise<void> {
    await this.proxyRequest<any>('PATCH', `/catalog/v2.0/merchants/{merchantId}/products/price`, [{ externalCode, price: { value: newPrice, originalValue: newPrice }, resources: ["ITEM"] }]);
  }

  async patchItemStatus(externalCode: string, status: 'AVAILABLE' | 'UNAVAILABLE'): Promise<void> {
    await this.proxyRequest<any>('PATCH', `/catalog/v2.0/merchants/{merchantId}/products/status`, [{ externalCode, status, resources: ["ITEM"] }]);
  }

  private async getFlatItem(itemId: string): Promise<any> {
    return this.proxyRequest<any>('GET', `/catalog/v2.0/merchants/{merchantId}/items/${itemId}/flat`);
  }

  private fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
  }

  async handleImageUpdate(item: IfoodItem, recipe: Recipe, file: File): Promise<void> {
    // 1. Upload the image to iFood's catalog image endpoint.
    const dataUrl = await this.fileToDataUrl(file);
    const uploadResponse = await this.proxyRequest<{ imagePath: string }>(
      'POST',
      '/catalog/v2.0/merchants/{merchantId}/image/upload',
      { image: dataUrl },
      true // This now triggers the JSON-based upload in the proxy
    );
    
    if (!uploadResponse?.imagePath) {
      throw new Error('O iFood não retornou um caminho para a imagem após o upload.');
    }
    const imagePath = uploadResponse.imagePath;

    // 2. Get the current full item structure from iFood.
    const fullItemPayload = await this.getFlatItem(item.id);
    if (!fullItemPayload || !fullItemPayload.products) {
      throw new Error('Não foi possível buscar os dados atuais do item no iFood para atualização.');
    }

    // 3. Modify the payload with the new imagePath.
    const productIndex = fullItemPayload.products.findIndex((p: any) => p.id === item.productId);
    if (productIndex === -1) {
      throw new Error('Produto correspondente não encontrado na estrutura do item do iFood.');
    }
    fullItemPayload.products[productIndex].imagePath = imagePath;

    // 4. Send the complete, updated structure back to iFood.
    const syncHash = `${recipe.name}|${recipe.description || ''}|${recipe.price.toFixed(2)}|${imagePath}`;
    await this.syncItem(fullItemPayload, recipe, syncHash);
  }

  async trackOrder(orderId: string): Promise<IfoodTrackingData> {
    return this.proxyRequest<IfoodTrackingData>('GET', `/logistics/v1.0/orders/${orderId}/tracking`);
  }

  // Option Group Management
  async getOptionGroups(includeOptions = true): Promise<IfoodOptionGroup[]> {
    const groups = await this.proxyRequest<any[]>('GET', `/catalog/v2.0/merchants/{merchantId}/optionGroups?includeOptions=${includeOptions}`);
    return (groups || []).map(group => ({
      ...group,
      options: (group.options || []).map((opt: any) => ({
        id: opt.id,
        name: opt.name,
        description: opt.description,
        externalCode: opt.externalCode,
        price: opt.price,
        status: opt.status,
        index: opt.index,
        productId: opt.productId
      }))
    }));
  }

  async updateOptionGroup(optionGroupId: string, name: string): Promise<any> {
    return this.proxyRequest<any>('PATCH', `/catalog/v2.0/merchants/{merchantId}/optionGroups/${optionGroupId}`, { name });
  }

  async deleteOptionGroup(optionGroupId: string): Promise<void> {
    await this.proxyRequest<void>('DELETE', `/catalog/v2.0/merchants/{merchantId}/optionGroups/${optionGroupId}`);
  }

  async updateOptionGroupStatus(optionGroupId: string, status: 'AVAILABLE' | 'UNAVAILABLE'): Promise<void> {
    await this.proxyRequest<void>('PATCH', `/catalog/v2.0/merchants/{merchantId}/optionGroups/${optionGroupId}/status`, { status });
  }

  // Option Management
  async createOption(optionGroupId: string, optionData: { name: string, externalCode: string, price: number }): Promise<any> {
    const payload = {
      status: "AVAILABLE",
      product: {
        name: optionData.name,
        externalCode: optionData.externalCode,
      },
      externalCode: optionData.externalCode,
      price: { value: optionData.price, originalValue: optionData.price },
      index: 0
    };
    return this.proxyRequest<any>('POST', `/catalog/v2.0/merchants/{merchantId}/optionGroups/${optionGroupId}/options`, payload);
  }

  async deleteOption(optionGroupId: string, productId: string): Promise<void> {
    await this.proxyRequest<void>('DELETE', `/catalog/v2.0/merchants/{merchantId}/optionGroups/${optionGroupId}/products/${productId}/option`);
  }

  async updateOptionPrice(optionId: string, price: number): Promise<any> {
    return this.proxyRequest<any>('PATCH', `/catalog/v2.0/merchants/{merchantId}/options/price`, { optionId, price: { value: price, originalValue: price } });
  }

  async updateOptionStatus(optionId: string, status: 'AVAILABLE' | 'UNAVAILABLE'): Promise<void> {
    await this.proxyRequest<void>('PATCH', `/catalog/v2.0/merchants/{merchantId}/options/status`, { optionId, status });
  }
}