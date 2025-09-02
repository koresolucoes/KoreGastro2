

import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Recipe, RecipeIngredient, Ingredient, Category, IngredientUnit, Station, RecipePreparation } from '../../models/db.models';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../../services/auth.service';
import { AiRecipeService } from '../../services/ai-recipe.service';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { RecipeDataService } from '../../services/recipe-data.service';
import { InventoryDataService } from '../../services/inventory-data.service';

interface NewRecipeForm {
  name: string;
  category_id: string;
  description: string;
  prep_time_in_minutes: number;
}

@Component({
  selector: 'app-technical-sheets',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './technical-sheets.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TechnicalSheetsComponent {
  private stateService = inject(SupabaseStateService);
  private recipeDataService = inject(RecipeDataService);
  private inventoryDataService = inject(InventoryDataService);
  private authService = inject(AuthService);
  private aiRecipeService = inject(AiRecipeService);

  recipesWithStockStatus = this.stateService.recipesWithStockStatus;
  ingredients = this.stateService.ingredients;
  recipeIngredients = this.stateService.recipeIngredients;
  recipeCategories = this.stateService.categories;
  stations = this.stateService.stations;
  recipePreparations = this.stateService.recipePreparations;

  searchTerm = signal('');
  selectedCategoryId = signal<string | 'all'>('all');
  recipePendingDeletion = signal<Recipe | null>(null);

  recipeCategoryMap = computed(() => new Map(this.recipeCategories().map(cat => [cat.id, cat.name])));

  recipeTechSheetStatus = computed(() => {
    const statusMap = new Map<string, { count: number, cost: number }>();
    for (const recipe of this.recipesWithStockStatus()) {
        statusMap.set(recipe.id, { count: 0, cost: recipe.operational_cost || 0 });
    }
    for (const ri of this.recipeIngredients()) {
      const ingredient = this.ingredients().find(i => i.id === ri.ingredient_id);
      const cost = ingredient ? ingredient.cost * ri.quantity : 0;
      const current = statusMap.get(ri.recipe_id);
      if (current) {
        statusMap.set(ri.recipe_id, { count: current.count + 1, cost: current.cost + cost });
      }
    }
    return statusMap;
  });

  filteredRecipes = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const categoryId = this.selectedCategoryId();
    return this.recipesWithStockStatus().filter(recipe => 
      recipe.name.toLowerCase().includes(term) && 
      (categoryId === 'all' || recipe.category_id === categoryId)
    );
  });

  isTechSheetModalOpen = signal(false);
  selectedRecipeForTechSheet = signal<Recipe | null>(null);
  currentPreparations = signal<(RecipePreparation & { recipe_ingredients: RecipeIngredient[] })[]>([]);
  techSheetSearchTerm = signal('');
  operationalCost = signal<number>(0);
  techSheetSellingPrice = signal<number>(0);
  prepTimeInMinutes = signal<number>(0);
  isRegeneratingWithAI = signal(false);

  filteredIngredientsForTechSheet = computed(() => {
    const term = this.techSheetSearchTerm().toLowerCase();
    const currentIngredientIds = new Set(this.currentPreparations().flatMap(p => p.recipe_ingredients).map(ri => ri.ingredient_id));
    if (!term) return [];
    return this.ingredients().filter(i => !currentIngredientIds.has(i.id) && i.name.toLowerCase().includes(term)).slice(0, 5);
  });

  showCreateIngredientOption = computed(() => this.techSheetSearchTerm().trim().length > 1 && this.filteredIngredientsForTechSheet().length === 0);

  techSheetTotalCost = computed(() => {
    const ingredientsCost = this.currentPreparations().flatMap(p => p.recipe_ingredients).reduce((sum, ri) => {
        const ingredient = this.ingredients().find(i => i.id === ri.ingredient_id);
        return sum + (ingredient ? ingredient.cost * ri.quantity : 0);
    }, 0);
    return ingredientsCost + (this.operationalCost() || 0);
  });

  techSheetCMV = computed(() => {
    const price = this.techSheetSellingPrice();
    return !price ? 0 : (this.techSheetTotalCost() / price) * 100;
  });

  techSheetProfitMargin = computed(() => {
    const price = this.techSheetSellingPrice();
    if (!price) return 0;
    return ((price - this.techSheetTotalCost()) / price) * 100;
  });

  getIngredientDetails = (id: string) => this.ingredients().find(i => i.id === id);

  openTechSheetModal(recipe: Recipe, initialPreparations?: (RecipePreparation & { recipe_ingredients: RecipeIngredient[] })[]) {
    this.selectedRecipeForTechSheet.set(recipe);
    this.operationalCost.set(recipe.operational_cost || 0);
    this.techSheetSellingPrice.set(recipe.price || 0);
    this.prepTimeInMinutes.set(recipe.prep_time_in_minutes || 15);

    if (initialPreparations) {
        this.currentPreparations.set(initialPreparations);
    } else {
        const userId = this.authService.currentUser()?.id;
        if (!userId) return;
        let preps = this.recipeDataService.getRecipePreparations(recipe.id);
        if (preps.length === 0) preps.push({ id: `temp-${uuidv4()}`, recipe_id: recipe.id, name: 'Preparação Principal', station_id: this.stations()[0]?.id || '', display_order: 0, created_at: new Date().toISOString(), user_id: userId });
        const ingredientsForRecipe = this.recipeDataService.getRecipeIngredients(recipe.id);
        this.currentPreparations.set(JSON.parse(JSON.stringify(preps.map(p => ({ ...p, recipe_ingredients: ingredientsForRecipe.filter(ri => ri.preparation_id === p.id) })))));
    }
    this.isTechSheetModalOpen.set(true);
  }

  closeTechSheetModal() { this.isTechSheetModalOpen.set(false); }
  
  addPreparation() {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return;
    this.currentPreparations.update(preps => [...preps, { id: `temp-${uuidv4()}`, recipe_id: this.selectedRecipeForTechSheet()!.id, name: `Nova Preparação ${preps.length + 1}`, station_id: this.stations()[0]?.id || '', prep_instructions: '', display_order: preps.length, created_at: new Date().toISOString(), user_id: userId, recipe_ingredients: [] }]);
  }

  removePreparation(prepId: string) { this.currentPreparations.update(preps => preps.filter(p => p.id !== prepId)); }
  updatePreparationField(prepId: string, field: keyof RecipePreparation, value: string) { this.currentPreparations.update(preps => preps.map(p => p.id === prepId ? { ...p, [field]: value } : p)); }
  handleSearchBlur() { setTimeout(() => this.techSheetSearchTerm.set(''), 150); }

  addIngredientToTechSheet(prepId: string, ingredient: Ingredient) {
    const userId = this.authService.currentUser()?.id; if (!userId) return;
    this.currentPreparations.update(preps => preps.map(p => p.id === prepId ? { ...p, recipe_ingredients: [...p.recipe_ingredients, { recipe_id: p.recipe_id, preparation_id: p.id, ingredient_id: ingredient.id, quantity: 1, user_id: userId, ingredients: { name: ingredient.name, unit: ingredient.unit, cost: ingredient.cost } }] } : p));
    this.techSheetSearchTerm.set('');
  }

  removeIngredientFromTechSheet(prepId: string, ingredientId: string) { this.currentPreparations.update(preps => preps.map(p => p.id === prepId ? { ...p, recipe_ingredients: p.recipe_ingredients.filter(ri => ri.ingredient_id !== ingredientId) } : p)); }
  updateTechSheetIngredientQuantity(prepId: string, ingredientId: string, event: Event) {
    const quantity = parseFloat((event.target as HTMLInputElement).value);
    if (!isNaN(quantity) && quantity >= 0) this.currentPreparations.update(preps => preps.map(p => p.id === prepId ? { ...p, recipe_ingredients: p.recipe_ingredients.map(ri => ri.ingredient_id === ingredientId ? { ...ri, quantity } : ri) } : p));
  }

  async saveTechSheet() {
    const recipe = this.selectedRecipeForTechSheet(); if (!recipe) return;
    const updates = { operational_cost: this.operationalCost(), price: this.techSheetSellingPrice(), prep_time_in_minutes: this.prepTimeInMinutes() };
    const preps = this.currentPreparations().map(p => ({ ...p, recipe_ingredients: p.recipe_ingredients.filter(ri => ri.quantity > 0) }));
    const result = await this.recipeDataService.saveTechnicalSheet(recipe.id, updates, preps);
    if (result.success) this.closeTechSheetModal();
    else alert(`Falha ao salvar. Erro: ${result.error?.message}`);
  }

  async regenerateTechSheetWithAI() {
    const recipe = this.selectedRecipeForTechSheet(); if (!recipe) return;
    this.isRegeneratingWithAI.set(true);
    try {
        const aiResult = await this.aiRecipeService.generateTechSheetForRecipe(recipe);
        this.currentPreparations.set(aiResult.preparations);
        this.operationalCost.set(aiResult.operational_cost);
        this.prepTimeInMinutes.set(aiResult.prep_time_in_minutes);
    } catch (e) { alert(`Erro: ${e instanceof Error ? e.message : String(e)}`); } 
    finally { this.isRegeneratingWithAI.set(false); }
  }

  isNewIngredientModalOpen = signal(false);
  newIngredientName = signal('');
  newIngredientUnit = signal<IngredientUnit>('g');
  newIngredientCost = signal<number>(0);
  availableUnits: IngredientUnit[] = ['g', 'kg', 'ml', 'l', 'un'];
  activePrepForIngredientAdd = signal<string | null>(null);

  openNewIngredientModal(prepId: string) {
    this.newIngredientName.set(this.techSheetSearchTerm());
    this.activePrepForIngredientAdd.set(prepId);
    this.isNewIngredientModalOpen.set(true);
    this.techSheetSearchTerm.set('');
  }
  closeNewIngredientModal() { this.isNewIngredientModalOpen.set(false); }
  async createAndAddIngredient() {
    const prepId = this.activePrepForIngredientAdd(); if (!prepId) return;
    const data = { name: this.newIngredientName().trim(), unit: this.newIngredientUnit(), cost: this.newIngredientCost() || 0, stock: 0, min_stock: 0 };
    if (!data.name) { alert('Nome é obrigatório.'); return; }
    const { success, error, data: created } = await this.inventoryDataService.addIngredient(data);
    if (success && created) { this.addIngredientToTechSheet(prepId, created); this.closeNewIngredientModal(); } 
    else alert(`Falha ao criar: ${error?.message}`);
  }

  isAddRecipeModalOpen = signal(false);
  newRecipeForm = signal<NewRecipeForm>({ name: '', category_id: '', description: '', prep_time_in_minutes: 15 });
  isGeneratingTechSheet = signal(false);

  openAddRecipeModal() {
    this.newRecipeForm.set({ name: '', category_id: this.recipeCategories()[0]?.id || '', description: '', prep_time_in_minutes: 15 });
    this.isAddRecipeModalOpen.set(true);
  }
  closeAddRecipeModal() { this.isAddRecipeModalOpen.set(false); }
  updateNewRecipeFormField(field: keyof NewRecipeForm, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.newRecipeForm.update(form => ({ ...form, [field]: field === 'prep_time_in_minutes' ? parseInt(value, 10) : value }));
  }
  async saveNewRecipe() {
    const form = this.newRecipeForm();
    if (!form.name || !form.category_id) { alert('Preencha Nome e Categoria.'); return; }
    const { success, error, data: newRecipe } = await this.recipeDataService.addRecipe(form);
    if (success && newRecipe) { this.closeAddRecipeModal(); this.openTechSheetModal(newRecipe); } 
    else alert(`Falha: ${error?.message}`);
  }
  async generateTechSheetWithAI() {
    const form = this.newRecipeForm(); if (!form.name.trim()) { alert('Insira o nome do prato.'); return; }
    this.isGeneratingTechSheet.set(true);
    try {
        const { recipe, preparations } = await this.aiRecipeService.generateFullRecipe(form.name);
        this.closeAddRecipeModal();
        this.openTechSheetModal(recipe, preparations);
    } catch (e) { alert(`Erro: ${e instanceof Error ? e.message : String(e)}`); } 
    finally { this.isGeneratingTechSheet.set(false); }
  }

  async toggleAvailability(recipe: Recipe) {
    if (!recipe.hasStock) return;
    const { success, error } = await this.recipeDataService.updateRecipeAvailability(recipe.id, !recipe.is_available);
    if (!success) alert(`Falha: ${error?.message}`);
  }

  requestDeleteRecipe(recipe: Recipe) { this.recipePendingDeletion.set(recipe); }
  cancelDeleteRecipe() { this.recipePendingDeletion.set(null); }
  async confirmDeleteRecipe() {
    const recipe = this.recipePendingDeletion();
    if (recipe) {
        const { success, error } = await this.recipeDataService.deleteRecipe(recipe.id);
        if (!success) alert(`Falha: ${error?.message}`);
        this.recipePendingDeletion.set(null);
    }
  }
}