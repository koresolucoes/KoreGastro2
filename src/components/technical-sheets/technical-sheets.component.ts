import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { v4 as uuidv4 } from 'uuid';
import { Recipe, Category, Ingredient, Station, RecipePreparation, RecipeIngredient, RecipeSubRecipe } from '../../models/db.models';
import { RecipeForm } from '../../models/app.models';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { RecipeDataService } from '../../services/recipe-data.service';
import { AiRecipeService } from '../../services/ai-recipe.service';
import { NotificationService } from '../../services/notification.service';

const EMPTY_RECIPE_FORM: RecipeForm = {
  recipe: {
    name: '',
    description: '',
    price: 0,
    category_id: '',
    prep_time_in_minutes: 0,
    is_available: true,
    is_sub_recipe: false,
  },
  preparations: [],
  ingredients: [],
  subRecipes: [],
};

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
  private aiService = inject(AiRecipeService);
  private notificationService = inject(NotificationService);

  // Data from state
  allRecipes = this.stateService.recipes;
  categories = this.stateService.categories;
  ingredients = this.stateService.ingredients;
  stations = this.stateService.stations;
  recipeCosts = this.stateService.recipeCosts;
  recipeIngredients = this.stateService.recipeIngredients;
  recipePreparations = this.stateService.recipePreparations;
  recipeSubRecipes = this.stateService.recipeSubRecipes;

  // Component state
  viewMode = signal<'list' | 'edit'>('list');
  isModalOpen = computed(() => this.viewMode() === 'edit');
  searchTerm = signal('');
  selectedRecipeId = signal<string | null>(null);
  recipeForm = signal<RecipeForm>(EMPTY_RECIPE_FORM);
  recipePendingDeletion = signal<Recipe | null>(null);
  
  // AI State
  isAiLoading = signal(false);
  aiSuggestions = signal<string | null>(null);

  // Popover state for adding items
  addingToPreparationId = signal<string | null>(null);
  itemSearchTerm = signal('');

  filteredRecipes = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const recipes = this.allRecipes().map(r => ({
      ...r,
      cost: this.recipeCosts().get(r.id) ?? { totalCost: 0, ingredientCount: 0, rawIngredients: new Map() }
    }));
    if (!term) return recipes;
    return recipes.filter(r => r.name.toLowerCase().includes(term));
  });

  editingRecipe = computed(() => {
      const id = this.selectedRecipeId();
      if (!id) return null;
      return this.allRecipes().find(r => r.id === id);
  });

  formTotalCost = computed(() => {
    const form = this.recipeForm();
    let total = 0;
    const ingredientsMap = new Map(this.ingredients().map(i => [i.id, i]));
    const subRecipeCostMap = this.recipeCosts();

    for (const item of form.ingredients) {
      const ingredient = ingredientsMap.get(item.ingredient_id);
      if (ingredient) {
        total += ingredient.cost * (item.quantity || 0);
      }
    }
    for (const item of form.subRecipes) {
      const subRecipeCost = subRecipeCostMap.get(item.child_recipe_id)?.totalCost ?? 0;
      total += subRecipeCost * (item.quantity || 0);
    }
    return total;
  });

  filteredItemsForAdding = computed(() => {
    const term = this.itemSearchTerm().toLowerCase();
    const prepId = this.addingToPreparationId();

    if (!term || !prepId) return { ingredients: [], subRecipes: [] };

    if (prepId === 'sub-recipe') {
        const currentIds = new Set(this.recipeForm().subRecipes.map(sr => sr.child_recipe_id));
        const subRecipes = this.allRecipes().filter(r => 
            r.id !== this.recipeForm().recipe.id &&
            r.is_sub_recipe && 
            !currentIds.has(r.id) && 
            r.name.toLowerCase().includes(term)
        ).slice(0, 5);
        return { ingredients: [], subRecipes };
    } else {
        const currentIds = new Set(this.recipeForm().ingredients.map(i => i.ingredient_id));
        const ingredients = this.ingredients().filter(i => 
            !currentIds.has(i.id) && i.name.toLowerCase().includes(term)
        ).slice(0, 5);
        return { ingredients, subRecipes: [] };
    }
  });
  
  // --- Methods ---

  openEditModal(recipe: Recipe) {
    this.selectedRecipeId.set(recipe.id);
    const preparations = this.recipePreparations().filter(p => p.recipe_id === recipe.id);
    const ingredients = this.recipeIngredients().filter(i => i.recipe_id === recipe.id);
    const subRecipes = this.recipeSubRecipes().filter(sr => sr.parent_recipe_id === recipe.id);

    this.recipeForm.set({
      recipe: { ...recipe },
      preparations: preparations.map(p => ({...p})),
      ingredients: ingredients.map(({ recipe_id, user_id, ingredients, ...rest }) => rest),
      subRecipes: subRecipes.map(({ parent_recipe_id, user_id, recipes, ...rest }) => rest),
    });
    this.aiSuggestions.set(null);
    this.viewMode.set('edit');
  }

  openAddModal() {
    this.selectedRecipeId.set(null);
    const firstCategoryId = this.categories()[0]?.id;
    this.recipeForm.set({
      ...EMPTY_RECIPE_FORM,
      recipe: { ...EMPTY_RECIPE_FORM.recipe, category_id: firstCategoryId },
    });
    this.aiSuggestions.set(null);
    this.viewMode.set('edit');
  }

  closeModal() {
    this.viewMode.set('list');
    this.selectedRecipeId.set(null);
  }
  
  updateRecipeField(field: keyof Omit<Recipe, 'id' | 'created_at' | 'hasStock'>, value: any) {
    this.recipeForm.update(form => ({
        ...form,
        recipe: { ...form.recipe, [field]: value }
    }));
  }

  // --- Preparations ---
  addPreparation() {
    this.recipeForm.update(form => ({
      ...form,
      preparations: [
        ...form.preparations,
        { id: uuidv4(), name: '', station_id: this.stations()[0]?.id ?? null, display_order: form.preparations.length }
      ]
    }));
  }

  removePreparation(prepId: string) {
    this.recipeForm.update(form => ({
        ...form,
        preparations: form.preparations.filter(p => p.id !== prepId),
        ingredients: form.ingredients.filter(i => i.preparation_id !== prepId)
    }));
  }

  updatePreparationField(prepId: string, field: keyof Omit<RecipePreparation, 'id' | 'created_at' | 'user_id' | 'recipe_id'>, value: any) {
    this.recipeForm.update(form => ({
      ...form,
      preparations: form.preparations.map(p => p.id === prepId ? { ...p, [field]: value } : p)
    }));
  }

  // --- Ingredients / Sub-Recipes (Form Helpers) ---
  getIngredientsForPreparation(prepId: string): Omit<RecipeIngredient, 'user_id' | 'recipe_id'>[] {
    return this.recipeForm().ingredients.filter(i => i.preparation_id === prepId);
  }

  updateFormIngredient(prepId: string, ingredientId: string, quantity: number) {
    if (isNaN(quantity) || quantity < 0) return;
    this.recipeForm.update(form => ({ ...form, ingredients: form.ingredients.map(i => i.preparation_id === prepId && i.ingredient_id === ingredientId ? { ...i, quantity } : i ) }));
  }

  removeFormIngredient(prepId: string, ingredientId: string) {
    this.recipeForm.update(form => ({ ...form, ingredients: form.ingredients.filter(i => !(i.preparation_id === prepId && i.ingredient_id === ingredientId)) }));
  }
  
  updateFormSubRecipe(childRecipeId: string, quantity: number) {
    if (isNaN(quantity) || quantity < 0) return;
    this.recipeForm.update(form => ({ ...form, subRecipes: form.subRecipes.map(sr => sr.child_recipe_id === childRecipeId ? { ...sr, quantity } : sr) }));
  }

  removeFormSubRecipe(childRecipeId: string) {
    this.recipeForm.update(form => ({ ...form, subRecipes: form.subRecipes.filter(sr => sr.child_recipe_id !== childRecipeId) }));
  }

  startAddingItem(prepId: string | null) { this.addingToPreparationId.set(prepId); this.itemSearchTerm.set(''); }
  stopAddingItem() { this.addingToPreparationId.set(null); }
  
  addIngredientToPrep(ingredient: Ingredient) {
    const prepId = this.addingToPreparationId();
    if (prepId && prepId !== 'sub-recipe') {
      this.recipeForm.update(form => ({ ...form, ingredients: [...form.ingredients, { ingredient_id: ingredient.id, quantity: 0, preparation_id: prepId }] }));
    }
    this.stopAddingItem();
  }

  addSubRecipeToPrep(recipe: Recipe) {
    this.recipeForm.update(form => ({ ...form, subRecipes: [...form.subRecipes, { child_recipe_id: recipe.id, quantity: 1 }] }));
    this.stopAddingItem();
  }

  getAddingToPreparationName(prepId: string | null): string {
    if (!prepId) return '';
    if (prepId === 'sub-recipe') return 'Sub-receitas';
    return this.recipeForm().preparations.find(p => p.id === prepId)?.name || 'Etapa';
  }

  // --- Data Lookups for Template ---
  getIngredientName(id: string): string { return this.ingredients().find(i => i.id === id)?.name ?? '?'; }
  getIngredientUnit(id: string): string { return this.ingredients().find(i => i.id === id)?.unit ?? '?'; }
  getSubRecipeName(id: string): string { return this.allRecipes().find(r => r.id === id)?.name ?? '?'; }

  // --- API Calls ---
  async saveTechnicalSheet() {
    const form = this.recipeForm();
    if (!form.recipe.name) { await this.notificationService.alert('O nome da receita é obrigatório.'); return; }
    if (!form.recipe.category_id) { await this.notificationService.alert('A categoria da receita é obrigatória.'); return; }
    
    // FIX: The 'cost' property is added to recipe objects for display purposes in 'filteredRecipes',
    // but it's not part of the `Recipe` type, causing a type error here. Casting to `any` allows
    // us to destructure it out along with `hasStock` before saving the recipe data.
    const { cost, hasStock, ...recipeData } = form.recipe as any;
    const recipeDataToSave = { ...recipeData, operational_cost: this.formTotalCost() };

    if (this.selectedRecipeId()) { // Update
      const { success, error } = await this.recipeDataService.saveTechnicalSheet( this.selectedRecipeId()!, recipeDataToSave, form.preparations as RecipePreparation[], form.ingredients as RecipeIngredient[], form.subRecipes as RecipeSubRecipe[] );
      if (success) { await this.notificationService.alert('Ficha técnica salva com sucesso!', 'Sucesso'); this.closeModal(); } 
      else { await this.notificationService.alert(`Erro ao salvar: ${error?.message}`); }
    } else { // Create
      const { success, error, data: newRecipe } = await this.recipeDataService.addRecipe(recipeDataToSave);
      if (success && newRecipe) {
        const { success: tsSuccess, error: tsError } = await this.recipeDataService.saveTechnicalSheet( newRecipe.id, {}, form.preparations as RecipePreparation[], form.ingredients as RecipeIngredient[], form.subRecipes as RecipeSubRecipe[] );
        if (tsSuccess) { await this.notificationService.alert('Receita criada com sucesso!', 'Sucesso'); this.closeModal(); } 
        else { await this.recipeDataService.deleteRecipe(newRecipe.id); await this.notificationService.alert(`Erro ao salvar ficha técnica: ${tsError?.message}`); }
      } else { await this.notificationService.alert(`Erro ao criar receita: ${error?.message}`); }
    }
  }

  requestDelete(recipe: Recipe) { this.recipePendingDeletion.set(recipe); }
  cancelDelete() { this.recipePendingDeletion.set(null); }
  
  async confirmDelete() {
    const recipe = this.recipePendingDeletion();
    if (recipe) {
      const { success, error } = await this.recipeDataService.deleteRecipe(recipe.id);
      if (success) {
        await this.notificationService.alert('Receita deletada com sucesso!', 'Sucesso');
        this.recipePendingDeletion.set(null);
        if (this.selectedRecipeId() === recipe.id) this.closeModal();
      } else {
        await this.notificationService.alert(`Erro ao deletar: ${error?.message}`);
      }
    }
  }
  
  async getMiseEnPlaceSuggestions() {
      const form = this.recipeForm();
      if (!form.recipe.name) {
          await this.notificationService.alert("Por favor, dê um nome à receita antes de pedir sugestões.");
          return;
      }
      this.isAiLoading.set(true);
      this.aiSuggestions.set(null);
      
      try {
          const suggestions = await this.aiService.getMiseEnPlaceSuggestions({
              name: form.recipe.name!,
              preparations: form.preparations.map(p => ({
                  name: p.name || 'Etapa sem nome',
                  ingredients: form.ingredients.filter(i => i.preparation_id === p.id).map(i => ({
                      name: this.getIngredientName(i.ingredient_id),
                      quantity: i.quantity,
                      unit: this.getIngredientUnit(i.ingredient_id),
                  })),
              })),
              subRecipes: form.subRecipes.map(sr => ({ name: this.getSubRecipeName(sr.child_recipe_id), quantity: sr.quantity })),
              finalAssemblyIngredients: [],
          });
          this.aiSuggestions.set(suggestions.replace(/\n/g, '<br>').replace(/\*/g, '•'));
      } catch (error) {
          await this.notificationService.alert(`Erro ao obter sugestões da IA: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      } finally {
          this.isAiLoading.set(false);
      }
  }
}