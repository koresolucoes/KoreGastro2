import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Recipe, RecipeIngredient, Ingredient, Category, Station, RecipePreparation, RecipeSubRecipe } from '../../models/db.models';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { RecipeDataService } from '../../services/recipe-data.service';
import { NotificationService } from '../../services/notification.service';
import { v4 as uuidv4 } from 'uuid';
import { AiRecipeService } from '../../services/ai-recipe.service';

type TechnicalSheetTab = 'details' | 'ingredients' | 'cost';

@Component({
  selector: 'app-technical-sheets',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './technical-sheets.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TechnicalSheetsComponent {
  stateService = inject(SupabaseStateService);
  recipeDataService = inject(RecipeDataService);
  notificationService = inject(NotificationService);
  aiService = inject(AiRecipeService);

  // Data from state
  allRecipes = this.stateService.recipes;
  recipesById = this.stateService.recipesById;
  allIngredients = this.stateService.ingredients;
  categories = this.stateService.categories;
  stations = this.stateService.stations;
  recipeCosts = this.stateService.recipeCosts;

  // Component state
  searchTerm = signal('');
  isModalOpen = signal(false);
  activeTab = signal<TechnicalSheetTab>('details');
  activeRecipe = signal<Recipe | null>(null);
  isEditing = signal(false); // New signal for view/edit mode

  // Form State Signals
  recipeForm = signal<Partial<Recipe>>({});
  preparations = signal<RecipePreparation[]>([]);
  ingredients = signal<RecipeIngredient[]>([]);
  subRecipes = signal<RecipeSubRecipe[]>([]);

  // Ingredient/Sub-recipe search
  ingredientSearchTerm = signal('');
  subRecipeSearchTerm = signal('');

  recipePendingDeletion = signal<Recipe | null>(null);

  // AI Assistant State
  isAiAssistantLoading = signal(false);
  aiSuggestions = signal<string | null>(null);

  formattedAiSuggestions = computed(() => {
    const suggestions = this.aiSuggestions();
    if (!suggestions) return '';
    // This safely handles the replacement logic that was causing a template error.
    return suggestions.replace(/\\n/g, '<br>').replace(/\n/g, '<br>');
  });

  filteredRecipes = computed(() => {
    const term = this.searchTerm().toLowerCase();
    if (!term) return this.allRecipes();
    return this.allRecipes().filter(r => r.name.toLowerCase().includes(term));
  });

  filteredIngredients = computed(() => {
    const term = this.ingredientSearchTerm().toLowerCase();
    if (!term) return [];
    const currentIngredientIds = new Set(this.ingredients().map(i => i.ingredient_id));
    return this.allIngredients()
      .filter(i => !currentIngredientIds.has(i.id) && i.name.toLowerCase().includes(term))
      .slice(0, 5);
  });

  filteredSubRecipes = computed(() => {
    const term = this.subRecipeSearchTerm().toLowerCase();
    const activeRecipeId = this.activeRecipe()?.id;
    if (!term || !activeRecipeId) return [];
    const currentSubRecipeIds = new Set(this.subRecipes().map(sr => sr.child_recipe_id));
    return this.allRecipes()
      .filter(r => 
        r.is_sub_recipe && 
        r.id !== activeRecipeId && 
        !currentSubRecipeIds.has(r.id) &&
        r.name.toLowerCase().includes(term)
      )
      .slice(0, 5);
  });

  currentRecipeCost = computed(() => {
    const recipeId = this.activeRecipe()?.id;
    const recipeForm = this.recipeForm();
    if (!recipeId && !this.isEditing()) return { totalCost: 0, operationalCost: 0, finalCost: 0, margin: 0 };
    
    // Use recipe ID for existing recipes, but allow calculation for new recipes in the editor
    const baseCost = recipeId ? (this.recipeCosts().get(recipeId)?.totalCost ?? 0) : this.calculateNewRecipeCost();
    const opCost = recipeForm.operational_cost ?? 0;
    const finalCost = baseCost + opCost;
    const price = recipeForm.price ?? 0;
    const margin = price > 0 ? ((price - finalCost) / price) * 100 : 0;

    return { totalCost: baseCost, operationalCost: opCost, finalCost, margin };
  });

  private calculateNewRecipeCost(): number {
    const ingredientsMap = new Map(this.allIngredients().map(i => [i.id, i]));
    const directCost = this.ingredients().reduce((sum, ing) => {
        const cost = ingredientsMap.get(ing.ingredient_id)?.cost ?? 0;
        return sum + (cost * ing.quantity);
    }, 0);

    const subRecipeCost = this.subRecipes().reduce((sum, sr) => {
        const cost = this.recipeCosts().get(sr.child_recipe_id)?.totalCost ?? 0;
        return sum + (cost * sr.quantity);
    }, 0);

    return directCost + subRecipeCost;
  }

  // Methods
  openAddModal() {
    this.activeRecipe.set(null);
    this.recipeForm.set({
      name: '',
      description: '',
      price: 0,
      category_id: this.categories()[0]?.id || '',
      prep_time_in_minutes: 15,
      operational_cost: 0,
      is_available: true,
      is_sub_recipe: false,
    });
    this.preparations.set([]);
    this.ingredients.set([]);
    this.subRecipes.set([]);
    this.activeTab.set('details');
    this.aiSuggestions.set(null);
    this.isAiAssistantLoading.set(false);
    this.isEditing.set(true);
    this.isModalOpen.set(true);
  }

  openViewModal(recipe: Recipe) {
    this.activeRecipe.set(recipe);
    this.recipeForm.set({ ...recipe });
    this.preparations.set(this.recipeDataService.getRecipePreparations(recipe.id));
    this.ingredients.set(this.recipeDataService.getRecipeIngredients(recipe.id));
    this.subRecipes.set(this.stateService.recipeSubRecipes().filter(rsr => rsr.parent_recipe_id === recipe.id));
    this.activeTab.set('details');
    this.aiSuggestions.set(null);
    this.isAiAssistantLoading.set(false);
    this.isEditing.set(false);
    this.isModalOpen.set(true);
  }
  
  switchToEditMode() {
    this.isEditing.set(true);
    this.aiSuggestions.set(null);
  }

  closeModal() {
    this.isModalOpen.set(false);
    this.isEditing.set(false);
    this.activeRecipe.set(null);
  }

  updateFormValue(field: keyof Omit<Recipe, 'id' | 'created_at' | 'user_id' | 'hasStock'>, value: any) {
    this.recipeForm.update(form => {
      const newForm = { ...form };
      if (field === 'is_available' || field === 'is_sub_recipe') {
        newForm[field] = value as boolean;
      } else if (['name', 'description', 'category_id', 'source_ingredient_id'].includes(field)) {
        newForm[field as 'name' | 'description' | 'category_id' | 'source_ingredient_id'] = value;
      } else if (['price', 'prep_time_in_minutes', 'operational_cost'].includes(field)) {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          newForm[field as 'price' | 'prep_time_in_minutes' | 'operational_cost'] = numValue;
        }
      }
      return newForm;
    });
  }

  addPreparation() {
    this.preparations.update(preps => [
      ...preps,
      {
        id: `temp-${uuidv4()}`,
        recipe_id: this.activeRecipe()?.id || '',
        station_id: this.stations()[0]?.id || '',
        name: `Preparo ${preps.length + 1}`,
        display_order: preps.length,
        created_at: new Date().toISOString(),
        user_id: ''
      },
    ]);
  }

  removePreparation(prepId: string) {
    this.preparations.update(preps => preps.filter(p => p.id !== prepId));
    this.ingredients.update(ings => ings.filter(i => i.preparation_id !== prepId));
  }

  updatePreparationField(prepId: string, field: keyof RecipePreparation, value: any) {
    this.preparations.update(preps =>
      preps.map(p => (p.id === prepId ? { ...p, [field]: value } : p))
    );
  }

  addIngredientToPrep(ingredient: Ingredient, prepId: string) {
    this.ingredients.update(ings => [
      ...ings,
      {
        recipe_id: this.activeRecipe()?.id || '',
        ingredient_id: ingredient.id,
        quantity: 0,
        preparation_id: prepId,
        user_id: '',
        ingredients: { name: ingredient.name, unit: ingredient.unit, cost: ingredient.cost }
      },
    ]);
    this.ingredientSearchTerm.set('');
  }
  
  addSubRecipe(subRecipe: Recipe) {
      if (!this.activeRecipe() && !this.isEditing()) return;
      this.subRecipes.update(subs => [
          ...subs,
          {
              parent_recipe_id: this.activeRecipe()?.id || '',
              child_recipe_id: subRecipe.id,
              quantity: 1,
              user_id: '',
              recipes: { id: subRecipe.id, name: subRecipe.name }
          }
      ]);
      this.subRecipeSearchTerm.set('');
  }

  removeIngredient(ingredientId: string, prepId: string) {
    this.ingredients.update(ings =>
      ings.filter(i => !(i.ingredient_id === ingredientId && i.preparation_id === prepId))
    );
  }
  
  removeSubRecipe(childRecipeId: string) {
    this.subRecipes.update(subs => subs.filter(s => s.child_recipe_id !== childRecipeId));
  }

  updateIngredientQuantity(ingredientId: string, prepId: string, quantity: number) {
    this.ingredients.update(ings =>
      ings.map(i =>
        i.ingredient_id === ingredientId && i.preparation_id === prepId
          ? { ...i, quantity: isNaN(quantity) ? 0 : quantity }
          : i
      )
    );
  }

  updateSubRecipeQuantity(childRecipeId: string, quantity: number) {
    this.subRecipes.update(subs => subs.map(s => s.child_recipe_id === childRecipeId ? {...s, quantity: isNaN(quantity) ? 0 : quantity} : s));
  }

  async saveTechnicalSheet() {
    const form = this.recipeForm();
    if (!form.name?.trim() || !form.category_id) {
      await this.notificationService.alert('Nome e Categoria são obrigatórios.');
      return;
    }
    
    let result;
    if (this.activeRecipe()) {
      const recipeId = this.activeRecipe()!.id;
      result = await this.recipeDataService.saveTechnicalSheet(recipeId, form, this.preparations(), this.ingredients(), this.subRecipes());
    } else {
      const { data: newRecipe, error } = await this.recipeDataService.addRecipe(form);
      if (error) {
        await this.notificationService.alert(`Erro ao criar a receita: ${error.message}`);
        return;
      }
      result = await this.recipeDataService.saveTechnicalSheet(newRecipe!.id, {}, this.preparations(), this.ingredients(), this.subRecipes());
    }

    if (result.success) {
      this.closeModal();
    } else {
      await this.notificationService.alert(`Falha ao salvar ficha técnica: ${result.error?.message}`);
    }
  }

  async toggleAvailability(recipe: Recipe, event: MouseEvent) {
    event.stopPropagation();
    const { success, error } = await this.recipeDataService.updateRecipeAvailability(recipe.id, !recipe.is_available);
    if (error) {
      await this.notificationService.alert(`Erro ao atualizar disponibilidade: ${error.message}`);
    }
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
  
  async getAiSuggestions() {
    this.isAiAssistantLoading.set(true);
    this.aiSuggestions.set(null);

    try {
      const recipeName = this.recipeForm().name || 'Prato sem nome';
      const ingredientsMap = new Map(this.allIngredients().map(i => [i.id, i]));
      const recipesMap = new Map(this.allRecipes().map(r => [r.id, r]));

      const dataForAI = {
        name: recipeName,
        preparations: this.preparations().map(prep => ({
          name: prep.name,
          ingredients: this.ingredients()
            .filter(i => i.preparation_id === prep.id)
            .map(ing => {
              const details = ingredientsMap.get(ing.ingredient_id);
              return {
                name: details?.name || 'Ingrediente desconhecido',
                quantity: ing.quantity,
                unit: details?.unit || 'un',
              };
            }),
        })),
        subRecipes: this.subRecipes().map(sr => {
            const details = recipesMap.get(sr.child_recipe_id);
            return {
                name: details?.name || 'Sub-receita desconhecida',
                quantity: sr.quantity
            };
        }),
        // Compatibility for the service, but the new UI doesn't use 'final-assembly' directly.
        finalAssemblyIngredients: this.ingredients()
            .filter(i => !this.preparations().some(p => p.id === i.preparation_id))
             .map(ing => {
                const details = ingredientsMap.get(ing.ingredient_id);
                return {
                    name: details?.name || 'Ingrediente desconhecido',
                    quantity: ing.quantity,
                    unit: details?.unit || 'un',
                };
            })
      };
      
      const suggestions = await this.aiService.getMiseEnPlaceSuggestions(dataForAI);
      this.aiSuggestions.set(suggestions);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      await this.notificationService.alert(`Ocorreu um erro ao buscar sugestões: ${message}`);
      this.aiSuggestions.set('Não foi possível carregar as sugestões. Verifique sua conexão ou a chave da API Gemini.');
    } finally {
      this.isAiAssistantLoading.set(false);
    }
  }
  
  // Template Helper Methods
  getCategoryName(categoryId: string): string {
    return this.categories().find(c => c.id === categoryId)?.name || 'N/A';
  }

  getIngredientsForPrep(prepId: string): RecipeIngredient[] {
    return this.ingredients().filter(i => i.preparation_id === prepId);
  }

  getStationName(stationId: string): string {
    return this.stations().find(s => s.id === stationId)?.name || 'N/A';
  }
}
