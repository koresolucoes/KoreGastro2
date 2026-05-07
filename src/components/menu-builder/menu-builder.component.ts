import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { MenuDataService } from '../../services/menu-data.service';
import { MenuStateService } from '../../services/menu-state.service';
import { ToastService } from '../../services/toast.service';
import { Menu, MenuCategory, MenuItem, MenuItemOption, MenuItemOptionChoice, Recipe } from '../../models/db.models';
import { RecipeStateService } from '../../services/recipe-state.service';

@Component({
  selector: 'app-menu-builder',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatIconModule, DragDropModule],
  templateUrl: './menu-builder.component.html',
})
export class MenuBuilderComponent implements OnInit {
  private menuData = inject(MenuDataService);
  public menuState = inject(MenuStateService);
  public recipeState = inject(RecipeStateService);
  private toast = inject(ToastService);

  activeMenuId = signal<string | null>(null);
  activeCategoryId = signal<string | null>(null);

  isEditingMenu = signal(false);
  editingMenuData = signal<Partial<Menu> | null>(null);

  isEditingCategory = signal(false);
  editingCategoryData = signal<Partial<MenuCategory> | null>(null);

  isEditingItem = signal(false);
  editingItemData = signal<Partial<MenuItem> | null>(null);

  // Options
  isEditingOption = signal(false);
  editingOptionData = signal<Partial<MenuItemOption> | null>(null);
  
  // Choices
  isEditingChoice = signal(false);
  editingChoiceData = signal<Partial<MenuItemOptionChoice> | null>(null);

  async ngOnInit() {
    await this.loadData();
  }

  async loadData() {
    const { success, error } = await this.menuData.loadAllMenuData();
    if (success) {
      if (this.menuState.menus().length > 0 && !this.activeMenuId()) {
        this.activeMenuId.set(this.menuState.menus()[0].id);
      }
    } else {
      this.toast.show('Erro ao carregar cardápios', 'error');
    }
  }

  selectMenu(id: string) {
    this.activeMenuId.set(id);
    this.activeCategoryId.set(null);
  }

  // --- Menu ---
  newMenu() {
    this.editingMenuData.set({ name: '', type: 'online', is_active: true });
    this.isEditingMenu.set(true);
  }
  
  editMenu(menu: Menu) {
    this.editingMenuData.set({ ...menu });
    this.isEditingMenu.set(true);
  }

  async saveMenu() {
    const data = this.editingMenuData();
    if (!data) return;
    this.isEditingMenu.set(false);
    const { success } = await this.menuData.saveMenu(data);
    if (success) {
      this.toast.show('Cardápio salvo!', 'success');
      this.editingMenuData.set(null);
      await this.loadData();
    } else {
      this.toast.show('Erro ao salvar cardápio', 'error');
    }
  }

  cancelMenuEdit() {
    this.isEditingMenu.set(false);
    this.editingMenuData.set(null);
  }

  // --- Category ---
  newCategory() {
    if (!this.activeMenuId()) return;
    this.editingCategoryData.set({ name: '', menu_id: this.activeMenuId()!, display_order: 0 });
    this.isEditingCategory.set(true);
  }

  editCategory(cat: MenuCategory) {
    this.editingCategoryData.set({ ...cat });
    this.isEditingCategory.set(true);
  }

  async saveCategory() {
    const data = this.editingCategoryData();
    if (!data) return;
    this.isEditingCategory.set(false);
    const { success } = await this.menuData.saveCategory(data);
    if (success) {
      this.toast.show('Categoria salva!', 'success');
      this.editingCategoryData.set(null);
      await this.loadData();
    } else {
      this.toast.show('Erro ao salvar categoria', 'error');
    }
  }

  cancelCategoryEdit() {
    this.isEditingCategory.set(false);
    this.editingCategoryData.set(null);
  }

  // --- Item ---
  newItem(categoryId: string) {
    this.editingItemData.set({ menu_category_id: categoryId, display_order: 0, is_active: true });
    this.isEditingItem.set(true);
  }

  editItem(item: MenuItem) {
    this.editingItemData.set({ ...item });
    this.isEditingItem.set(true);
  }

  async saveItem() {
    const data = this.editingItemData();
    if (!data || !data.recipe_id) return;
    this.isEditingItem.set(false);
    const { success } = await this.menuData.saveItem(data);
    if (success) {
      this.toast.show('Item salvo!', 'success');
      this.editingItemData.set(null);
      await this.loadData();
    } else {
      this.toast.show('Erro ao salvar item', 'error');
    }
  }

  cancelItemEdit() {
    this.isEditingItem.set(false);
    this.editingItemData.set(null);
  }

  isUploadingImage = signal(false);

