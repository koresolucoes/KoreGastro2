
import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Recipe, RecipeIngredient, Ingredient, Category, IngredientUnit, Station, RecipePreparation, RecipeSubRecipe } from '../../models/db.models';
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

type TechSheetItem = 
    { type: 'ingredient', data: RecipeIngredient } | 
    { type: 'sub_recipe', data: RecipeSubRecipe };

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
  // FIX: Correctly access recipeCosts from the state service. This property is added in supabase-state.service.ts.
  recipeCosts = this.stateService.recipeCosts;

  searchTerm = signal('');
  selectedCategoryId = signal<string | 'all'>('all');
  recipePendingDeletion = signal<Recipe | null>(null);

  recipeCategoryMap = computed(() => new Map(this.recipeCategories().map(cat => [cat.id, cat.name])));
  
  // FIX: Changed this.recipes() to this.recipesWithStockStatus() which is an available property.
  subRecipes = computed(() => this.recipesWithStockStatus().filter(r => r.is_sub_recipe));

  recipeTechSheetStatus = computed(() => {
      const statusMap = new Map<string, { count: number; cost: number }>();
      for (const recipe of this.recipesWithStockStatus()) {
          const costInfo = this.recipeCosts().get(recipe.id);
          statusMap.set(recipe.id, {
              count: costInfo?.ingredientCount ?? 0,
              cost: costInfo?.totalCost ?? 0,
          });
      }
      return statusMap;
  });

  filteredRecipes = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const categoryId = this.selectedCategoryId();
    return this.recipesWithStockStatus().filter(recipe => 
      !recipe.is_sub_recipe &&
      recipe.name.toLowerCase().includes(term) && 
      (categoryId === 'all' || recipe.category_id === categoryId)
    );
  });

  isTechSheetModalOpen = signal(false);
  selectedRecipeForTechSheet = signal<Recipe | null>(null);
  currentItems = signal<TechSheetItem[]>([]);
  techSheetSearchTerm = signal('');
  techSheetSellingPrice = signal<number>(0);
  isSubRecipe = signal<boolean>(false);
  
  filteredSearchItems = computed(() => {
    const term = this.techSheetSearchTerm().toLowerCase();
    if (!term) return [];
    const currentItemIds = new Set(this.currentItems().map(item => item.type === 'ingredient' ? item.data.ingredient_id : item.data.child_recipe_id));
    
    const ingredients = this.ingredients()
      .filter(i => !currentItemIds.has(i.id) && i.name.toLowerCase().includes(term))
      .map(i => ({ type: 'ingredient' as const, id: i.id, name: i.name, unit: i.unit, data: i }));
      
    const subRecipes = this.subRecipes()
      .filter(r => r.id !== this.selectedRecipeForTechSheet()?.id && !currentItemIds.has(r.id) && r.name.toLowerCase().includes(term))
      .map(r => ({ type: 'sub_recipe' as const, id: r.id, name: r.name, unit: 'un', data: r }));
      
    return [...ingredients, ...subRecipes].slice(0, 10);
  });
  
  techSheetTotalCost = computed(() => {
      const recipeId = this.selectedRecipeForTechSheet()?.id;
      if (!recipeId) return 0;
      return this.recipeCosts().get(recipeId)?.totalCost ?? 0;
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
  // FIX: Changed this.recipes() to this.recipesWithStockStatus() which is an available property.
  getSubRecipeDetails = (id: string) => this.recipesWithStockStatus().find(r => r.id === id);

  openTechSheetModal(recipe: Recipe) {
    this.selectedRecipeForTechSheet.set(recipe);
    this.techSheetSellingPrice.set(recipe.price || 0);
    this.isSubRecipe.set(recipe.is_sub_recipe);

    const ingredients = this.stateService.recipeIngredients()
      .filter(ri => ri.recipe_id === recipe.id)
      .map(ri => ({ type: 'ingredient' as const, data: ri }));
      
    // FIX: Correctly access recipeSubRecipes from state service. This property is added in supabase-state.service.ts.
    const subRecipes = this.stateService.recipeSubRecipes()
      .filter(rsr => rsr.parent_recipe_id === recipe.id)
      .map(rsr => ({ type: 'sub_recipe' as const, data: rsr }));

    this.currentItems.set([...ingredients, ...subRecipes]);
    this.isTechSheetModalOpen.set(true);
  }

  closeTechSheetModal() { this.isTechSheetModalOpen.set(false); }
  
  addItemToTechSheet(item: { type: 'ingredient' | 'sub_recipe', id: string, data: Ingredient | Recipe }) {
    const userId = this.authService.currentUser()?.id;
    if (!userId || !this.selectedRecipeForTechSheet()) return;

    if (item.type === 'ingredient') {
      const newIngredientItem: TechSheetItem = {
        type: 'ingredient',
        data: {
          recipe_id: this.selectedRecipeForTechSheet()!.id,
          ingredient_id: item.id,
          quantity: 1,
          preparation_id: 'default',
          user_id: userId,
          ingredients: { name: item.data.name, unit: (item.data as Ingredient).unit, cost: (item.data as Ingredient).cost }
        }
      };
      this.currentItems.update(items => [...items, newIngredientItem]);
    } else { // sub_recipe
      const newSubRecipeItem: TechSheetItem = {
        type: 'sub_recipe',
        data: {
          parent_recipe_id: this.selectedRecipeForTechSheet()!.id,
          child_recipe_id: item.id,
          quantity: 1,
          user_id: userId,
          recipes: { id: item.data.id, name: item.data.name }
        }
      };
      this.currentItems.update(items => [...items, newSubRecipeItem]);
    }
    this.techSheetSearchTerm.set('');
  }

  removeItemFromTechSheet(itemId: string) {
    this.currentItems.update(items => items.filter(item => (item.type === 'ingredient' ? item.data.ingredient_id : item.data.child_recipe_id) !== itemId));
  }
  
  updateItemQuantity(itemId: string, event: Event) {
    const quantity = parseFloat((event.target as HTMLInputElement).value);
    if (!isNaN(quantity) && quantity >= 0) {
      this.currentItems.update(items => items.map(item => {
        if ((item.type === 'ingredient' ? item.data.ingredient_id : item.data.child_recipe_id) === itemId) {
          return { ...item, data: { ...item.data, quantity } };
        }
        return item;
      }));
    }
  }

  async saveTechSheet() {
    const recipe = this.selectedRecipeForTechSheet(); if (!recipe) return;
    const recipeUpdates = { price: this.techSheetSellingPrice(), is_sub_recipe: this.isSubRecipe() };
    
    const ingredients = this.currentItems().filter(item => item.type === 'ingredient').map(item => (item as { type: 'ingredient', data: RecipeIngredient }).data);
    const subRecipes = this.currentItems().filter(item => item.type === 'sub_recipe').map(item => (item as { type: 'sub_recipe', data: RecipeSubRecipe }).data);

    const result = await this.recipeDataService.saveTechnicalSheet(recipe.id, recipeUpdates, ingredients, subRecipes);
    if (result.success) this.closeTechSheetModal();
    else alert(`Falha ao salvar. Erro: ${result.error?.message}`);
  }

  async regenerateTechSheetWithAI() {
    // This might need adjustment to handle sub-recipes correctly
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
    if (success && newRecipe) { 
        this.closeAddRecipeModal(); 
        this.openTechSheetModal(newRecipe); 
    } 
    else alert(`Falha: ${error?.message}`);
  }
  
  async generateTechSheetWithAI() {
    const form = this.newRecipeForm(); if (!form.name.trim()) { alert('Insira o nome do prato.'); return; }
    this.isGeneratingTechSheet.set(true);
    try {
        const { recipe, items } = await this.aiRecipeService.generateFullRecipe(form.name);
        this.closeAddRecipeModal();
        this.openTechSheetModal(recipe);
        // FIX: The type error here is resolved by fixing the return type in ai-recipe.service.ts
        this.currentItems.set(items);
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
