import { Component, ChangeDetectionStrategy, inject, signal, computed, WritableSignal, effect, untracked, input, output } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { FullRecipe, RecipeForm } from '../../../models/app.models';
import { Ingredient, Recipe, RecipeIngredient, RecipePreparation, RecipeSubRecipe, Station, Category as RecipeCategory } from '../../../models/db.models';
import { SupabaseStateService } from '../../../services/supabase-state.service';
import { AiRecipeService } from '../../../services/ai-recipe.service';
import { NotificationService } from '../../../services/notification.service';
import { RecipeDataService } from '../../../services/recipe-data.service';
import { SettingsDataService } from '../../../services/settings-data.service';
import { IngredientFormModalComponent } from '../ingredient-form-modal/ingredient-form-modal.component';
import { v4 as uuidv4 } from 'uuid';

@Component({
  selector: 'app-technical-sheet-editor',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DecimalPipe, IngredientFormModalComponent],
  templateUrl: './technical-sheet-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TechnicalSheetEditorComponent {
  private stateService = inject(SupabaseStateService);
  private aiService = inject(AiRecipeService);
  private notificationService = inject(NotificationService);
  private recipeDataService = inject(RecipeDataService);
  private settingsDataService = inject(SettingsDataService);
  
  initialRecipe = input<FullRecipe | null>();
  save = output<RecipeForm>();
  cancel = output<void>();

  // Form state
  recipeForm = signal<Partial<Recipe>>({});
  preparationsForm = signal<(Partial<RecipePreparation> & { id: string })[]>([]);
  ingredientsForm = signal<(Omit<RecipeIngredient, 'user_id' | 'recipe_id'> & { name?: string; unit?: string })[]>([]);
  subRecipesForm = signal<(Omit<RecipeSubRecipe, 'user_id' | 'parent_recipe_id'> & { name?: string })[]>([]);
  
  // UI state
  activeTab = signal<'details' | 'prep' | 'costs'>('details');
  ingredientSearchTerm = signal('');
  subRecipeSearchTerm = signal('');
  activePreparationId = signal<string | null>(null);
  isAddingRecipeCategory = signal(false);
  newRecipeCategoryName = signal('');
  isAddingStation = signal<string | null>(null); // holds prepId
  newStationName = signal('');
  isIngredientModalOpen = signal(false);
  
  // AI state
  isAiLoading = signal(false);
  aiSuggestions = signal('');

  // Data from services
  allIngredients = this.stateService.ingredients;
  recipeCategories = this.stateService.categories;
  stations = this.stateService.stations;
  recipeCosts = this.stateService.recipeCosts;

  constructor() {
    effect(() => {
      const recipe = this.initialRecipe();
      untracked(() => this.initializeForm(recipe));
    });
  }

  private initializeForm(recipe: FullRecipe | null) {
    if (recipe) {
      this.recipeForm.set({ ...recipe });
      this.preparationsForm.set(JSON.parse(JSON.stringify(recipe.preparations)));
      this.ingredientsForm.set(JSON.parse(JSON.stringify(recipe.ingredients)));
      this.subRecipesForm.set(JSON.parse(JSON.stringify(recipe.subRecipes)));
    } else {
      this.recipeForm.set({
        name: '', description: '', price: 0,
        category_id: this.recipeCategories()[0]?.id || '',
        is_available: true, is_sub_recipe: false,
      });
      this.preparationsForm.set([]);
      this.ingredientsForm.set([]);
      this.subRecipesForm.set([]);
    }
    this.aiSuggestions.set('');
  }

  // --- Computed properties for search and costs ---
  filteredIngredientsForSearch = computed(() => {
    const term = this.ingredientSearchTerm().toLowerCase();
    if (!term) return [];
    const currentIngredientIds = new Set(this.ingredientsForm().map(i => i.ingredient_id));
    return this.allIngredients()
      .filter(i => !currentIngredientIds.has(i.id) && i.name.toLowerCase().includes(term))
      .slice(0, 5);
  });

  filteredSubRecipesForSearch = computed(() => {
    const term = this.subRecipeSearchTerm().toLowerCase();
    const currentSubRecipeIds = new Set(this.subRecipesForm().map(i => i.child_recipe_id));
    const selfId = this.recipeForm().id;
    if (selfId) currentSubRecipeIds.add(selfId);
    return this.stateService.recipes()
      .filter(r => r.is_sub_recipe && !currentSubRecipeIds.has(r.id) && (!term || r.name.toLowerCase().includes(term)))
      .slice(0, 10);
  });
  
  formIngredientsCost = computed(() => {
    const ingredientsMap = new Map(this.allIngredients().map(i => [i.id, i]));
    return this.ingredientsForm().reduce((sum, item) => {
      const ingredient = ingredientsMap.get(item.ingredient_id);
      return sum + (ingredient?.cost || 0) * item.quantity;
    }, 0);
  });

  formSubRecipesCost = computed(() => {
    const costsMap = this.recipeCosts();
    return this.subRecipesForm().reduce((sum, item) => {
      const cost = costsMap.get(item.child_recipe_id)?.totalCost || 0;
      return sum + cost * item.quantity;
    }, 0);
  });

  totalFormCost = computed(() => this.formIngredientsCost() + this.formSubRecipesCost());

  profitMargin = computed(() => {
    const price = this.recipeForm().price ?? 0;
    const cost = this.totalFormCost();
    if (price === 0) return 0;
    return ((price - cost) / price) * 100;
  });

  // --- Helper methods for template ---
  getIngredientsForPreparation(prepId: string) {
    return this.ingredientsForm().filter(i => i.preparation_id === prepId);
  }

  // --- Form manipulation methods ---
  updateRecipeFormValue(field: keyof Recipe, value: any) {
    if (field === 'category_id' && value === 'add_new') {
      this.isAddingRecipeCategory.set(true);
      return;
    }
    this.recipeForm.update(form => ({ ...form, [field]: value }));
  }

  addPreparation() {
    this.preparationsForm.update(preps => [
      ...preps,
      {
        id: `temp-${uuidv4()}`,
        name: `Nova Etapa ${preps.length + 1}`,
        station_id: this.stations()[0]?.id || '',
        display_order: preps.length,
      },
    ]);
  }

  updatePreparation(prepId: string, field: 'name' | 'station_id' | 'prep_instructions', value: string) {
    if (field === 'station_id' && value === 'add_new') {
      this.isAddingStation.set(prepId);
      return;
    }
    this.preparationsForm.update(preps => preps.map(p => p.id === prepId ? { ...p, [field]: value } : p));
  }

  removePreparation(prepId: string) {
    this.preparationsForm.update(preps => preps.filter(p => p.id !== prepId));
    this.ingredientsForm.update(ings => ings.filter(i => i.preparation_id !== prepId));
  }

  addIngredient(ingredient: Ingredient, prepId: string) {
    this.ingredientsForm.update(ings => [
      ...ings,
      { ingredient_id: ingredient.id, preparation_id: prepId, quantity: 0, name: ingredient.name, unit: ingredient.unit }
    ]);
    this.ingredientSearchTerm.set('');
    this.activePreparationId.set(null);
  }

  updateIngredient(prepId: string, ingredientId: string, field: 'quantity', value: number) {
    if (isNaN(value)) return;
    this.ingredientsForm.update(ings => ings.map(i => i.ingredient_id === ingredientId && i.preparation_id === prepId ? { ...i, [field]: value } : i));
  }

  removeIngredient(prepId: string, ingredientId: string) {
    this.ingredientsForm.update(ings => ings.filter(i => !(i.ingredient_id === ingredientId && i.preparation_id === prepId)));
  }

  addSubRecipe(recipe: Recipe) {
    this.subRecipesForm.update(subs => [
      ...subs,
      { child_recipe_id: recipe.id, quantity: 1, name: recipe.name }
    ]);
    this.subRecipeSearchTerm.set('');
  }
  
  updateSubRecipe(childRecipeId: string, field: 'quantity', value: number) {
    if (isNaN(value)) return;
    this.subRecipesForm.update(subs => subs.map(s => s.child_recipe_id === childRecipeId ? { ...s, [field]: value } : s));
  }

  removeSubRecipe(childRecipeId: string) {
    this.subRecipesForm.update(subs => subs.filter(s => s.child_recipe_id !== childRecipeId));
  }

  // --- Quick Create Methods ---
  async saveNewRecipeCategory() {
    const name = this.newRecipeCategoryName().trim();
    if (!name) { this.isAddingRecipeCategory.set(false); return; }
    const { success, data } = await this.recipeDataService.addRecipeCategory(name);
    if (success && data) {
      this.updateRecipeFormValue('category_id', data.id);
    }
    this.isAddingRecipeCategory.set(false);
    this.newRecipeCategoryName.set('');
  }

  async saveNewStation() {
    const prepId = this.isAddingStation();
    const name = this.newStationName().trim();
    if (!prepId || !name) { this.isAddingStation.set(null); return; }
    const { success, error, data } = await this.settingsDataService.addStation(name);
    if (success && data) {
      this.updatePreparation(prepId, 'station_id', data.id);
    }
    this.isAddingStation.set(null);
    this.newStationName.set('');
  }

  handleNewIngredient(ingredient: Ingredient | null) {
    if (ingredient) {
        const prepId = this.activePreparationId();
        if (prepId) {
            this.addIngredient(ingredient, prepId);
        }
    }
    this.isIngredientModalOpen.set(false);
  }

  // --- AI and Save ---
  async getAiSuggestions() {
    this.isAiLoading.set(true);
    this.aiSuggestions.set('');
    try {
      // Build data for AI
      const suggestions = await this.aiService.getMiseEnPlaceSuggestions({
        name: this.recipeForm().name!,
        preparations: this.preparationsForm().map(p => ({
            name: p.name!,
            ingredients: this.ingredientsForm().filter(i => i.preparation_id === p.id).map(i => ({ name: i.name!, quantity: i.quantity, unit: i.unit! }))
        })),
        subRecipes: this.subRecipesForm().map(sr => ({ name: sr.name!, quantity: sr.quantity })),
        finalAssemblyIngredients: [] // Logic for this can be added if needed
      });
      this.aiSuggestions.set(suggestions);
    } catch (error) {
      await this.notificationService.alert(`Erro ao buscar sugestões: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    } finally {
      this.isAiLoading.set(false);
    }
  }

  onSave() {
    this.save.emit({
      recipe: this.recipeForm(),
      preparations: this.preparationsForm(),
      ingredients: this.ingredientsForm(),
      subRecipes: this.subRecipesForm(),
    });
  }
}