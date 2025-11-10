import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Station, IngredientCategory, Category } from '../../../models/db.models';
import { SettingsDataService } from '../../../services/settings-data.service';
import { InventoryDataService } from '../../../services/inventory-data.service';
import { RecipeDataService } from '../../../services/recipe-data.service';
import { NotificationService } from '../../../services/notification.service';
import { PosStateService } from '../../../services/pos-state.service';
import { InventoryStateService } from '../../../services/inventory-state.service';
import { RecipeStateService } from '../../../services/recipe-state.service';

@Component({
  selector: 'app-operation-settings',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './operation-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OperationSettingsComponent {
  private settingsDataService = inject(SettingsDataService);
  private inventoryDataService = inject(InventoryDataService);
  private recipeDataService = inject(RecipeDataService);
  private notificationService = inject(NotificationService);
  private posState = inject(PosStateService);
  private inventoryState = inject(InventoryStateService);
  private recipeState = inject(RecipeStateService);

  stations = this.posState.stations;
  categories = this.inventoryState.ingredientCategories;
  recipeCategories = this.recipeState.categories;
  
  // --- Station Management ---
  newStationName = signal('');
  editingStation = signal<Station | null>(null);
  stationPendingDeletion = signal<Station | null>(null);

  async handleAddStation() {
    const name = this.newStationName().trim(); if (!name) return;
    const { success, error } = await this.settingsDataService.addStation(name);
    if (success) { this.newStationName.set(''); } else { await this.notificationService.alert(`Falha: ${error?.message}`); }
  }
  startEditingStation(s: Station) { this.editingStation.set({ ...s }); this.stationPendingDeletion.set(null); }
  cancelEditingStation() { this.editingStation.set(null); }
  updateEditingStationName(event: Event) {
    const name = (event.target as HTMLInputElement).value;
    this.editingStation.update(s => s ? { ...s, name } : s);
  }
  async saveStation() {
    const station = this.editingStation(); if (!station?.name.trim()) return;
    const { success, error } = await this.settingsDataService.updateStation(station.id, station.name.trim());
    if (success) { this.cancelEditingStation(); } else { await this.notificationService.alert(`Falha: ${error?.message}`); }
  }
  requestDeleteStation(s: Station) { this.stationPendingDeletion.set(s); this.editingStation.set(null); }
  cancelDeleteStation() { this.stationPendingDeletion.set(null); }
  async confirmDeleteStation() {
    const station = this.stationPendingDeletion(); if (!station) return;
    const { success, error } = await this.settingsDataService.deleteStation(station.id);
    if (!success) { await this.notificationService.alert(`Falha: ${error?.message}`); }
    this.stationPendingDeletion.set(null);
  }

  // --- Ingredient Category Management ---
  newCategoryName = signal('');
  editingCategory = signal<IngredientCategory | null>(null);
  categoryPendingDeletion = signal<IngredientCategory | null>(null);

  async handleAddCategory() {
    const name = this.newCategoryName().trim(); if (!name) return;
    const { success, error } = await this.inventoryDataService.addIngredientCategory(name);
    if (success) { this.newCategoryName.set(''); } else { await this.notificationService.alert(`Falha: ${error?.message}`); }
  }
  startEditingCategory(c: IngredientCategory) { this.editingCategory.set({ ...c }); this.categoryPendingDeletion.set(null); }
  cancelEditingCategory() { this.editingCategory.set(null); }
  updateEditingCategoryName(event: Event) {
    const name = (event.target as HTMLInputElement).value;
    this.editingCategory.update(c => c ? { ...c, name } : c);
  }
  async saveCategory() {
    const category = this.editingCategory(); if (!category?.name.trim()) return;
    const { success, error } = await this.inventoryDataService.updateIngredientCategory(category.id, category.name.trim());
    if (success) { this.cancelEditingCategory(); } else { await this.notificationService.alert(`Falha: ${error?.message}`); }
  }
  requestDeleteCategory(c: IngredientCategory) { this.categoryPendingDeletion.set(c); this.editingCategory.set(null); }
  cancelDeleteCategory() { this.categoryPendingDeletion.set(null); }
  async confirmDeleteCategory() {
    const category = this.categoryPendingDeletion(); if (!category) return;
    const { success, error } = await this.inventoryDataService.deleteIngredientCategory(category.id);
    if (!success) { await this.notificationService.alert(`Falha: ${error?.message}`); }
    this.categoryPendingDeletion.set(null);
  }

  // --- Recipe Category Management ---
  isRecipeCategoryModalOpen = signal(false);
  newRecipeCategoryName = signal('');
  editingRecipeCategory = signal<Category | null>(null);
  recipeCategoryPendingDeletion = signal<Category | null>(null);
  recipeCategoryImageFile = signal<File | null>(null);
  recipeCategoryImagePreviewUrl = signal<string | null>(null);

  openAddRecipeCategoryModal() {
    this.editingRecipeCategory.set(null);
    this.newRecipeCategoryName.set('');
    this.recipeCategoryImageFile.set(null);
    this.recipeCategoryImagePreviewUrl.set(null);
    this.isRecipeCategoryModalOpen.set(true);
  }

  openEditRecipeCategoryModal(c: Category) {
    this.editingRecipeCategory.set({ ...c });
    this.newRecipeCategoryName.set(c.name);
    this.recipeCategoryImageFile.set(null);
    this.recipeCategoryImagePreviewUrl.set(c.image_url);
    this.isRecipeCategoryModalOpen.set(true);
  }

  closeRecipeCategoryModal() {
    this.isRecipeCategoryModalOpen.set(false);
  }
  
  handleRecipeCategoryImageChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.recipeCategoryImageFile.set(file);
      const reader = new FileReader();
      reader.onload = (e) => this.recipeCategoryImagePreviewUrl.set(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  }

  async saveRecipeCategory() {
    const name = this.newRecipeCategoryName().trim();
    if (!name) {
      await this.notificationService.alert('O nome da categoria é obrigatório.');
      return;
    }
    const imageFile = this.recipeCategoryImageFile();
    const editingCategory = this.editingRecipeCategory();
    
    let result;
    if (editingCategory) {
      result = await this.recipeDataService.updateRecipeCategory(editingCategory.id, name, imageFile);
    } else {
      result = await this.recipeDataService.addRecipeCategory(name, imageFile);
    }

    if (result.success) {
      this.closeRecipeCategoryModal();
    } else {
      await this.notificationService.alert(`Falha: ${result.error?.message}`);
    }
  }

  requestDeleteRecipeCategory(c: Category) { this.recipeCategoryPendingDeletion.set(c); }
  cancelDeleteRecipeCategory() { this.recipeCategoryPendingDeletion.set(null); }
  async confirmDeleteRecipeCategory() {
    const category = this.recipeCategoryPendingDeletion(); if (!category) return;
    const { success, error } = await this.recipeDataService.deleteRecipeCategory(category.id);
    if (!success) { await this.notificationService.alert(`Falha ao deletar. Erro: ${error?.message}`); }
    this.recipeCategoryPendingDeletion.set(null);
  }
}
