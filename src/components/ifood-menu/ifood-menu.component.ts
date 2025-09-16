import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { IfoodMenuService, IfoodCatalog, IfoodCategory, IfoodItem, UnsellableCategory } from '../../services/ifood-menu.service';
import { NotificationService } from '../../services/notification.service';
import { Recipe, Category } from '../../models/db.models';
import { RouterLink } from '@angular/router';

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
  imports: [CommonModule, RouterLink],
  templateUrl: './ifood-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IfoodMenuComponent implements OnInit {
  private stateService = inject(SupabaseStateService);
  private ifoodMenuService = inject(IfoodMenuService);
  private notificationService = inject(NotificationService);

  isLoading = signal(true);
  view = signal<'sync' | 'unsellable' | 'live'>('sync');

  // iFood Data
  ifoodCatalogs = signal<IfoodCatalog[]>([]);
  selectedCatalogId = signal<string | null>(null);
  ifoodCategories = signal<IfoodCategory[]>([]);
  unsellableCategories = signal<UnsellableCategory[]>([]);
  ifoodItemsByExternalCode = computed(() => {
    const map = new Map<string, IfoodItem>();
    for (const category of this.ifoodCategories()) {
      for (const item of category.items) {
        if (item.externalCode) {
           map.set(item.externalCode, item);
        }
      }
    }
    return map;
  });

  // Local Data & Sync State
  ifoodSyncData = this.stateService.ifoodMenuSync;
  syncDataMap = computed(() => new Map(this.ifoodSyncData().map(s => [s.recipe_id, s])));
  syncingItems = signal<Set<string>>(new Set());

  localCategoriesMap = computed(() => new Map(this.stateService.categories().map(c => [c.id, c.name])));
  localRecipesByExternalCode = computed(() => {
    const map = new Map<string, Recipe>();
    this.stateService.recipes().forEach(r => {
      if (r.external_code) {
        map.set(r.external_code, r);
      }
    });
    return map;
  });
  
  // Modal states for live editing
  isPriceModalOpen = signal(false);
  editingPriceItem = signal<IfoodItem | null>(null);
  newPrice = signal<number>(0);
  isChangingPrice = signal(false);

  isStatusModalOpen = signal(false);
  editingStatusItem = signal<IfoodItem | null>(null);
  newStatus = signal<'AVAILABLE' | 'UNAVAILABLE'>('AVAILABLE');
  isChangingStatus = signal(false);
  
  isCategoryModalOpen = signal(false);
  newCategoryName = signal('');
  isCreatingCategory = signal(false);


  private createSyncHash(recipe: Recipe): string {
    return `${recipe.name}|${recipe.description || ''}|${recipe.price.toFixed(2)}`;
  }

  private localItemsWithSyncStatus = computed<MappedLocalItem[]>(() => {
    const localRecipes = this.stateService.recipes().filter(r => !r.is_sub_recipe && r.is_available);
    const categoriesMap = this.localCategoriesMap();
    const syncMap = this.syncDataMap();
    const syncing = this.syncingItems();

    return localRecipes.map(recipe => {
        let status: SyncStatus = 'unsynced';
        
        if (syncing.has(recipe.id)) {
            status = 'syncing';
        } else {
            const syncInfo = syncMap.get(recipe.id);
            if (syncInfo) {
                const currentHash = this.createSyncHash(recipe);
                if (currentHash === syncInfo.last_sync_hash) {
                    status = 'synced';
                } else {
                    status = 'modified';
                }
            }
        }

        return {
            recipe,
            categoryName: categoriesMap.get(recipe.category_id) || 'Sem Categoria',
            status: status,
        };
    });
  });

  localItemsToSync = computed<MappedLocalItem[]>(() => 
    this.localItemsWithSyncStatus().filter(item => !!item.recipe.external_code)
  );
  
  unsyncableLocalItems = computed<MappedLocalItem[]>(() => 
    this.localItemsWithSyncStatus().filter(item => !item.recipe.external_code)
  );

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
    
    this.syncingItems.update(s => new Set(s).add(item.recipe.id));

    try {
      const recipe = item.recipe;
      const categoryName = item.categoryName;
      if (!categoryName || categoryName === 'Sem Categoria') {
        throw new Error('Receita sem categoria válida no ChefOS.');
      }
      
      let ifoodCategoryId = this.ifoodCategories().find(c => c.name.toLowerCase() === categoryName.toLowerCase())?.id;
      
      if (!ifoodCategoryId) {
        const newCategory = await this.ifoodMenuService.createCategory(catalogId, categoryName);
        ifoodCategoryId = newCategory.id;
        await this.refreshCatalogData();
      }
      
      const payload = this.mapRecipeToIfoodPayload(recipe, ifoodCategoryId);
      const syncHash = this.createSyncHash(recipe);
      await this.ifoodMenuService.syncItem(payload, recipe, syncHash);
      
      this.notificationService.show(`'${recipe.name}' sincronizado com sucesso!`, 'success');
    } catch (error: any) {
      this.notificationService.show(`Erro ao sincronizar '${item.recipe.name}': ${error.message}`, 'error');
    } finally {
        this.syncingItems.update(s => {
            const newSet = new Set(s);
            newSet.delete(item.recipe.id);
            return newSet;
        });
    }
  }
  
  private mapRecipeToIfoodPayload(recipe: Recipe, categoryId: string): any {
    const externalCode = recipe.external_code!;
    const syncInfo = this.syncDataMap().get(recipe.id);
    
    // Generate deterministic UUIDs from the recipe ID for idempotency, if no sync info exists.
    const productId = syncInfo?.ifood_product_id || `00000000-0000-4000-8000-${recipe.id.replace(/-/g, '').substring(0, 12)}`;
    const itemId = syncInfo?.ifood_item_id || `11111111-1111-4111-8111-${recipe.id.replace(/-/g, '').substring(0, 12)}`;
    
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
  
  // --- Live Editing Methods ---
  openPriceModal(item: IfoodItem) {
    this.editingPriceItem.set(item);
    this.newPrice.set(item.price.value);
    this.isPriceModalOpen.set(true);
  }
  closePriceModal() { this.isPriceModalOpen.set(false); }

  async savePrice() {
    const item = this.editingPriceItem();
    const catalogId = this.selectedCatalogId();
    if (!item || !catalogId) return;

    this.isChangingPrice.set(true);
    try {
      await this.ifoodMenuService.patchItemPrice(item.id, catalogId, this.newPrice());
      this.notificationService.show('Preço atualizado no iFood!', 'success');
      await this.refreshCatalogData();
      this.closePriceModal();
    } catch (error: any) {
      this.notificationService.show(`Erro ao alterar preço: ${error.message}`, 'error');
    } finally {
      this.isChangingPrice.set(false);
    }
  }
  
  openStatusModal(item: IfoodItem) {
    this.editingStatusItem.set(item);
    this.newStatus.set(item.status as 'AVAILABLE' | 'UNAVAILABLE');
    this.isStatusModalOpen.set(true);
  }
  closeStatusModal() { this.isStatusModalOpen.set(false); }
  
  async saveStatus() {
    const item = this.editingStatusItem();
    const catalogId = this.selectedCatalogId();
    if (!item || !catalogId) return;

    this.isChangingStatus.set(true);
    try {
      await this.ifoodMenuService.patchItemStatus(item.id, catalogId, this.newStatus());
      this.notificationService.show('Status atualizado no iFood!', 'success');
      await this.refreshCatalogData();
      this.closeStatusModal();
    } catch (error: any) {
      this.notificationService.show(`Erro ao alterar status: ${error.message}`, 'error');
    } finally {
      this.isChangingStatus.set(false);
    }
  }
  
  openCategoryModal() {
    this.newCategoryName.set('');
    this.isCategoryModalOpen.set(true);
  }
  closeCategoryModal() { this.isCategoryModalOpen.set(false); }

  async saveNewCategory() {
    const name = this.newCategoryName().trim();
    const catalogId = this.selectedCatalogId();
    if (!name || !catalogId) return;

    this.isCreatingCategory.set(true);
    try {
      await this.ifoodMenuService.createCategory(catalogId, name);
      this.notificationService.show('Categoria criada com sucesso no iFood!', 'success');
      await this.refreshCatalogData();
      this.closeCategoryModal();
    } catch (error: any) {
      this.notificationService.show(`Erro ao criar categoria: ${error.message}`, 'error');
    } finally {
      this.isCreatingCategory.set(false);
    }
  }

  handleImageUpload() {
    this.notificationService.show('A API do iFood para upload de imagem via parceiros não está disponível publicamente.', 'info');
  }

  private async refreshCatalogData() {
    const catalogId = this.selectedCatalogId();
    if (catalogId) {
        await this.loadCatalogData(catalogId);
    }
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