  async onImageUpload(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    this.isUploadingImage.set(true);
    try {
      const { success, url, error } = await this.menuData.uploadImage(file);
      if (success && url) {
         this.editingItemData.update(d => {
            if(!d) return d;
            return { ...d, custom_image_url: url };
         });
         this.toast.show('Imagem carregada com sucesso!', 'success');
      } else {
         this.toast.show('Erro ao carregar a imagem. Você forneceu as chaves do supabase corretamente?', 'error');
         console.error('Image upload failed', error);
      }
    } finally {
      this.isUploadingImage.set(false);
    }
  }

  // --- Options ---
  newOption(itemId: string) {
    this.editingOptionData.set({ menu_item_id: itemId, name: '', min_choices: 0, max_choices: 1, display_order: 0 });
    this.isEditingOption.set(true);
  }

  editOption(option: MenuItemOption) {
    this.editingOptionData.set({ ...option });
    this.isEditingOption.set(true);
  }

  async saveOption() {
    const data = this.editingOptionData();
    if (!data) return;
    this.isEditingOption.set(false);
    const { success } = await this.menuData.saveOption(data);
    if (success) {
      this.toast.show('Opção salva!', 'success');
      this.editingOptionData.set(null);
      await this.loadData();
    } else {
      this.toast.show('Erro ao salvar opção', 'error');
    }
  }

  cancelOptionEdit() {
    this.isEditingOption.set(false);
    this.editingOptionData.set(null);
  }

  // --- Choices ---
  newChoice(optionId: string) {
    this.editingChoiceData.set({ menu_item_option_id: optionId, additional_price: 0, display_order: 0 });
    this.isEditingChoice.set(true);
  }

  editChoice(choice: MenuItemOptionChoice) {
    this.editingChoiceData.set({ ...choice });
    this.isEditingChoice.set(true);
  }

  async saveChoice() {
    const data = this.editingChoiceData();
    if (!data || !data.recipe_id) return;
    this.isEditingChoice.set(false);
    const { success } = await this.menuData.saveOptionChoice(data);
    if (success) {
      this.toast.show('Complemento salvo!', 'success');
      this.editingChoiceData.set(null);
      await this.loadData();
    } else {
      this.toast.show('Erro ao salvar complemento', 'error');
    }
  }

  cancelChoiceEdit() {
    this.isEditingChoice.set(false);
    this.editingChoiceData.set(null);
  }

  // Helpers
  get activeMenu() {
    return this.menuState.menusWithRelations().find(m => m.id === this.activeMenuId());
  }

  get availableRecipes() {
    // Pegamos receitas que podem ser vendidas diretamente e que não são subreceitas 
    // ou talvez todas as receitas? Depende. Vamos mostrar todas as que não são sub-receitas.
    return this.recipeState.recipes().filter(r => !r.is_sub_recipe);
  }

  // --- Drag and Drop ---
  async dropCategory(event: CdkDragDrop<any[]>) {
    if (!this.activeMenu) return;
    if (event.previousIndex === event.currentIndex) return;

    const categories = [...(this.activeMenu.categories || [])];
    moveItemInArray(categories, event.previousIndex, event.currentIndex);
    
    categories.forEach((c, i) => c.display_order = i);
    const payload = categories.map(c => ({ id: c.id, display_order: c.display_order }));
    
    const { success } = await this.menuData.updateOrder('menu_categories', payload);
    if(success) {
      await this.loadData();
    } else {
      this.toast.show('Erro ao reordenar', 'error');
    }
  }

  async dropItem(event: CdkDragDrop<any[]>, categoryId: string) {
    if (!this.activeMenu) return;
    const cat = this.activeMenu.categories?.find(c => c.id === categoryId);
    if(!cat || !cat.items) return;
    if (event.previousIndex === event.currentIndex) return;

    const items = [...cat.items];
    moveItemInArray(items, event.previousIndex, event.currentIndex);
    items.forEach((item, index) => item.display_order = index);

    const payload = items.map(c => ({ id: c.id, display_order: c.display_order }));
    const { success } = await this.menuData.updateOrder('menu_items', payload);
    if(success) {
      await this.loadData();
    } else {
      this.toast.show('Erro ao reordenar', 'error');
    }
  }

  async dropOption(event: CdkDragDrop<any[]>, itemId: string) {
    const item = this.activeMenu?.categories?.flatMap(c => c.items).find(i => i?.id === itemId);
    if(!item || !item.options) return;
    if (event.previousIndex === event.currentIndex) return;

    const options = [...item.options];
    moveItemInArray(options, event.previousIndex, event.currentIndex);
    options.forEach((o, index) => o.display_order = index);

    const payload = options.map(c => ({ id: c.id, display_order: c.display_order }));
    const { success } = await this.menuData.updateOrder('menu_item_option_groups', payload);
    if(success) {
      await this.loadData();
    } else {
      this.toast.show('Erro ao reordenar', 'error');
    }
  }
}
