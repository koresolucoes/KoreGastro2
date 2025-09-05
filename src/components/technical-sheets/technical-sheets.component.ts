import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { v4 as uuidv4 } from 'uuid';
import { Recipe, Category, Ingredient, Station, RecipePreparation, RecipeIngredient, RecipeSubRecipe, IngredientUnit } from '../../models/db.models';
import { RecipeForm } from '../../models/app.models';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { RecipeDataService } from '../../services/recipe-data.service';
import { AiRecipeService } from '../../services/ai-recipe.service';
import { NotificationService } from '../../services/notification.service';
import { SettingsDataService } from '../../services/settings-data.service';
import { InventoryDataService } from '../../services/inventory-data.service';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';

const EMPTY_RECIPE_FORM: RecipeForm = {
  recipe: {
    name: '',
    description: '',
    price: 0,
    category_id: '',
    prep_time_in_minutes: 0,
    is_available: true,
    is_sub_recipe: false,
    source_ingredient_id: null,
  },
  preparations: [],
  ingredients: [],
  subRecipes: [],
};

const EMPTY_INGREDIENT: Partial<Ingredient> = {
    name: '',
    unit: 'un',
    cost: 0,
    stock: 0,
    min_stock: 0,
};

@Component({
  selector: 'app-technical-sheets',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './technical-sheets.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TechnicalSheetsComponent implements OnInit, OnDestroy {
  private stateService = inject(SupabaseStateService);
  private recipeDataService = inject(RecipeDataService);
  private settingsDataService = inject(SettingsDataService);
  private inventoryDataService = inject(InventoryDataService);
  private aiService = inject(AiRecipeService);
  private notificationService = inject(NotificationService);
  private route = inject(ActivatedRoute);
  private routeSub: Subscription | undefined;

  // Data from state
  allRecipes = this.stateService.recipes;
  categories = this.stateService.categories;
  ingredients = this.stateService.ingredients;
  stations = this.stateService.stations;
  recipeCosts = this.stateService.recipeCosts;
  recipeIngredients = this.stateService.recipeIngredients;
  recipePreparations = this.stateService.recipePreparations;
  recipeSubRecipes = this.stateService.recipeSubRecipes;
  ingredientCategories = this.stateService.ingredientCategories;
  suppliers = this.stateService.suppliers;

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

  // "Add on the fly" modal states
  isAddingCategory = signal(false);
  newCategoryName = signal('');
  isAddingStation = signal(false);
  newStationName = signal('');
  editingPrepForStationId = signal<string | null>(null); // To know which prep to update
  isAddingIngredient = signal(false);
  newIngredientForm = signal<Partial<Ingredient>>(EMPTY_INGREDIENT);
  availableUnits: IngredientUnit[] = ['g', 'kg', 'ml', 'l', 'un'];

  ngOnInit() {
    this.routeSub = this.route.queryParamMap.subscribe(params => {
      const recipeId = params.get('recipeId');
      if (recipeId) {
        // Wait for data to be loaded before trying to open the recipe
        if (this.stateService.isDataLoaded()) {
            const recipeToOpen = this.allRecipes().find(r => r.id === recipeId);
            if (recipeToOpen) {
              this.openEditModal(recipeToOpen);
            }
        }
      }
    });
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
  }

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

  linkedIngredient = computed(() => {
    const sourceId = this.recipeForm().recipe.source_ingredient_id;
    if (!sourceId) return null;
    return this.ingredients().find(i => i.id === sourceId);
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

  // --- Add on the fly methods ---
  openAddCategoryModal() { this.isAddingCategory.set(true); this.newCategoryName.set(''); }
  closeAddCategoryModal() { this.isAddingCategory.set(false); }
  async saveNewCategory() {
    const name = this.newCategoryName().trim();
    if (!name) return;
    const { success, error, data: newCategory } = await this.recipeDataService.addRecipeCategory(name);
    if (success && newCategory) {
      this.updateRecipeField('category_id', newCategory.id);
      this.closeAddCategoryModal();
    } else {
      await this.notificationService.alert(`Erro: ${error?.message}`);
    }
  }

  openAddStationModal(prepId: string) {
    this.editingPrepForStationId.set(prepId);
    this.newStationName.set('');
    this.isAddingStation.set(true);
  }
  closeAddStationModal() { this.isAddingStation.set(false); this.editingPrepForStationId.set(null); }
  async saveNewStation() {
    const name = this.newStationName().trim();
    const prepId = this.editingPrepForStationId();
    if (!name || !prepId) return;
    const { success, error, data: newStation } = await this.settingsDataService.addStation(name);
    if (success && newStation) {
      this.updatePreparationField(prepId, 'station_id', newStation.id);
      this.closeAddStationModal();
    } else {
      await this.notificationService.alert(`Erro: ${error?.message}`);
    }
  }
  
  openAddIngredientModal() {
    this.stopAddingItem(); // Close the search popover first
    this.newIngredientForm.set({ ...EMPTY_INGREDIENT });
    this.isAddingIngredient.set(true);
  }
  closeAddIngredientModal() { this.isAddingIngredient.set(false); }
  updateNewIngredientField(field: keyof Ingredient, value: any) {
    this.newIngredientForm.update(form => ({ ...form, [field]: value }));
  }
  async saveNewIngredient() {
    const form = this.newIngredientForm();
    if (!form.name?.trim()) {
      await this.notificationService.alert('O nome do ingrediente é obrigatório.');
      return;
    }
    const { success, error, data: newIngredient } = await this.inventoryDataService.addIngredient(form);
    if (success && newIngredient) {
      // Re-open the add popover and add the new item automatically
      const prepId = this.addingToPreparationId();
      if (prepId) {
        this.addIngredientToPrep(newIngredient);
      }
      this.closeAddIngredientModal();
    } else {
      await this.notificationService.alert(`Erro: ${error?.message}`);
    }
  }

  async linkOrCreateStockItem() {
    const recipe = this.recipeForm().recipe;
    if (!recipe.name) {
      await this.notificationService.alert("Dê um nome à sub-receita antes de criar um item de estoque.");
      return;
    }

    const { success, error, data: newIngredient } = await this.inventoryDataService.addIngredient({
      name: recipe.name,
      unit: 'un', // Default unit, can be changed later
      cost: this.formTotalCost(),
      stock: 0,
      min_stock: 0,
    });

    if (success && newIngredient) {
      this.updateRecipeField('source_ingredient_id', newIngredient.id);
      await this.notificationService.alert(`Item "${newIngredient.name}" criado no estoque!`, 'Sucesso');
    } else {
      await this.notificationService.alert(`Erro ao criar item de estoque: ${error?.message}`);
    }
  }

  unlinkStockItem() {
    this.updateRecipeField('source_ingredient_id', null);
  }

  // --- API Calls ---
  async saveTechnicalSheet() {
    const form = this.recipeForm();
    if (!form.recipe.name) { await this.notificationService.alert('O nome da receita é obrigatório.'); return; }
    if (!form.recipe.category_id) { await this.notificationService.alert('A categoria da receita é obrigatória.'); return; }
    
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

  async toggleAvailability(recipe: Recipe) {
    const newAvailability = !recipe.is_available;
    const { success, error } = await this.recipeDataService.updateRecipeAvailability(recipe.id, newAvailability);

    if (!success) {
      await this.notificationService.alert(`Erro ao atualizar disponibilidade: ${error?.message}`);
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