import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IfoodStateService } from '../../services/ifood-state.service';
import { RecipeStateService } from '../../services/recipe-state.service';
import { IfoodMenuService, IfoodCatalog, IfoodCategory, IfoodItem, UnsellableCategory, IfoodOptionGroup, IfoodOption } from '../../services/ifood-menu.service';
import { NotificationService } from '../../services/notification.service';
import { Recipe, Category, IfoodMenuSync } from '../../models/db.models';
import { RouterLink } from '@angular/router';
import { RecipeDataService } from '../../services/recipe-data.service';
import { FormsModule } from '@angular/forms';

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
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './ifood-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IfoodMenuComponent implements OnInit {
  private ifoodState = inject(IfoodStateService);
  private recipeState = inject(RecipeStateService);
  private ifoodMenuService = inject(IfoodMenuService);
  private notificationService = inject(NotificationService);
  private recipeDataService = inject(RecipeDataService);

  isLoading = signal(true);
  view = signal<'sync' | 'live' | 'unsellable' | 'optionGroups'>('sync');

  // iFood Data
  ifoodCatalogs = signal<IfoodCatalog[]>([]);
  selectedCatalogId = signal<string | null>(null);
  ifoodCategories = signal<IfoodCategory[]>([]);
  unsellableCategories = signal<UnsellableCategory[]>([]);
  ifoodOptionGroups = signal<IfoodOptionGroup[]>([]);
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
  ifoodSyncData = this.ifoodState.ifoodMenuSync;
  syncDataMap = computed(() => new Map(this.ifoodSyncData().map(s => [s.recipe_id, s])));
  syncingItems = signal<Set<string>>(new Set());

  localCategories = this.recipeState.categories;
  localCategoriesMap = computed(() => new Map(this.localCategories().map(c => [c.id, c.name])));
  localRecipesByExternalCode = computed(() => {
    const map = new Map<string, Recipe>();
    this.recipeState.recipes().forEach(r => {
      if (r.external_code) {
        map.set(r.external_code, r);
      }
    });
    return map;
  });
  
  // Modals for live item editing
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

  // Modals for option groups & options
  isOptionModalOpen = signal(false);
  parentGroupForOption = signal<IfoodOptionGroup | null>(null);
  editingOption = signal<IfoodOption | null>(null);
  optionForm = signal({ name: '', externalCode: '', price: 0 });
  newOptionStatus = signal<'AVAILABLE' | 'UNAVAILABLE'>('AVAILABLE');
  isSavingOption = signal(false);
  
  // Modal for editing recipe details
  isEditRecipeModalOpen = signal(false);
  editingRecipeForm = signal<Partial<Recipe>>({});

  isUploadingImage = signal<string | null>(null); // Use item.id to track


  private createSyncHash(recipe: Recipe): string {
    return `${recipe.name}|${recipe.description || ''}|${recipe.price.toFixed(2)}`;
  }

  private localItemsWithSyncStatus = computed<MappedLocalItem[]>(() => {
    const localRecipes = this.recipeState.recipes().filter(r => !r.is_sub_recipe && r.is_available);
    const categoriesMap = this.localCategoriesMap();
    const syncMap = this.syncDataMap();
    const syncing = this.syncingItems();

    return localRecipes.map(recipe => {
        let status: SyncStatus = 'unsynced';
        
        if (syncing.has(recipe.id)) {
            status = 'syncing';
        } else {
            const syncInfo: IfoodMenuSync | undefined = syncMap.get(recipe.id);
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
        const [categories, unsellable, optionGroups] = await Promise.all([
            this.ifoodMenuService.getCategories(catalogId),
            this.ifoodMenuService.getUnsellableItems(catalogId),
            this.ifoodMenuService.getOptionGroups(true)
        ]);
        this.ifoodCategories.set(categories);
        this.unsellableCategories.set(unsellable.categories);
        this.ifoodOptionGroups.set(optionGroups);
    } catch (error: any) {
        this.notificationService.show(`Erro ao buscar dados do catálogo: ${error.message}`, 'error');
    } finally {
        this.isLoading.set(false);
    }
  }

  async refreshData() {
    const catalogId = this.selectedCatalogId();
    if(catalogId) {
      await this.loadCatalogData(catalogId);
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
        const maxIndex = this.ifoodCategories().reduce((max, cat) => Math.max(max, cat.index), -1);
        const newCategory = await this.ifoodMenuService.createCategory(catalogId, categoryName, maxIndex + 1);
        ifoodCategoryId = newCategory.id;
        await this.refreshData();
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
    const syncInfo: IfoodMenuSync | undefined = this.syncDataMap().get(recipe.id);
    const productId = syncInfo?.ifood_product_id || `00000000-0000-4000-8000-${recipe.id.replace(/-/g, '').substring(0, 12)}`;
    const itemId = syncInfo?.ifood_item_id || `11111111-1111-4111-8111-${recipe.id.replace(/-/g, '').substring(0, 12)}`;
    
    return {
      item: { id: itemId, type: "DEFAULT", categoryId, status: "AVAILABLE", price: { value: recipe.price, originalValue: recipe.price }, externalCode, index: 0, productId },
      products: [ { id: productId, externalCode, name: recipe.name, description: recipe.description || '', serving: 'SERVES_1' } ],
      optionGroups: [], options: []
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
    if (!item || !item.externalCode) return;
    this.isChangingPrice.set(true);
    try {
      await this.ifoodMenuService.patchItemPrice(item.externalCode, this.newPrice());
      this.notificationService.show('Preço atualizado!', 'success');
      await this.refreshData();
      this.closePriceModal();
    } catch (error: any) {
      this.notificationService.show(`Erro: ${error.message}`, 'error');
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
    if (!item || !item.externalCode) return;
    this.isChangingStatus.set(true);
    try {
      await this.ifoodMenuService.patchItemStatus(item.externalCode, this.newStatus());
      this.notificationService.show('Status atualizado!', 'success');
      await this.refreshData();
      this.closeStatusModal();
    } catch (error: any) {
      this.notificationService.show(`Erro: ${error.message}`, 'error');
    } finally {
      this.isChangingStatus.set(false);
    }
  }
  
  openCategoryModal() { this.newCategoryName.set(''); this.isCategoryModalOpen.set(true); }
  closeCategoryModal() { this.isCategoryModalOpen.set(false); }

  async saveNewCategory() {
    const name = this.newCategoryName().trim(); const catalogId = this.selectedCatalogId(); if (!name || !catalogId) return;
    this.isCreatingCategory.set(true);
    try {
      const maxIndex = this.ifoodCategories().reduce((max, cat) => Math.max(max, cat.index), -1);
      await this.ifoodMenuService.createCategory(catalogId, name, maxIndex + 1);
      this.notificationService.show('Categoria criada!', 'success');
      await this.refreshData();
      this.closeCategoryModal();
    } catch (error: any) {
      this.notificationService.show(`Erro: ${error.message}`, 'error');
    } finally {
      this.isCreatingCategory.set(false);
    }
  }

  triggerImageUpload(item: IfoodItem) { document.getElementById(`image-input-${item.id}`)?.click(); }

  async onImageSelected(event: Event, item: IfoodItem) {
    const file = (event.target as HTMLInputElement).files?.[0]; if (!file || !item.externalCode) return;
    const recipe = this.localRecipesByExternalCode().get(item.externalCode); if (!recipe) { this.notificationService.show('Receita local não encontrada.', 'error'); return; }
    this.isUploadingImage.set(item.id);
    try {
      const base64Image = await this.fileToBase64(file);
      await this.recipeDataService.updateRecipeImage(recipe.id, file);
      const category = this.ifoodCategories().find(c => c.items.some(i => i.id === item.id)); if (!category) throw new Error("Categoria iFood não encontrada.");
      const updatedRecipe = { ...recipe, image_url: 'temp' };
      const payload = this.mapRecipeToIfoodPayload(updatedRecipe, category.id);
      payload.products[0].image = base64Image;
      await this.ifoodMenuService.updateItemImage(payload, updatedRecipe, this.createSyncHash(updatedRecipe));
      this.notificationService.show(`Imagem de '${item.name}' atualizada!`, 'success');
      await this.refreshData();
    } catch (error: any) {
      this.notificationService.show(`Erro: ${error.message}`, 'error');
    } finally {
      this.isUploadingImage.set(null); (event.target as HTMLInputElement).value = '';
    }
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = error => reject(error);
    });
  }
  
  // Recipe Edit Modal Methods
  openRecipeEditModal(recipe: Recipe) { this.editingRecipeForm.set({ ...recipe }); this.isEditRecipeModalOpen.set(true); }
  closeRecipeEditModal() { this.isEditRecipeModalOpen.set(false); }
  updateEditingRecipeField(field: keyof Omit<Recipe, 'id' | 'created_at' | 'hasStock'>, value: any) { this.editingRecipeForm.update(form => ({ ...form, [field]: (field === 'price' || field === 'prep_time_in_minutes') ? +value : value })); }
  async saveRecipeDetails() {
    const formValue = this.editingRecipeForm(); if (!formValue || !formValue.id) return;
    if (!formValue.name?.trim() || !formValue.external_code?.trim()) { this.notificationService.alert('Nome e Código Externo são obrigatórios.'); return; }
    const { success, error } = await this.recipeDataService.updateRecipeDetails(formValue.id, formValue);
    if (success) { this.notificationService.show('Detalhes atualizados!', 'success'); this.closeRecipeEditModal(); } 
    else { this.notificationService.alert(`Erro: ${error.message}`); }
  }

  getStatusClass(status: SyncStatus): string {
    return { 'synced': 'bg-green-500', 'unsynced': 'bg-blue-500', 'modified': 'bg-yellow-500', 'error': 'bg-red-500', 'syncing': 'bg-gray-500 animate-pulse' }[status] || 'bg-gray-400';
  }

  // Option Group & Option Methods
  openAddOptionModal(group: IfoodOptionGroup) {
    this.parentGroupForOption.set(group);
    this.editingOption.set(null);
    this.optionForm.set({ name: '', externalCode: '', price: 0 });
    this.isOptionModalOpen.set(true);
  }

  openEditOptionModal(option: IfoodOption, group: IfoodOptionGroup) {
    this.parentGroupForOption.set(group);
    this.editingOption.set(option);
    this.optionForm.set({ name: option.name, externalCode: option.externalCode, price: option.price.value });
    this.newOptionStatus.set(option.status as 'AVAILABLE' | 'UNAVAILABLE');
    this.isOptionModalOpen.set(true);
  }
  
  closeOptionModal() { this.isOptionModalOpen.set(false); }

  async saveOption() {
    this.isSavingOption.set(true);
    try {
      const form = this.optionForm();
      if (!form.name || !form.externalCode) throw new Error("Nome e Código Externo são obrigatórios.");
      
      const editing = this.editingOption();
      if (editing) {
        // Update existing option
        if (editing.price.value !== form.price) {
          await this.ifoodMenuService.updateOptionPrice(editing.id, form.price);
        }
        if (editing.status !== this.newOptionStatus()) {
          await this.ifoodMenuService.updateOptionStatus(editing.id, this.newOptionStatus());
        }
        // Note: iFood API doesn't seem to support updating name/externalCode of options directly.
      } else {
        // Create new option
        const parentGroup = this.parentGroupForOption();
        if (!parentGroup) throw new Error("Grupo de complemento não encontrado.");
        await this.ifoodMenuService.createOption(parentGroup.id, form);
      }
      this.notificationService.show("Complemento salvo com sucesso!", 'success');
      await this.refreshData();
      this.closeOptionModal();
    } catch(error: any) {
      this.notificationService.show(`Erro: ${error.message}`, 'error');
    } finally {
      this.isSavingOption.set(false);
    }
  }

  async deleteOption(option: IfoodOption) {
    const confirmed = await this.notificationService.confirm(`Tem certeza que deseja remover o complemento "${option.name}"?`);
    if (!confirmed) return;

    this.isSavingOption.set(true);
    try {
      const parentGroup = this.ifoodOptionGroups().find(g => g.options.some(o => o.id === option.id));
      if (!parentGroup) throw new Error("Grupo pai não encontrado.");
      await this.ifoodMenuService.deleteOption(parentGroup.id, option.productId);
      this.notificationService.show("Complemento removido.", 'success');
      await this.refreshData();
      this.closeOptionModal();
    } catch(error: any) {
      this.notificationService.show(`Erro: ${error.message}`, 'error');
    } finally {
      this.isSavingOption.set(false);
    }
  }
}
