import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { IfoodMenuService, IfoodCategory, IfoodProduct } from '../../services/ifood-menu.service';
import { NotificationService } from '../../services/notification.service';
import { Recipe, Category, IfoodMenuSync } from '../../models/db.models';
import { supabase } from '../../services/supabase-client';

interface ChefosCategory extends Category {
    recipes: Recipe[];
}

interface IfoodCategoryWithSync extends IfoodCategory {
    products: (IfoodProduct & { chefosRecipeId: string | null })[];
    isSynced: boolean;
    chefosCategoryId: string | null;
}

@Component({
    selector: 'app-ifood-menu',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="p-4 md:p-6 bg-gray-900 text-gray-200 h-full overflow-y-auto">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-3xl font-bold">Sincronização com Cardápio iFood</h1>
        <button (click)="loadIfoodMenu()" [disabled]="isLoading()" class="p-2 rounded-md hover:bg-gray-700 disabled:opacity-50">
          <svg class="w-6 h-6" [class.animate-spin]="isLoading()" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0011.664 0l3.18-3.185m-3.181 9.865a8.25 8.25 0 01-11.664 0l-3.18-3.185m3.181-9.865l-3.18-3.18a8.25 8.25 0 0111.664 0l3.18 3.18" />
          </svg>
        </button>
      </div>

      @if (!ifoodMerchantId()) {
        <div class="bg-yellow-900/50 border border-yellow-700 text-yellow-200 p-4 rounded-lg">
          <p class="font-bold">Configuração Necessária</p>
          <p>O ID do Comerciante iFood (Merchant ID) não foi encontrado. Por favor, adicione-o em <span class="font-semibold">Configurações > Empresa</span> para habilitar a sincronização.</p>
        </div>
      } @else {
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- ChefOS Menu -->
          <div>
            <h2 class="text-xl font-semibold mb-4 text-blue-400">Cardápio ChefOS</h2>
            @if (chefosMenu().length === 0) {
              <p class="text-gray-500">Nenhuma categoria ou item no seu cardápio. Crie-os em Fichas Técnicas e Configurações.</p>
            }
            @for (category of chefosMenu(); track category.id) {
              <div class="bg-gray-800 rounded-lg p-4 mb-4">
                <div class="flex justify-between items-center">
                  <h3 class="font-bold text-lg">{{ category.name }}</h3>
                  <button (click)="syncCategory(category)" [disabled]="isLoading()" class="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 rounded-md disabled:bg-blue-800 disabled:cursor-not-allowed">
                    Sincronizar Categoria
                  </button>
                </div>
                <ul class="mt-3 space-y-2">
                  @for (recipe of category.recipes; track recipe.id) {
                    <li class="flex justify-between items-center text-sm p-2 rounded-md bg-gray-700/50">
                      <span>{{ recipe.name }}</span>
                      @if (syncDataMap().has(recipe.id)) {
                        <span class="text-green-400 text-xs font-semibold flex items-center">
                          <svg class="w-4 h-4 mr-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" /></svg>
                          Sincronizado
                        </span>
                      }
                    </li>
                  }
                </ul>
              </div>
            }
          </div>

          <!-- iFood Menu -->
          <div>
            <h2 class="text-xl font-semibold mb-4 text-green-400">Cardápio iFood</h2>
            @if (isLoading()) {
              <p class="text-gray-500">Carregando cardápio do iFood...</p>
            } @else if (ifoodMenu().length === 0) {
              <p class="text-gray-500">Nenhuma categoria encontrada no iFood. Sincronize uma categoria do ChefOS para começar.</p>
            }
            @for (ifoodCategory of ifoodMenu(); track ifoodCategory.id) {
              <div class="bg-gray-800 rounded-lg p-4 mb-4">
                <h3 class="font-bold text-lg">{{ ifoodCategory.name }}</h3>
                @if (!ifoodCategory.isSynced) {
                  <p class="text-xs text-yellow-400">Esta categoria não está vinculada a uma categoria do ChefOS.</p>
                }
                <div class="mt-3 space-y-2">
                  <h4 class="text-sm font-semibold text-gray-400">Itens Sincronizados</h4>
                  @if (ifoodCategory.products.length > 0) {
                    <ul class="space-y-2">
                      @for (product of ifoodCategory.products; track product.id) {
                        <li class="flex justify-between items-center text-sm p-2 rounded-md bg-gray-700/50">
                          <span>{{ product.name }}</span>
                          @if(product.chefosRecipeId) {
                            <button (click)="unlinkRecipe(product.chefosRecipeId, ifoodCategory)" [disabled]="isLoading()" class="px-2 py-0.5 text-xs bg-red-600 hover:bg-red-500 rounded-md disabled:bg-red-800">
                              Desvincular
                            </button>
                          }
                        </li>
                      }
                    </ul>
                  } @else {
                    <p class="text-xs text-gray-500">Nenhum item nesta categoria.</p>
                  }
                  
                  @if (ifoodCategory.isSynced && ifoodCategory.chefosCategoryId) {
                    <div class="mt-4 pt-4 border-t border-gray-700">
                      <h4 class="text-sm font-semibold text-gray-400 mb-2">Adicionar itens do ChefOS a esta categoria:</h4>
                      <ul class="space-y-2">
                        @for (recipe of chefosMenu().find(c => c.id === ifoodCategory.chefosCategoryId)?.recipes; track recipe.id) {
                          @if (!isRecipeSyncedToCategory(recipe, ifoodCategory)) {
                            <li class="flex justify-between items-center text-sm p-2 rounded-md bg-gray-900/50">
                              <span>{{ recipe.name }}</span>
                              <button (click)="syncRecipe(recipe, ifoodCategory)" [disabled]="isLoading()" class="px-2 py-0.5 text-xs bg-green-600 hover:bg-green-500 rounded-md disabled:bg-green-800">
                                Adicionar
                              </button>
                            </li>
                          }
                        }
                      </ul>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        </div>
      }
    </div>
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IfoodMenuComponent {
    private stateService = inject(SupabaseStateService);
    private ifoodMenuService = inject(IfoodMenuService);
    private notificationService = inject(NotificationService);

    isLoading = signal(true);
    ifoodCategories = signal<IfoodCategory[]>([]);
    
    companyProfile = this.stateService.companyProfile;
    ifoodMerchantId = computed(() => this.companyProfile()?.ifood_merchant_id);
    
    syncDataMap = computed(() => new Map(this.stateService.ifoodMenuSync().map(s => [s.recipe_id, s])));

    chefosMenu = computed<ChefosCategory[]>(() => {
        const categories = this.stateService.categories();
        const recipes = this.stateService.recipes().filter(r => r.is_available && !r.is_sub_recipe);
        
        return categories.map(cat => ({
            ...cat,
            recipes: recipes.filter(r => r.category_id === cat.id)
        })).filter(cat => cat.recipes.length > 0);
    });
    
    ifoodMenu = computed<IfoodCategoryWithSync[]>(() => {
        const categories = this.ifoodCategories();
        const syncMap = this.syncDataMap();

        const ifoodProductIdToRecipeIdMap = new Map<string, string>();
        for (const sync of syncMap.values()) {
            ifoodProductIdToRecipeIdMap.set(sync.ifood_product_id, sync.recipe_id);
        }

        return categories.map(cat => {
            const products = (cat.items || []).map(prod => ({
                ...prod,
                chefosRecipeId: ifoodProductIdToRecipeIdMap.get(prod.id) || null
            }));

            const chefosCatMatch = this.stateService.categories().find(c => c.id === cat.externalCode);

            return {
                ...cat,
                products: products,
                isSynced: !!chefosCatMatch,
                chefosCategoryId: chefosCatMatch?.id || null
            };
        });
    });

    constructor() {
        this.loadIfoodMenu();
    }
    
    async loadIfoodMenu() {
        this.isLoading.set(true);
        const merchantId = this.ifoodMerchantId();
        if (!merchantId) {
            this.notificationService.show('iFood Merchant ID não configurado em Configurações > Empresa.', 'warning');
            this.isLoading.set(false);
            return;
        }

        try {
            const categories = await this.ifoodMenuService.getCategories(merchantId);
            this.ifoodCategories.set(categories || []);
        } catch (error) {
            // Service already shows a toast
        } finally {
            this.isLoading.set(false);
        }
    }

    async syncCategory(category: ChefosCategory) {
        const merchantId = this.ifoodMerchantId();
        if (!merchantId) return;

        this.isLoading.set(true);
        try {
            await this.ifoodMenuService.upsertCategory(merchantId, {
                name: category.name,
                externalCode: category.id,
                sequence: 0
            });
            this.notificationService.show(`Categoria "${category.name}" sincronizada.`, 'success');
            await this.loadIfoodMenu();
        } finally {
            this.isLoading.set(false);
        }
    }

    async syncRecipe(recipe: Recipe, ifoodCategory: IfoodCategoryWithSync) {
        const merchantId = this.ifoodMerchantId();
        if (!merchantId) return;

        this.isLoading.set(true);
        try {
            const productPayload = {
                name: recipe.name,
                description: recipe.description || recipe.name,
                externalCode: recipe.id,
                price: {
                    value: Math.round(recipe.price * 100)
                },
                sequence: 0
            };
            await this.ifoodMenuService.upsertProduct(merchantId, productPayload);
            
            const upsertedProduct = await this.ifoodMenuService.getProductByExternalCode(merchantId, recipe.id);
            if (!upsertedProduct) {
                throw new Error('Falha ao recuperar o produto sincronizado do iFood.');
            }

            await this.ifoodMenuService.linkProductToCategory(merchantId, ifoodCategory.id, upsertedProduct.id, 0, productPayload.price.value);
            
            const syncRecord: IfoodMenuSync = {
                recipe_id: recipe.id,
                user_id: this.stateService.currentUser()!.id,
                ifood_item_id: 'unknown',
                ifood_product_id: upsertedProduct.id,
                ifood_category_id: ifoodCategory.id,
                last_synced_at: new Date().toISOString(),
                last_sync_hash: '',
                created_at: new Date().toISOString()
            };

            await this.saveSyncRecord(syncRecord);
            
            this.notificationService.show(`Produto "${recipe.name}" sincronizado.`, 'success');
            await this.loadIfoodMenu();
        } catch(error) {
            this.notificationService.show(`Erro ao sincronizar produto: ${error instanceof Error ? error.message : 'Erro desconhecido'}`, 'error');
        } finally {
            this.isLoading.set(false);
        }
    }

    async unlinkRecipe(recipeId: string, ifoodCategory: IfoodCategoryWithSync) {
        const merchantId = this.ifoodMerchantId();
        const syncInfo = this.syncDataMap().get(recipeId);
        if (!merchantId || !syncInfo) return;

        this.isLoading.set(true);
        try {
            await this.ifoodMenuService.unlinkProductFromCategory(merchantId, ifoodCategory.id, syncInfo.ifood_product_id);
            await this.deleteSyncRecord(recipeId);
            this.notificationService.show(`Produto desvinculado.`, 'success');
            await this.loadIfoodMenu();
        } finally {
            this.isLoading.set(false);
        }
    }
    
    private async saveSyncRecord(record: IfoodMenuSync) {
        const { error } = await supabase
            .from('ifood_menu_sync')
            .upsert(record, { onConflict: 'recipe_id, user_id' });
        if (error) {
            this.notificationService.show(`Erro ao salvar status da sincronização: ${error.message}`, 'error');
        } else {
            // Manually trigger a refetch of sync data
            await this.stateService.refetchSimpleTable('ifood_menu_sync', '*', this.stateService.ifoodMenuSync);
        }
    }

    private async deleteSyncRecord(recipeId: string) {
        const { error } = await supabase
            .from('ifood_menu_sync')
            .delete()
            .eq('recipe_id', recipeId);
        if (error) {
            this.notificationService.show(`Erro ao remover status da sincronização: ${error.message}`, 'error');
        } else {
            await this.stateService.refetchSimpleTable('ifood_menu_sync', '*', this.stateService.ifoodMenuSync);
        }
    }

    isRecipeSyncedToCategory(recipe: Recipe, ifoodCategory: IfoodCategoryWithSync): boolean {
        const syncInfo = this.syncDataMap().get(recipe.id);
        if (!syncInfo) return false;
        return ifoodCategory.products.some(p => p.id === syncInfo.ifood_product_id);
    }
}
