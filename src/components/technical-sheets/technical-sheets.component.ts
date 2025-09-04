import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Recipe } from '../../models/db.models';
import { RecipeForm, FullRecipe } from '../../models/app.models';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { RecipeDataService } from '../../services/recipe-data.service';
import { NotificationService } from '../../services/notification.service';
import { TechnicalSheetModalComponent } from './technical-sheet-modal/technical-sheet-modal.component';

@Component({
  selector: 'app-technical-sheets',
  standalone: true,
  imports: [CommonModule, TechnicalSheetModalComponent, CurrencyPipe, DatePipe],
  templateUrl: './technical-sheets.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TechnicalSheetsComponent {
  private stateService = inject(SupabaseStateService);
  private recipeDataService = inject(RecipeDataService);
  private notificationService = inject(NotificationService);

  // Main page state
  searchTerm = signal('');
  recipePendingDeletion = signal<Recipe | null>(null);

  // Modal state
  isModalOpen = signal(false);
  selectedRecipe = signal<FullRecipe | null>(null);
  modalMode = signal<'view' | 'edit' | 'add'>('view');

  // Data from services
  allRecipes = this.stateService.recipes;
  recipeCategories = this.stateService.categories;
  recipeCosts = this.stateService.recipeCosts;

  // Computed properties
  filteredRecipes = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const recipes = this.allRecipes();
    if (!term) return recipes;
    return recipes.filter(r => r.name.toLowerCase().includes(term));
  });

  getCategoryName(categoryId: string): string {
    return this.recipeCategories().find(c => c.id === categoryId)?.name || 'N/A';
  }

  openAddModal() {
    this.selectedRecipe.set(null);
    this.modalMode.set('add');
    this.isModalOpen.set(true);
  }

  openViewModal(recipe: Recipe) {
    const fullRecipe = this.buildFullRecipe(recipe.id);
    this.selectedRecipe.set(fullRecipe);
    this.modalMode.set('view');
    this.isModalOpen.set(true);
  }
  
  closeModal() {
    this.isModalOpen.set(false);
    this.selectedRecipe.set(null);
  }
  
  async handleSave(recipeData: RecipeForm) {
    const { recipe, preparations, ingredients, subRecipes } = recipeData;

    if (!recipe.name?.trim()) {
      await this.notificationService.alert('O nome da receita é obrigatório.');
      return;
    }
    
    let result;
    if (recipe.id) { // Update existing
      result = await this.recipeDataService.saveTechnicalSheet(recipe.id, recipe, preparations, ingredients, subRecipes);
    } else { // Create new
      const { success, error, data: newRecipe } = await this.recipeDataService.addRecipe(recipe);
      if (success && newRecipe) {
        result = await this.recipeDataService.saveTechnicalSheet(newRecipe.id, recipe, preparations, ingredients, subRecipes);
      } else {
        await this.notificationService.alert(`Falha ao criar receita. Erro: ${error?.message}`);
        return;
      }
    }

    if (result.success) {
      this.closeModal();
      await this.notificationService.alert('Ficha Técnica salva com sucesso!', 'Sucesso');
    } else {
      await this.notificationService.alert(`Falha ao salvar. Erro: ${result.error?.message}`);
    }
  }

  async toggleAvailability(recipe: Recipe, event: Event) {
    const is_available = (event.target as HTMLInputElement).checked;
    await this.recipeDataService.updateRecipeAvailability(recipe.id, is_available);
  }

  requestDeleteRecipe(recipe: Recipe) {
    this.recipePendingDeletion.set(recipe);
  }

  cancelDeleteRecipe() {
    this.recipePendingDeletion.set(null);
  }

  async confirmDeleteRecipe() {
    const recipe = this.recipePendingDeletion();
    if (recipe) {
      const result = await this.recipeDataService.deleteRecipe(recipe.id);
      if (!result.success) {
        await this.notificationService.alert(`Falha ao deletar. Erro: ${result.error?.message}`);
      }
      this.recipePendingDeletion.set(null);
    }
  }

  private buildFullRecipe(recipeId: string): FullRecipe {
    const recipe = this.allRecipes().find(r => r.id === recipeId)!;
    const preparations = this.stateService.recipePreparations().filter(p => p.recipe_id === recipeId);
    const ingredients = this.stateService.recipeIngredients()
        .filter(i => i.recipe_id === recipeId)
        .map(i => ({
            ...i,
            name: i.ingredients?.name || '?',
            unit: i.ingredients?.unit || '?',
            cost: i.ingredients?.cost || 0
        }));
    const subRecipes = this.stateService.recipeSubRecipes()
        .filter(sr => sr.parent_recipe_id === recipeId)
        .map(sr => ({
            ...sr,
            name: sr.recipes?.name || '?',
            cost: this.recipeCosts().get(sr.child_recipe_id)?.totalCost || 0
        }));

    return {
        ...recipe,
        preparations,
        ingredients,
        subRecipes,
        cost: this.recipeCosts().get(recipeId) || { totalCost: 0, ingredientCount: 0, rawIngredients: new Map() }
    };
  }
}