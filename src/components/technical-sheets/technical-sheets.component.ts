

import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';
import { Recipe, RecipeIngredient, Ingredient, Category, IngredientUnit, Station, RecipePreparation } from '../../models/db.models';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../../services/auth.service';

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
  private dataService = inject(SupabaseService);
  private authService = inject(AuthService);

  // Data Signals from Service
  recipesWithStockStatus = this.dataService.recipesWithStockStatus;
  ingredients = this.dataService.ingredients;
  recipeIngredients = this.dataService.recipeIngredients;
  recipeCategories = this.dataService.categories;
  stations = this.dataService.stations;
  recipePreparations = this.dataService.recipePreparations;

  // Filter and Search
  searchTerm = signal('');
  selectedCategoryId = signal<string | 'all'>('all');

  // --- Computed properties for display ---
  recipeCategoryMap = computed(() => {
    return new Map(this.recipeCategories().map(cat => [cat.id, cat.name]));
  });

  recipeTechSheetStatus = computed(() => {
    const statusMap = new Map<string, { count: number, cost: number }>();
    const allRecipeIngredients = this.recipeIngredients();
    const allRecipes = this.recipesWithStockStatus();
    
    for (const recipe of allRecipes) {
        statusMap.set(recipe.id, { count: 0, cost: recipe.operational_cost || 0 });
    }
    
    for (const ri of allRecipeIngredients) {
      const ingredient = this.ingredients().find(i => i.id === ri.ingredient_id);
      const cost = ingredient ? ingredient.cost * ri.quantity : 0;
      
      const current = statusMap.get(ri.recipe_id);
      if (current) {
        statusMap.set(ri.recipe_id, {
          count: current.count + 1,
          cost: current.cost + cost
        });
      }
    }
    return statusMap;
  });

  filteredRecipes = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const categoryId = this.selectedCategoryId();
    
    return this.recipesWithStockStatus().filter(recipe => {
      const nameMatch = recipe.name.toLowerCase().includes(term);
      const categoryMatch = categoryId === 'all' || recipe.category_id === categoryId;
      return nameMatch && categoryMatch;
    });
  });

  // --- Technical Sheet Modal Management ---
  isTechSheetModalOpen = signal(false);
  selectedRecipeForTechSheet = signal<Recipe | null>(null);
  currentPreparations = signal<(RecipePreparation & { recipe_ingredients: RecipeIngredient[] })[]>([]);
  techSheetSearchTerm = signal('');
  operationalCost = signal<number>(0);
  techSheetSellingPrice = signal<number>(0);
  prepTimeInMinutes = signal<number>(0);

  filteredIngredientsForTechSheet = computed(() => {
    const term = this.techSheetSearchTerm().toLowerCase();
    const currentIngredientIds = new Set(this.currentPreparations().flatMap(p => p.recipe_ingredients).map(ri => ri.ingredient_id));
    if (!term) return [];
    return this.ingredients()
      .filter(i => !currentIngredientIds.has(i.id) && i.name.toLowerCase().includes(term))
      .slice(0, 5);
  });

  showCreateIngredientOption = computed(() => {
      const term = this.techSheetSearchTerm().trim();
      return term.length > 1 && this.filteredIngredientsForTechSheet().length === 0;
  });

  techSheetTotalCost = computed(() => {
    const ingredientsCost = this.currentPreparations().flatMap(p => p.recipe_ingredients).reduce((sum, ri) => {
        const ingredient = this.ingredients().find(i => i.id === ri.ingredient_id);
        return sum + (ingredient ? ingredient.cost * ri.quantity : 0);
    }, 0);
    return ingredientsCost + (this.operationalCost() || 0);
  });

  techSheetCMV = computed(() => {
      const cost = this.techSheetTotalCost();
      const price = this.techSheetSellingPrice();
      if (!price || price === 0) return 0;
      return (cost / price) * 100;
  });

  techSheetProfitMargin = computed(() => {
      const cost = this.techSheetTotalCost();
      const price = this.techSheetSellingPrice();
      if (!price || price === 0) return 0;
      return ((price - cost) / price) * 100;
  });

  getIngredientDetails(ingredientId: string): Ingredient | undefined {
    return this.ingredients().find(i => i.id === ingredientId);
  }

  openTechSheetModal(recipe: Recipe) {
    this.selectedRecipeForTechSheet.set(recipe);
    this.operationalCost.set(recipe.operational_cost || 0);
    this.techSheetSellingPrice.set(recipe.price || 0);
    this.prepTimeInMinutes.set(recipe.prep_time_in_minutes || 15);
    
    // FIX: Get user ID to add to new preparation object.
    const userId = this.authService.currentUser()?.id;
    if (!userId) return;

    let preps = this.dataService.getRecipePreparations(recipe.id);
    const ingredientsForRecipe = this.dataService.getRecipeIngredients(recipe.id);

    if (preps.length === 0) {
        preps.push({
            id: `temp-${uuidv4()}`,
            recipe_id: recipe.id,
            name: 'Preparação Principal',
            station_id: this.stations()[0]?.id || '',
            display_order: 0,
            created_at: new Date().toISOString(),
            user_id: userId,
        });
    }

    const prepsWithIngredients = preps.map(p => ({
        ...p,
        recipe_ingredients: ingredientsForRecipe.filter(ri => ri.preparation_id === p.id)
    }));
    
    this.currentPreparations.set(JSON.parse(JSON.stringify(prepsWithIngredients)));
    this.isTechSheetModalOpen.set(true);
  }

  closeTechSheetModal() { this.isTechSheetModalOpen.set(false); }
  
  addPreparation() {
    // FIX: Add user_id to new preparation object.
    const userId = this.authService.currentUser()?.id;
    if (!userId) return;

    this.currentPreparations.update(preps => [
        ...preps,
        {
            id: `temp-${uuidv4()}`,
            recipe_id: this.selectedRecipeForTechSheet()!.id,
            name: `Nova Preparação ${preps.length + 1}`,
            station_id: this.stations()[0]?.id || '',
            prep_instructions: '',
            display_order: preps.length,
            created_at: new Date().toISOString(),
            user_id: userId,
            recipe_ingredients: []
        }
    ]);
  }

  removePreparation(prepId: string) {
    this.currentPreparations.update(preps => preps.filter(p => p.id !== prepId));
  }

  updatePreparationField(prepId: string, field: keyof RecipePreparation, value: string) {
    this.currentPreparations.update(preps => preps.map(p => p.id === prepId ? { ...p, [field]: value } : p));
  }
  
  handleSearchBlur() {
    // Use a small timeout to allow click events on search results to register before closing the dropdown
    setTimeout(() => {
      this.techSheetSearchTerm.set('');
    }, 150);
  }

  addIngredientToTechSheet(prepId: string, ingredient: Ingredient) {
    // FIX: Add user_id to new recipe ingredient object.
    const userId = this.authService.currentUser()?.id;
    if (!userId) return;

    this.currentPreparations.update(preps => preps.map(p => {
        if (p.id === prepId) {
            const newIngredients = [...p.recipe_ingredients, {
                recipe_id: p.recipe_id,
                preparation_id: p.id,
                ingredient_id: ingredient.id,
                quantity: 1, // Default quantity to 1 instead of 0
                user_id: userId,
                ingredients: { name: ingredient.name, unit: ingredient.unit, cost: ingredient.cost }
            }];
            return { ...p, recipe_ingredients: newIngredients };
        }
        return p;
    }));
    this.techSheetSearchTerm.set('');
  }

  removeIngredientFromTechSheet(prepId: string, ingredientId: string) {
    this.currentPreparations.update(preps => preps.map(p => {
        if (p.id === prepId) {
            return { ...p, recipe_ingredients: p.recipe_ingredients.filter(ri => ri.ingredient_id !== ingredientId) };
        }
        return p;
    }));
  }

  updateTechSheetIngredientQuantity(prepId: string, ingredientId: string, event: Event) {
    const quantity = parseFloat((event.target as HTMLInputElement).value);
    if (!isNaN(quantity) && quantity >= 0) {
      this.currentPreparations.update(preps => preps.map(p => {
        if (p.id === prepId) {
            const newIngredients = p.recipe_ingredients.map(ri => ri.ingredient_id === ingredientId ? { ...ri, quantity } : ri);
            return { ...p, recipe_ingredients: newIngredients };
        }
        return p;
      }));
    }
  }

  async saveTechSheet() {
    const recipe = this.selectedRecipeForTechSheet(); if (!recipe) return;
    
    const recipeUpdates = {
        operational_cost: this.operationalCost(),
        price: this.techSheetSellingPrice(),
        prep_time_in_minutes: this.prepTimeInMinutes(),
    };
    
    const preparationsToSave = this.currentPreparations().map(p => ({
        ...p,
        recipe_ingredients: p.recipe_ingredients.filter(ri => ri.quantity > 0)
    }));

    const result = await this.dataService.saveTechnicalSheet(recipe.id, recipeUpdates, preparationsToSave);

    if (result.success) {
      this.closeTechSheetModal();
    } else {
        alert(`Falha ao salvar a ficha técnica. Erro: ${result.error?.message}`);
    }
  }

  // --- Quick Add Ingredient Modal ---
  isNewIngredientModalOpen = signal(false);
  newIngredientName = signal('');
  newIngredientUnit = signal<IngredientUnit>('g');
  newIngredientCost = signal<number>(0);
  availableUnits: IngredientUnit[] = ['g', 'kg', 'ml', 'l', 'un'];
  activePrepForIngredientAdd = signal<string | null>(null);

  openNewIngredientModal(prepId: string) {
      this.newIngredientName.set(this.techSheetSearchTerm());
      this.newIngredientUnit.set('g');
      this.newIngredientCost.set(0);
      this.activePrepForIngredientAdd.set(prepId);
      this.isNewIngredientModalOpen.set(true);
      this.techSheetSearchTerm.set('');
  }

  closeNewIngredientModal() {
      this.isNewIngredientModalOpen.set(false);
  }

  async createAndAddIngredient() {
      const prepId = this.activePrepForIngredientAdd();
      if (!prepId) return;

      const newIngredientData = {
          name: this.newIngredientName().trim(),
          unit: this.newIngredientUnit(),
          cost: this.newIngredientCost() || 0,
          stock: 0,
          min_stock: 0,
          category_id: null,
          supplier_id: null,
      };

      if (!newIngredientData.name) {
          alert('O nome do ingrediente é obrigatório.');
          return;
      }

      const { success, error, data: createdIngredient } = await this.dataService.addIngredient(newIngredientData);

      if (success && createdIngredient) {
          this.addIngredientToTechSheet(prepId, createdIngredient);
          this.closeNewIngredientModal();
      } else {
          alert(`Falha ao criar ingrediente: ${error?.message}`);
      }
  }

  // --- Add New Recipe Modal ---
  isAddRecipeModalOpen = signal(false);
  newRecipeForm = signal<NewRecipeForm>({
    name: '',
    category_id: '',
    description: '',
    prep_time_in_minutes: 15
  });

  openAddRecipeModal() {
    this.newRecipeForm.set({
      name: '',
      category_id: this.recipeCategories()[0]?.id || '',
      description: '',
      prep_time_in_minutes: 15
    });
    this.isAddRecipeModalOpen.set(true);
  }

  closeAddRecipeModal() {
    this.isAddRecipeModalOpen.set(false);
  }

  updateNewRecipeFormField(field: keyof NewRecipeForm, event: Event) {
    const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    let value: string | number = target.value;
    if (field === 'prep_time_in_minutes') {
        value = parseInt(value, 10);
    }
    this.newRecipeForm.update(form => ({
      ...form,
      [field]: value
    }));
  }

  async saveNewRecipe() {
    const form = this.newRecipeForm();
    if (!form.name || !form.category_id) {
      alert('Por favor, preencha todos os campos obrigatórios (Nome, Categoria).');
      return;
    }
    const recipeData = {
      name: form.name,
      category_id: form.category_id,
      description: form.description,
      prep_time_in_minutes: form.prep_time_in_minutes,
    };

    const { success, error, data: newRecipe } = await this.dataService.addRecipe(recipeData);
    if (success && newRecipe) {
      this.closeAddRecipeModal();
      this.openTechSheetModal(newRecipe);
    } else {
      alert(`Falha ao adicionar o prato. Erro: ${error?.message}`);
    }
  }

  // --- Availability Management ---
  async toggleAvailability(recipe: Recipe) {
    if (!recipe.hasStock) return;
    
    const newAvailability = !recipe.is_available;
    const { success, error } = await this.dataService.updateRecipeAvailability(recipe.id, newAvailability);
    if (!success) {
      alert(`Falha ao atualizar a disponibilidade. Erro: ${error?.message}`);
    }
  }
}