

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

interface QuickAddIngredientForm {
  name: string;
  unit: IngredientUnit;
  cost: number;
}

const FINAL_ASSEMBLY_ID = 'final-assembly';

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
  recipeCosts = this.stateService.recipeCosts;

  searchTerm = signal('');
  selectedCategoryId = signal<string | 'all'>('all');
  recipePendingDeletion = signal<Recipe | null>(null);

  recipeCategoryMap = computed(() => new Map(this.recipeCategories().map(cat => [cat.id, cat.name])));
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

  // -- Tech Sheet Modal State --
  isTechSheetModalOpen = signal(false);
  selectedRecipeForTechSheet = signal<Recipe | null>(null);
  currentItems = signal<TechSheetItem[]>([]);
  currentPreparations = signal<RecipePreparation[]>([]);
  techSheetSellingPrice = signal<number>(0);
  isSubRecipe = signal<boolean>(false);
  
  // -- Item Search & Add --
  finalAssemblySearchTerm = signal('');
  prepItemSearchTerm = signal<{[prepId: string]: string}>({});
  
  // -- Quick Add Ingredient Modal State --
  isQuickAddIngredientModalOpen = signal(false);
  newIngredientForm = signal<QuickAddIngredientForm>({ name: '', unit: 'g', cost: 0 });
  quickAddContext = signal<{ prepId: string } | null>(null);

  finalAssemblyItems = computed(() => {
    const prepIds = new Set(this.currentPreparations().map(p => p.id));
    return this.currentItems().filter(item => 
      item.type === 'sub_recipe' || 
      (item.type === 'ingredient' && !prepIds.has(item.data.preparation_id))
    );
  });

  filteredFinalAssemblySearchItems = computed(() => {
    const term = this.finalAssemblySearchTerm().toLowerCase();
    if (!term) return [];
    
    const currentItemIds = new Set(this.currentItems().map(item => item.type === 'ingredient' ? item.data.ingredient_id : item.data.child_recipe_id));
    
    const ingredients = this.ingredients()
      .filter(i => !currentItemIds.has(i.id) && i.name.toLowerCase().includes(term))
      .map(i => ({ type: 'ingredient' as const, id: i.id, name: i.name, unit: i.unit, data: i }));
      
    const subRecipes = this.subRecipes()
      .filter(r => r.id !== this.selectedRecipeForTechSheet()?.id && !currentItemIds.has(r.id) && r.name.toLowerCase().includes(term))
      .map(r => ({ type: 'sub_recipe' as const, id: r.id, name: r.name, unit: 'un' as IngredientUnit, data: r }));
    
    // FIX: Explicitly type `results` to allow for the 'action' type to be added later.
    const results: Array<{type: 'ingredient' | 'sub_recipe' | 'action', id: string, name: string, unit: string, data: any}> = [...ingredients, ...subRecipes].slice(0, 10);
    const exactMatch = this.ingredients().some(i => i.name.toLowerCase() === term);
    if (!exactMatch) {
      results.push({ type: 'action' as const, id: 'create_new_ingredient', name: `Criar "${this.finalAssemblySearchTerm()}"`, unit: '' as IngredientUnit, data: {} as any });
    }
    return results;
  });

  filteredPrepSearchItems(prepId: string) {
    const term = this.prepItemSearchTerm()[prepId]?.toLowerCase() || '';
    if (!term) return [];
    const currentItemIds = new Set(this.currentItems().map(item => item.type === 'ingredient' ? item.data.ingredient_id : item.data.child_recipe_id));
    
    const ingredients = this.ingredients()
      .filter(i => !currentItemIds.has(i.id) && i.name.toLowerCase().includes(term))
      .map(i => ({ type: 'ingredient' as const, id: i.id, name: i.name, unit: i.unit, data: i }))
      .slice(0, 5);

    // FIX: Explicitly type `results` to allow for the 'action' type to be added later.
    const results: Array<{type: 'ingredient' | 'action', id: string, name: string, unit: string, data: any}> = ingredients;

    const exactMatch = this.ingredients().some(i => i.name.toLowerCase() === term);
    if (!exactMatch) {
      results.push({ type: 'action' as const, id: 'create_new_ingredient', name: `Criar "${term}"`, unit: '' as IngredientUnit, data: {} as any });
    }
    return results;
  }

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
  getSubRecipeDetails = (id: string) => this.recipesWithStockStatus().find(r => r.id === id);

  openTechSheetModal(recipe: Recipe) {
    this.selectedRecipeForTechSheet.set(recipe);
    this.techSheetSellingPrice.set(recipe.price || 0);
    this.isSubRecipe.set(recipe.is_sub_recipe);
    
    const preparations = this.stateService.recipePreparations().filter(p => p.recipe_id === recipe.id);
    this.currentPreparations.set(preparations);

    const ingredients = this.stateService.recipeIngredients()
      .filter(ri => ri.recipe_id === recipe.id)
      .map(ri => ({ type: 'ingredient' as const, data: ri }));
      
    const subRecipes = this.stateService.recipeSubRecipes()
      .filter(rsr => rsr.parent_recipe_id === recipe.id)
      .map(rsr => ({ type: 'sub_recipe' as const, data: rsr }));

    this.currentItems.set([...ingredients, ...subRecipes]);
    this.isTechSheetModalOpen.set(true);
  }

  closeTechSheetModal() { this.isTechSheetModalOpen.set(false); }
  
  addItemToTechSheet(item: { type: 'ingredient' | 'sub_recipe' | 'action', id: string, data: Ingredient | Recipe }, prepId: string = FINAL_ASSEMBLY_ID) {
    if (item.type === 'action') {
      this.openQuickAddIngredientModal(this.prepItemSearchTerm()[prepId] || this.finalAssemblySearchTerm(), prepId);
      return;
    }
    
    const userId = this.authService.currentUser()?.id;
    if (!userId || !this.selectedRecipeForTechSheet()) return;

    if (item.type === 'ingredient') {
      const newIngredientItem: TechSheetItem = {
        type: 'ingredient',
        data: {
          recipe_id: this.selectedRecipeForTechSheet()!.id,
          ingredient_id: item.id,
          quantity: 1,
          preparation_id: prepId,
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
    this.finalAssemblySearchTerm.set('');
    this.prepItemSearchTerm.update(terms => ({ ...terms, [prepId]: '' }));
  }

  removeItemFromTechSheet(itemId: string) {
    this.currentItems.update(items => items.filter(item => (item.type === 'ingredient' ? item.data.ingredient_id : item.data.child_recipe_id) !== itemId));
  }
  
  updateItemQuantity(itemId: string, event: Event) {
    const quantity = parseFloat((event.target as HTMLInputElement).value);
    if (isNaN(quantity) || quantity < 0) return;
    this.currentItems.update(items =>
      items.map((item): TechSheetItem => {
        if (item.type === 'ingredient' && item.data.ingredient_id === itemId) return { type: 'ingredient', data: { ...item.data, quantity } };
        if (item.type === 'sub_recipe' && item.data.child_recipe_id === itemId) return { type: 'sub_recipe', data: { ...item.data, quantity } };
        return item;
      })
    );
  }
  
  async saveTechSheet() {
    const recipe = this.selectedRecipeForTechSheet(); if (!recipe) return;
    const recipeUpdates = { price: this.techSheetSellingPrice(), is_sub_recipe: this.isSubRecipe() };
    const preps = this.currentPreparations();
    const ingredients = this.currentItems().filter(i => i.type === 'ingredient').map(i => (i as { data: RecipeIngredient }).data);
    const subRecipes = this.currentItems().filter(i => i.type === 'sub_recipe').map(i => (i as { data: RecipeSubRecipe }).data);

    const { success, error } = await this.recipeDataService.saveTechnicalSheet(recipe.id, recipeUpdates, preps, ingredients, subRecipes);
    if (success) this.closeTechSheetModal();
    else alert(`Falha ao salvar. Erro: ${error?.message}`);
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

  addPreparation() {
    const userId = this.authService.currentUser()?.id;
    if (!userId || !this.selectedRecipeForTechSheet()) return;
    const newPrep: RecipePreparation = {
      id: `temp-${uuidv4()}`,
      recipe_id: this.selectedRecipeForTechSheet()!.id,
      station_id: this.stations()[0]?.id || '',
      name: 'Nova Etapa',
      prep_instructions: '',
      display_order: this.currentPreparations().length,
      created_at: new Date().toISOString(),
      user_id: userId,
    };
    this.currentPreparations.update(preps => [...preps, newPrep]);
  }
  
  removePreparation(prepId: string) {
    this.currentPreparations.update(preps => preps.filter(p => p.id !== prepId));
    this.currentItems.update(items => items.filter(i => i.type !== 'ingredient' || i.data.preparation_id !== prepId));
  }
  
  updatePreparationField(prepId: string, field: keyof RecipePreparation, value: string) {
    this.currentPreparations.update(preps => preps.map(p => 
      p.id === prepId ? { ...p, [field]: value } : p
    ));
  }

  updatePrepSearchTerm(prepId: string, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.prepItemSearchTerm.update(terms => ({
      ...terms,
      [prepId]: value
    }));
  }

  openQuickAddIngredientModal(name: string, prepId: string) {
    this.newIngredientForm.set({ name: name, unit: 'g', cost: 0 });
    this.quickAddContext.set({ prepId });
    this.isQuickAddIngredientModalOpen.set(true);
  }

  closeQuickAddIngredientModal() {
    this.isQuickAddIngredientModalOpen.set(false);
  }

  updateNewIngredientFormField(field: keyof QuickAddIngredientForm, value: string) {
    this.newIngredientForm.update(form => ({
        ...form,
        [field]: (field === 'cost' ? parseFloat(value) : value) as any
    }));
  }

  async saveNewIngredient() {
    const form = this.newIngredientForm();
    if (!form.name.trim()) { alert('Nome do ingrediente é obrigatório.'); return; }
    
    const { success, error, data: newIngredient } = await this.inventoryDataService.addIngredient({
      name: form.name.trim(),
      unit: form.unit,
      cost: form.cost,
      stock: 0,
      min_stock: 0,
    });

    if (success && newIngredient) {
      this.addItemToTechSheet({ type: 'ingredient', id: newIngredient.id, data: newIngredient }, this.quickAddContext()!.prepId);
      this.closeQuickAddIngredientModal();
    } else {
      alert(`Falha ao criar ingrediente: ${error?.message}`);
    }
  }
}