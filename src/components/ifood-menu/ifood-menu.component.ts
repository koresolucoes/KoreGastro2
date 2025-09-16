import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { IfoodMenuService, IfoodCatalog, IfoodCategory, IfoodItem, UnsellableCategory } from '../../services/ifood-menu.service';
import { NotificationService } from '../../services/notification.service';
import { Recipe, Category } from '../../models/db.models';

type SyncStatus = 'synced' | 'unsynced' | 'modified' | 'error' | 'syncing';

interface MappedLocalItem {
  recipe: Recipe;
  categoryName: string;
  status: SyncStatus;
  errorMessage?: string;
}

@Component({
  selector: 'app-ifood-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ifood-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IfoodMenuComponent implements OnInit {
  private stateService = inject(SupabaseStateService);
  private ifoodMenuService = inject(IfoodMenuService);
  private notificationService = inject(NotificationService);

  isLoading = signal(true);
  view = signal<'sync' | 'unsellable'>('sync');

  // iFood Data
  ifoodCatalogs = signal<IfoodCatalog[]>([]);
  selectedCatalogId = signal<string | null>(null);
  ifoodCategories = signal<IfoodCategory[]>([]);
  unsellableCategories = signal<UnsellableCategory[]>([]);
  ifoodItemsByExternalCode = computed(() => {
    const map = new Map<string, IfoodItem>();
    for (const category of this.ifoodCategories()) {
      for (const item of category.items) {
        map.set(item.externalCode, item);
      }
    }
    return map;
  });
  
  // Local Data
  localCategoriesMap = computed(() => new Map(this.stateService.categories().map(c => [c.id, c.name])));
  localItemsToSync = computed<MappedLocalItem[]>(() => {
    const localRecipes = this.stateService.recipes().filter(r => !r.is_sub_recipe && r.is_available);
    const categoriesMap = this.localCategoriesMap();
    const ifoodItemsMap = this.ifoodItemsByExternalCode();

    return localRecipes.map(recipe => {
      const externalCode = recipe.external_code || recipe.id;
      const ifoodItem = ifoodItemsMap.get(externalCode);
      let status: SyncStatus = 'unsynced';

      if (ifoodItem) {
        // Simple comparison for modification check
        const priceMatches = ifoodItem.price.value === recipe.price;
        const nameMatches = ifoodItem.name === recipe.name;
        const descriptionMatches = ifoodItem.description === (recipe.description || null);

        if (priceMatches && nameMatches && descriptionMatches) {
          status = 'synced';
        } else {
          status = 'modified';
        }
      }

      return {
        recipe,
        categoryName: categoriesMap.get(recipe.category_id) || 'Sem Categoria',
        status: status,
      };
    });
  });

  ngOnInit(): void {
    this.loadInitialData();
  }

  async loadInitialData() {
    this.isLoading.set(true);
    try {
      const catalogs = await this.ifoodMenuService.getCatalogs();
      this.ifoodCatalogs.set(catalogs);

      if (catalogs.length > 0) {
        const defaultCatalog = catalogs.find(c => c.context.includes('DEFAULT')) || catalogs[0];
        this.selectedCatalogId.set(defaultCatalog.catalogId);
        await this.loadCatalogData(defaultCatalog.catalogId);
      } else {
         this.notificationService.show('Nenhum catálogo iFood encontrado.', 'warning');
      }
    } catch (error: any) {
      this.notificationService.show(`Erro ao buscar catálogos iFood: ${error.message}`, 'error');
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadCatalogData(catalogId: string) {
    this.isLoading.set(true);
    try {
        const [categories, unsellable] = await Promise.all([
            this.ifoodMenuService.getCategories(catalogId),
            this.ifoodMenuService.getUnsellableItems(catalogId)
        ]);
        this.ifoodCategories.set(categories);
        this.unsellableCategories.set(unsellable.categories);
    } catch (error: any) {
        this.notificationService.show(`Erro ao buscar dados do catálogo: ${error.message}`, 'error');
    } finally {
        this.isLoading.set(false);
    }
  }

  async syncItem(item: MappedLocalItem) {
    const catalogId = this.selectedCatalogId();
    if (!catalogId) {
      this.notificationService.show('Nenhum catálogo selecionado.', 'error');
      return;
    }
    
    this.updateItemStatus(item.recipe.id, 'syncing');

    try {
      const recipe = item.recipe;
      const categoryName = this.localCategoriesMap().get(recipe.category_id);
      if (!categoryName) {
        throw new Error('Receita sem categoria válida no ChefOS.');
      }
      
      let ifoodCategoryId = this.ifoodCategories().find(c => c.name.toLowerCase() === categoryName.toLowerCase())?.id;
      
      if (!ifoodCategoryId) {
        const newCategory = await this.ifoodMenuService.createCategory(catalogId, categoryName);
        ifoodCategoryId = newCategory.id;
        // Refetch categories to update the UI state
        const updatedCategories = await this.ifoodMenuService.getCategories(catalogId);
        this.ifoodCategories.set(updatedCategories);
      }
      
      const payload = this.mapRecipeToIfoodPayload(recipe, ifoodCategoryId);
      await this.ifoodMenuService.syncItem(payload);
      
      this.notificationService.show(`'${recipe.name}' sincronizado com sucesso!`, 'success');
      // Optimistically update status
      this.updateItemStatus(item.recipe.id, 'synced');
      // Refetch for consistency
      this.loadCatalogData(catalogId);

    } catch (error: any) {
      this.notificationService.show(`Erro ao sincronizar '${item.recipe.name}': ${error.message}`, 'error');
      this.updateItemStatus(item.recipe.id, 'error', error.message);
    }
  }

  private updateItemStatus(recipeId: string, status: SyncStatus, errorMessage?: string) {
      // This is a temporary in-memory update for the UI feedback.
      // The `localItemsToSync` computed will recalculate the correct state on the next data refresh.
      const items = document.querySelectorAll(`[data-recipe-id="${recipeId}"] .status-indicator`);
      items.forEach(el => {
        el.className = `status-indicator h-3 w-3 rounded-full ${this.getStatusClass(status)}`;
      });
       const button = document.querySelector(`[data-recipe-id="${recipeId}"] button`) as HTMLButtonElement;
       if(button) {
          button.disabled = status === 'syncing';
          button.textContent = status === 'syncing' ? 'Sincronizando...' : 'Sincronizar';
       }
  }
  
  private mapRecipeToIfoodPayload(recipe: Recipe, categoryId: string): any {
    const externalCode = recipe.external_code || recipe.id;
    // For now, we use a consistent UUID based on the recipe ID for idempotency.
    // A better approach in a full implementation would be to store these IDs.
    const productId = `00000000-0000-4000-8000-${recipe.id.replace(/-/g, '').substring(0, 12)}`;
    const itemId = `11111111-1111-4111-8111-${recipe.id.replace(/-/g, '').substring(0, 12)}`;
    
    return {
      item: {
        id: itemId,
        type: "DEFAULT",
        categoryId: categoryId,
        status: "AVAILABLE",
        price: {
          value: recipe.price,
          originalValue: recipe.price 
        },
        externalCode: externalCode,
        index: 0,
        productId: productId,
      },
      products: [
        {
          id: productId,
          externalCode: externalCode,
          name: recipe.name,
          description: recipe.description || '',
        }
      ],
      optionGroups: [],
      options: []
    };
  }
  
  getStatusClass(status: SyncStatus): string {
    switch(status) {
      case 'synced': return 'bg-green-500';
      case 'unsynced': return 'bg-blue-500';
      case 'modified': return 'bg-yellow-500';
      case 'error': return 'bg-red-500';
      case 'syncing': return 'bg-gray-500 animate-pulse';
      default: return 'bg-gray-400';
    }
  }
}
