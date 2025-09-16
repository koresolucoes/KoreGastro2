import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { IfoodMenuService, IfoodCategory } from '../../services/ifood-menu.service';
import { NotificationService } from '../../services/notification.service';
import { Recipe } from '../../models/db.models';

interface EnrichedRecipe extends Recipe {
    syncStatus: 'synced' | 'unsynced';
    ifoodCategoryId?: string;
    ifoodItemId?: string;
}

@Component({
  selector: 'app-ifood-menu',
  standalone: true,
  imports: [CommonModule, CurrencyPipe],
  template: `
    <div class="p-4 md:p-6 bg-gray-900 text-gray-200 h-full overflow-hidden flex flex-col">
      <!-- Header -->
      <header class="flex-shrink-0 flex items-center justify-between pb-4 border-b border-gray-700">
        <div>
          <h1 class="text-2xl font-bold text-white">Gerenciador de Cardápio iFood</h1>
          <p class="text-sm text-gray-400">Vincule seus pratos locais aos itens do seu cardápio no iFood.</p>
        </div>
        <button (click)="loadCatalog()" class="p-2 rounded-md hover:bg-gray-700 disabled:opacity-50" [disabled]="isLoading()">
          <svg class="w-6 h-6" [class.animate-spin]="isLoading()" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0011.664 0l3.18-3.185m-3.18 3.180v4.992m0 0H9.345m-4.993 0l3.181-3.182a8.25 8.25 0 0111.664 0l3.18 3.185" />
          </svg>
        </button>
      </header>

      @if (isLoading()) {
        <div class="flex-grow flex items-center justify-center">
          <div class="text-center">
            <svg class="animate-spin h-8 w-8 text-white mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p class="mt-2 text-gray-400">Carregando cardápio do iFood...</p>
          </div>
        </div>
      } @else {
        <!-- Main Content Grid -->
        <div class="flex-grow grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 overflow-hidden">
          <!-- Left Panel: Local Recipes -->
          <div class="flex flex-col bg-gray-800 rounded-lg overflow-hidden">
            <h2 class="text-lg font-semibold p-4 border-b border-gray-700">Pratos Locais Não Vinculados</h2>
            <div class="overflow-y-auto p-4 space-y-2">
              @for (recipe of unlinkedRecipes(); track recipe.id) {
                <div 
                  class="p-3 rounded-md bg-gray-700 border border-gray-600 cursor-pointer hover:bg-gray-600"
                  [class.ring-2]="linkingRecipe()?.id === recipe.id"
                  [class.ring-blue-500]="linkingRecipe()?.id === recipe.id"
                  (click)="startLinking(recipe)">
                  <div class="flex justify-between items-center">
                    <span class="font-medium">{{ recipe.name }}</span>
                    <span class="text-sm text-gray-400">{{ recipe.price | currency:'BRL' }}</span>
                  </div>
                </div>
              } @empty {
                <div class="text-center text-gray-500 py-8">
                  <p>Todos os pratos estão vinculados!</p>
                </div>
              }
            </div>
          </div>

          <!-- Right Panel: iFood Catalog -->
          <div class="flex flex-col bg-gray-800 rounded-lg overflow-hidden">
            <div class="flex-shrink-0 p-4 border-b border-gray-700 flex justify-between items-center">
                <h2 class="text-lg font-semibold">Cardápio no iFood</h2>
                @if(linkingRecipe()) {
                    <button (click)="cancelLinking()" class="text-sm text-red-400 hover:text-red-300">Cancelar Vínculo</button>
                }
            </div>
            <div class="overflow-y-auto p-4 space-y-4">
              @for (category of ifoodCatalogWithRecipes(); track category.id) {
                <div class="bg-gray-700/50 rounded-md">
                  <div 
                    class="p-3 font-semibold border border-transparent rounded-t-md"
                    [class.border-blue-500]="linkingRecipe()"
                    [class.bg-blue-900/50]="linkingRecipe()"
                    [class.cursor-pointer]="linkingRecipe()"
                    [class.hover:bg-blue-900]="linkingRecipe()"
                    (click)="linkingRecipe() && linkRecipeToCategory(category.id)">
                    {{ category.name }}
                    @if(linkingRecipe()) {
                        <span class="text-xs font-normal text-blue-300 ml-2">(Clique para adicionar "{{ linkingRecipe()?.name }}" aqui)</span>
                    }
                  </div>
                  <div class="p-3 space-y-2">
                    @for (item of category.items; track item.id) {
                      <div class="p-3 rounded-md bg-gray-700 border border-gray-600">
                        <div class="flex justify-between items-start">
                          <div>
                            <p class="font-medium">{{ item.name }}</p>
                            @if(item.linkedRecipe) {
                              <div class="text-xs text-green-400 flex items-center mt-1">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3 mr-1">
                                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                                </svg>
                                Vinculado a: {{ item.linkedRecipe.name }}
                              </div>
                            }
                          </div>
                          <div class="flex items-center space-x-2 flex-shrink-0">
                            <span class="text-sm text-gray-400">{{ item.price.value / 100 | currency:'BRL' }}</span>
                            @if (item.linkedRecipe) {
                               <button (click)="syncRecipe(item.linkedRecipe)" [disabled]="operatingOnRecipeId() === item.linkedRecipe.id" class="p-1 rounded hover:bg-gray-600 disabled:opacity-50">
                                 <svg [class.animate-spin]="operatingOnRecipeId() === item.linkedRecipe.id" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0011.664 0l3.18-3.185m-3.18 3.180v4.992m0 0H9.345m-4.993 0l3.181-3.182a8.25 8.25 0 0111.664 0l3.18 3.185" /></svg>
                               </button>
                               <button (click)="unlinkRecipe(item.linkedRecipe)" [disabled]="operatingOnRecipeId() === item.linkedRecipe.id" class="p-1 rounded hover:bg-gray-600 text-red-400 disabled:opacity-50">
                                 <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                               </button>
                            }
                          </div>
                        </div>
                      </div>
                    } @empty {
                      <p class="text-sm text-gray-500 italic px-3">Nenhum item nesta categoria.</p>
                    }
                  </div>
                </div>
              } @empty {
                 <div class="text-center text-gray-500 py-8">
                  <p>Nenhuma categoria encontrada no iFood.</p>
                  <p class="text-sm mt-1">Verifique seu ID de Merchant nas configurações.</p>
                </div>
              }
            </div>
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
  ifoodCatalog = signal<IfoodCategory[]>([]);
  syncData = this.stateService.ifoodMenuSync;
  
  // UI State
  linkingRecipe = signal<EnrichedRecipe | null>(null);
  operatingOnRecipeId = signal<string | null>(null);

  recipes = computed<EnrichedRecipe[]>(() => {
    const syncMap = new Map(this.syncData().map(s => [s.recipe_id, s]));
    return this.stateService.recipes()
      .filter(r => !r.is_sub_recipe && r.is_available)
      .map(recipe => {
        const syncInfo = syncMap.get(recipe.id);
        return {
          ...recipe,
          syncStatus: syncInfo ? 'synced' : 'unsynced',
          ifoodCategoryId: syncInfo?.ifood_category_id,
          ifoodItemId: syncInfo?.ifood_item_id,
        };
      });
  });

  unlinkedRecipes = computed(() => this.recipes().filter(r => r.syncStatus === 'unsynced'));
  
  ifoodCatalogWithRecipes = computed(() => {
    const catalog = this.ifoodCatalog();
    const recipes = this.recipes();
    const recipeMap = new Map(recipes.map(r => [r.ifoodItemId, r]));
    
    return catalog.map(category => ({
      ...category,
      items: category.items.map(item => ({
        ...item,
        linkedRecipe: recipeMap.get(item.id) || null
      }))
    }));
  });

  constructor() {
    this.loadCatalog();
  }

  async loadCatalog() {
    this.isLoading.set(true);
    try {
      const catalog = await this.ifoodMenuService.getCatalog();
      this.ifoodCatalog.set(catalog);
    } catch(error: any) {
      this.notificationService.alert(`Erro ao carregar cardápio do iFood: ${error.message}`);
    } finally {
      this.isLoading.set(false);
    }
  }

  startLinking(recipe: EnrichedRecipe) {
    this.linkingRecipe.set(recipe);
  }

  cancelLinking() {
    this.linkingRecipe.set(null);
  }

  async linkRecipeToCategory(categoryId: string) {
    const recipe = this.linkingRecipe();
    if (!recipe) return;

    this.operatingOnRecipeId.set(recipe.id);
    this.cancelLinking();

    const { success, error } = await this.ifoodMenuService.syncRecipe(recipe, categoryId);

    if (success) {
      this.notificationService.show('Prato vinculado e sincronizado com o iFood!', 'success');
      await this.loadCatalog();
    } else {
      this.notificationService.alert(`Erro ao vincular: ${error?.message || 'Erro desconhecido'}`);
    }
    this.operatingOnRecipeId.set(null);
  }

  async syncRecipe(recipe: EnrichedRecipe) {
    if (!recipe.ifoodCategoryId) {
        this.notificationService.alert('Categoria do iFood não encontrada para sincronizar.');
        return;
    }

    this.operatingOnRecipeId.set(recipe.id);
    const { success, error } = await this.ifoodMenuService.syncRecipe(recipe, recipe.ifoodCategoryId);

    if (success) {
      this.notificationService.show('Prato sincronizado com o iFood!', 'success');
      await this.loadCatalog();
    } else {
      this.notificationService.alert(`Erro ao sincronizar: ${error?.message || 'Erro desconhecido'}`);
    }
    this.operatingOnRecipeId.set(null);
  }

  async unlinkRecipe(recipe: EnrichedRecipe) {
    const confirmed = await this.notificationService.confirm(`Tem certeza que deseja desvincular e remover "${recipe.name}" do iFood? Esta ação não pode ser desfeita.`);
    if (!confirmed) return;
    
    this.operatingOnRecipeId.set(recipe.id);
    const { success, error } = await this.ifoodMenuService.unlinkRecipe(recipe.id);

    if (success) {
      this.notificationService.show('Prato desvinculado com sucesso!', 'success');
      await this.loadCatalog();
    } else {
      this.notificationService.alert(`Erro ao desvincular: ${error?.message || 'Erro desconhecido'}`);
    }
    this.operatingOnRecipeId.set(null);
  }
}
