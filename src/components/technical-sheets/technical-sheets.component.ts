
import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, ViewChild, ElementRef } from '@angular/core';
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
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { RecipeStateService } from '../../services/recipe-state.service';
import { InventoryStateService } from '../../services/inventory-state.service';
import { PosStateService } from '../../services/pos-state.service';

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
    external_code: null,
    ncm_code: null,
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
export class TechnicalSheetsComponent {
  private stateService = inject(SupabaseStateService);
  private recipeDataService = inject(RecipeDataService);
  private settingsDataService = inject(SettingsDataService);
  private inventoryDataService = inject(InventoryDataService);
  private aiService = inject(AiRecipeService);
  private notificationService = inject(NotificationService);
  private route: ActivatedRoute = inject(ActivatedRoute);
  private router: Router = inject(Router);
  
  private recipeState: RecipeStateService = inject(RecipeStateService);
  private inventoryState: InventoryStateService = inject(InventoryStateService);
  private posState: PosStateService = inject(PosStateService);

  @ViewChild('searchInput') searchInput!: ElementRef;

  // Data
  allRecipes = this.recipeState.recipes;
  categories = this.recipeState.categories;
  ingredients = this.inventoryState.ingredients;
  stations = this.posState.stations;
  recipeCosts = this.recipeState.recipeCosts;
  
  // These are used for lookup when populating the form initially
  private recipeIngredients = this.recipeState.recipeIngredients;
  private recipePreparations = this.recipeState.recipePreparations;
  private recipeSubRecipes = this.recipeState.recipeSubRecipes;

  // UI State
  viewMode = signal<'list' | 'edit'>('list');
  isModalOpen = computed(() => this.viewMode() === 'edit');
  searchTerm = signal('');
  selectedRecipeId = signal<string | null>(null);
  
  // Form State
  recipeForm = signal<RecipeForm>(EMPTY_RECIPE_FORM);
  recipePendingDeletion = signal<Recipe | null>(null);
  recipeImagePreviewUrl = signal<string | null>(null);
  
  // AI State
  isAiLoading = signal(false);
  aiSuggestions = signal<string | null>(null);

  // Popover State (Adding Items)
  addingToPreparationId = signal<string | null>(null); // If 'sub-recipe', means adding to top-level subrecipes list
  itemSearchTerm = signal('');

  // "Add on the fly" Modals
  isAddingCategory = signal(false);
  newCategoryName = signal('');
  isAddingStation = signal(false);
  newStationName = signal('');
  editingPrepForStationId = signal<string | null>(null);
  isAddingIngredient = signal(false);
  newIngredientForm = signal<Partial<Ingredient>>(EMPTY_INGREDIENT);
  
  availableUnits: IngredientUnit[] = ['g', 'kg', 'ml', 'l', 'un'];

  private recipeIdFromParams = toSignal(
    this.route.queryParamMap.pipe(map(params => params.get('recipeId')))
  );

  constructor() {
    effect(() => {
      const recipeId = this.recipeIdFromParams();
      const isDataLoaded = this.stateService.isDataLoaded();

      if (recipeId && isDataLoaded) {
        const recipeToOpen = this.allRecipes().find(r => r.id === recipeId);
        if (recipeToOpen && this.selectedRecipeId() !== recipeId) {
            this.openEditModal(recipeToOpen);
        }
      }
    }, { allowSignalWrites: true });

    // Focus on search input when popover opens
    effect(() => {
        if (this.addingToPreparationId()) {
            setTimeout(() => this.searchInput?.nativeElement?.focus(), 50);
        }
    });
  }

  filteredRecipes = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const costs = this.recipeCosts();
    
    // Map recipes with their real-time calculated cost
    const recipes = this.allRecipes().map(r => ({
      ...r,
      cost: costs.get(r.id) ?? { totalCost: 0, ingredientCount: 0, rawIngredients: new Map() }
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

  // Calculates the cost of the recipe currently being edited in the form
  formTotalCost = computed(() => {
    const form = this.recipeForm();
    let total = 0;
    const ingredientsMap = new Map<string, Ingredient>(this.ingredients().map(i => [i.id, i]));
    const costsMap = this.recipeCosts(); // Calculated costs for other recipes (sub-recipes)

    for (const item of form.ingredients) {
      const ingredient = ingredientsMap.get(item.ingredient_id);
      if (ingredient) {
        let convertedQuantity = item.quantity;
        // Simple unit conversion for cost estimation
        if (item.unit !== ingredient.unit) {
          if (item.unit === 'g' && ingredient.unit === 'kg') convertedQuantity /= 1000;
          else if (item.unit === 'kg' && ingredient.unit === 'g') convertedQuantity *= 1000;
          else if (item.unit === 'ml' && ingredient.unit === 'l') convertedQuantity /= 1000;
          else if (item.unit === 'l' && ingredient.unit === 'ml') convertedQuantity *= 1000;
        }
        total += ingredient.cost * (convertedQuantity || 0);
      }
    }

    for (const item of form.subRecipes) {
      const subRecipeCost = costsMap.get(item.child_recipe_id)?.totalCost ?? 0;
      total += subRecipeCost * (item.quantity || 0);
    }

    return total;
  });

  // Filter items for the "Add Item" popover
  filteredItemsForAdding = computed(() => {
    const term = this.itemSearchTerm().toLowerCase();
    const prepId = this.addingToPreparationId();

    if (!prepId) return { ingredients: [], subRecipes: [] };

    // If adding to global sub-recipes list
    if (prepId === 'sub-recipe') {
        const currentIds = new Set(this.recipeForm().subRecipes.map(sr => sr.child_recipe_id));
        const subRecipes = this.allRecipes().filter(r => 
            r.id !== this.recipeForm().recipe.id && // Prevent self-reference
            r.is_sub_recipe && 
            !currentIds.has(r.id) && 
            r.name.toLowerCase().includes(term)
        ).slice(0, 50); // Limit results
        return { ingredients: [], subRecipes };
    } 
    // If adding ingredient to a preparation step
    else {
        const currentIds = new Set(this.recipeForm().ingredients.map(i => i.ingredient_id));
        const ingredients = this.ingredients().filter(i => 
            !currentIds.has(i.id) && i.name.toLowerCase().includes(term)
        ).slice(0, 50);
        return { ingredients, subRecipes: [] };
    }
  });

  // --- Actions ---

  openEditModal(recipe: Recipe) {
    this.selectedRecipeId.set(recipe.id);
    
    // Fetch data for form population
    const preparations = this.recipePreparations().filter(p => p.recipe_id === recipe.id).sort((a,b) => a.display_order - b.display_order);
    const ingredients = this.recipeIngredients().filter(i => i.recipe_id === recipe.id);
    const subRecipes = this.recipeSubRecipes().filter(sr => sr.parent_recipe_id === recipe.id);
    const ingredientsMap = new Map<string, Ingredient>(this.ingredients().map(i => [i.id, i]));

    // Map ingredients to form structure (handle unit conversions display if necessary)
    const mappedIngredients = ingredients.map(i => {
          const { recipe_id, user_id, ingredients, ...rest } = i;
          const baseIngredient = ingredientsMap.get(i.ingredient_id);
          const baseUnit = baseIngredient?.unit || 'un';
          
          // Logic to keep unit same as DB or convert for display can be refined here.
          // For now, we trust the unit stored in recipe_ingredients is what user chose.
          // If recipe_ingredients doesn't store unit (schema doesn't have it), we assume baseUnit.
          // The schema provided for RecipeIngredient doesn't list 'unit', so we assume it uses base ingredient unit logic implicitly or we should add it to app model.
          // *Correction:* The `RecipeForm` interface uses `Omit<RecipeIngredient...> & { unit: IngredientUnit }`.
          // We need to decide how to display. Let's default to baseUnit if we don't store override.
          
          let displayUnit: IngredientUnit = baseUnit;
          let displayQuantity = rest.quantity;

          // Heuristic: Display small KG amounts as G
          if (baseUnit === 'kg' && displayQuantity > 0 && displayQuantity < 1) {
              displayUnit = 'g';
              displayQuantity *= 1000;
          } else if (baseUnit === 'l' && displayQuantity > 0 && displayQuantity < 1) {
              displayUnit = 'ml';
              displayQuantity *= 1000;
          }

          return { ...rest, quantity: displayQuantity, unit: displayUnit };
    });

    this.recipeForm.set({
      recipe: { ...recipe },
      preparations: preparations.map(p => ({...p})),
      ingredients: mappedIngredients,
      subRecipes: subRecipes.map(({ parent_recipe_id, user_id, recipes, ...rest }) => rest),
      image_file: null
    });

    this.recipeImagePreviewUrl.set(recipe.image_url);
    this.aiSuggestions.set(null);
    this.viewMode.set('edit');
  }

  openAddModal() {
    this.selectedRecipeId.set(null);
    // Auto-select first category if available
    const firstCategoryId = this.categories()[0]?.id;
    
    // Create at least one default preparation step
    const defaultPrepId = uuidv4();
    
    this.recipeForm.set({
      ...EMPTY_RECIPE_FORM,
      recipe: { ...EMPTY_RECIPE_FORM.recipe, category_id: firstCategoryId },
      preparations: [{ id: defaultPrepId, name: 'Preparo', display_order: 0, station_id: this.stations()[0]?.id ?? null }]
    });
    
    this.recipeImagePreviewUrl.set(null);
    this.aiSuggestions.set(null);
    this.viewMode.set('edit');
  }

  closeModal() {
    this.viewMode.set('list');
    this.selectedRecipeId.set(null);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { recipeId: null },
      queryParamsHandling: 'merge',
    });
  }

  // --- Form Handling ---

  updateRecipeField(field: keyof Omit<Recipe, 'id' | 'created_at' | 'hasStock'>, value: any) {
    this.recipeForm.update(form => ({
        ...form,
        recipe: { ...form.recipe, [field]: value }
    }));
  }

  handleRecipeImageChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.recipeForm.update(form => ({ ...form, image_file: file }));
      const reader = new FileReader();
      reader.onload = (e) => this.recipeImagePreviewUrl.set(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  }

  // Preparations
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
        // Also remove ingredients linked to this prep
        ingredients: form.ingredients.filter(i => i.preparation_id !== prepId)
    }));
  }

  updatePreparationField(prepId: string, field: keyof Omit<RecipePreparation, 'id' | 'created_at' | 'user_id' | 'recipe_id'>, value: any) {
    this.recipeForm.update(form => ({
      ...form,
      preparations: form.preparations.map(p => p.id === prepId ? { ...p, [field]: value } : p)
    }));
  }

  // Ingredients Management
  getIngredientsForPreparation(prepId: string) {
    return this.recipeForm().ingredients.filter(i => i.preparation_id === prepId);
  }

  updateFormIngredient(prepId: string, ingredientId: string, quantity: number) {
    if (isNaN(quantity) || quantity < 0) return;
    this.recipeForm.update(form => ({ 
        ...form, 
        ingredients: form.ingredients.map(i => 
            i.preparation_id === prepId && i.ingredient_id === ingredientId 
            ? { ...i, quantity } 
            : i 
        ) 
    }));
  }

  removeFormIngredient(prepId: string, ingredientId: string) {
    this.recipeForm.update(form => ({ 
        ...form, 
        ingredients: form.ingredients.filter(i => !(i.preparation_id === prepId && i.ingredient_id === ingredientId)) 
    }));
  }

  // Sub-Recipe Management
  updateFormSubRecipe(childRecipeId: string, quantity: number) {
    if (isNaN(quantity) || quantity < 0) return;
    this.recipeForm.update(form => ({ 
        ...form, 
        subRecipes: form.subRecipes.map(sr => sr.child_recipe_id === childRecipeId ? { ...sr, quantity } : sr) 
    }));
  }

  removeFormSubRecipe(childRecipeId: string) {
    this.recipeForm.update(form => ({ 
        ...form, 
        subRecipes: form.subRecipes.filter(sr => sr.child_recipe_id !== childRecipeId) 
    }));
  }

  // Popover Logic
  startAddingItem(prepId: string | null) {
      this.addingToPreparationId.set(prepId);
      this.itemSearchTerm.set('');
  }
  
  stopAddingItem() {
      this.addingToPreparationId.set(null);
  }

  addIngredientToPrep(ingredient: Ingredient) {
      const prepId = this.addingToPreparationId();
      if (prepId && prepId !== 'sub-recipe') {
          // Check if already exists in this prep
          const exists = this.recipeForm().ingredients.some(i => i.preparation_id === prepId && i.ingredient_id === ingredient.id);
          if (!exists) {
              this.recipeForm.update(form => ({
                  ...form,
                  ingredients: [...form.ingredients, { 
                      ingredient_id: ingredient.id, 
                      quantity: 0, 
                      preparation_id: prepId, 
                      unit: ingredient.unit // Start with base unit
                  }]
              }));
          }
      }
      this.stopAddingItem();
  }

  addSubRecipeToPrep(recipe: Recipe) {
      const exists = this.recipeForm().subRecipes.some(sr => sr.child_recipe_id === recipe.id);
      if (!exists) {
          this.recipeForm.update(form => ({
              ...form,
              subRecipes: [...form.subRecipes, { child_recipe_id: recipe.id, quantity: 1 }]
          }));
      }
      this.stopAddingItem();
  }

  getAddingToPreparationName(prepId: string | null): string {
      if (!prepId) return '';
      if (prepId === 'sub-recipe') return 'Sub-receitas';
      return this.recipeForm().preparations.find(p => p.id === prepId)?.name || 'Etapa';
  }

  // --- Display Helpers ---
  getIngredientName(id: string): string {
      return this.ingredients().find(i => i.id === id)?.name ?? 'Ingrediente removido';
  }
  
  getIngredientUnit(id: string): string {
      const ing = this.ingredients().find(i => i.id === id);
      // We look up in form state first if unit was overridden, otherwise base unit
      // Since current implementation doesn't support changing unit in UI yet, using base unit is fine for display context
      return ing?.unit ?? 'un';
  }
  
  getSubRecipeName(id: string): string {
      return this.allRecipes().find(r => r.id === id)?.name ?? 'Receita removida';
  }

  // --- "Add on the fly" Modals ---
  // (Logic remains same as previous implementation)
  openAddCategoryModal() { this.isAddingCategory.set(true); this.newCategoryName.set(''); }
  closeAddCategoryModal() { this.isAddingCategory.set(false); }
  async saveNewCategory() {
      const name = this.newCategoryName().trim();
      if (!name) return;
      const { success, error, data } = await this.recipeDataService.addRecipeCategory(name);
      if (success && data) {
          this.updateRecipeField('category_id', data.id);
          this.closeAddCategoryModal();
      } else {
          await this.notificationService.alert(`Erro: ${error?.message}`);
      }
  }
  
  // ... (Station and Ingredient on-the-fly similar to previous code, omitted for brevity but should be included) ...
  
  // --- Saving & Deleting ---

  async saveTechnicalSheet() {
    const form = this.recipeForm();
    if (!form.recipe.name) { await this.notificationService.alert('O nome da receita é obrigatório.'); return; }
    if (!form.recipe.category_id) { await this.notificationService.alert('A categoria é obrigatória.'); return; }

    const { cost, hasStock, ...recipeData } = form.recipe as any;
    const recipeDataToSave = { ...recipeData, operational_cost: this.formTotalCost() };
    
    // Prepare ingredients with unit conversion back to base unit if needed
    const ingredientsMap = new Map<string, Ingredient>(this.ingredients().map(i => [i.id, i]));
    
    const ingredientsToSave = form.ingredients.map((formIng) => {
        const base = ingredientsMap.get(formIng.ingredient_id);
        if (!base) return null;
        
        let qty = formIng.quantity;
        // Simple conversion logic (reversed)
        if (formIng.unit === 'g' && base.unit === 'kg') qty /= 1000;
        else if (formIng.unit === 'ml' && base.unit === 'l') qty /= 1000;
        
        return {
            preparation_id: formIng.preparation_id,
            ingredient_id: formIng.ingredient_id,
            quantity: qty
        };
    }).filter((i): i is any => i !== null);

    if (this.selectedRecipeId()) {
        const { success, error } = await this.recipeDataService.saveTechnicalSheet(
            this.selectedRecipeId()!, recipeDataToSave, form.preparations as any, ingredientsToSave, form.subRecipes as any
        );
        if (success) {
            if (form.image_file) await this.recipeDataService.updateRecipeImage(this.selectedRecipeId()!, form.image_file);
            this.notificationService.show('Receita salva com sucesso!', 'success');
            this.closeModal();
        } else {
            this.notificationService.show(`Erro: ${error?.message}`, 'error');
        }
    } else {
        const { success, error, data } = await this.recipeDataService.addRecipe(recipeDataToSave);
        if (success && data) {
             const { success: tsSuccess, error: tsError } = await this.recipeDataService.saveTechnicalSheet(
                data.id, {}, form.preparations as any, ingredientsToSave, form.subRecipes as any
            );
            if (tsSuccess) {
                if (form.image_file) await this.recipeDataService.updateRecipeImage(data.id, form.image_file);
                this.notificationService.show('Receita criada com sucesso!', 'success');
                this.closeModal();
            } else {
                 await this.recipeDataService.deleteRecipe(data.id); // Rollback
                 this.notificationService.show(`Erro ao salvar ficha: ${tsError?.message}`, 'error');
            }
        } else {
            this.notificationService.show(`Erro ao criar receita: ${error?.message}`, 'error');
        }
    }
  }

  async toggleAvailability(recipe: Recipe) {
      const { success, error } = await this.recipeDataService.updateRecipeAvailability(recipe.id, !recipe.is_available);
      if (!success) this.notificationService.show(`Erro: ${error?.message}`, 'error');
  }

  requestDelete(recipe: Recipe) { this.recipePendingDeletion.set(recipe); }
  cancelDelete() { this.recipePendingDeletion.set(null); }
  async confirmDelete() {
      const recipe = this.recipePendingDeletion();
      if (!recipe) return;
      const { success, error } = await this.recipeDataService.deleteRecipe(recipe.id);
      if (success) {
          this.notificationService.show('Receita excluída.', 'success');
          this.recipePendingDeletion.set(null);
          if (this.selectedRecipeId() === recipe.id) this.closeModal();
      } else {
          this.notificationService.show(`Erro: ${error?.message}`, 'error');
      }
  }

  // --- Inventory Linking ---
  async linkOrCreateStockItem() {
      const recipe = this.recipeForm().recipe;
      if (!recipe.name) {
          this.notificationService.show('Dê um nome à receita primeiro.', 'warning');
          return;
      }
      
      const { success, error, data } = await this.inventoryDataService.addIngredient({
          name: recipe.name,
          unit: 'un',
          cost: this.formTotalCost(),
          stock: 0,
          min_stock: 0,
          is_yield_product: true // Mark as produced item
      });
      
      if (success && data) {
          this.updateRecipeField('source_ingredient_id', data.id);
          this.notificationService.show(`Item de estoque "${data.name}" criado e vinculado!`, 'success');
      } else {
          this.notificationService.show(`Erro: ${error?.message}`, 'error');
      }
  }
  
  unlinkStockItem() {
      this.updateRecipeField('source_ingredient_id', null);
  }

  // --- AI ---
  async getMiseEnPlaceSuggestions() {
      const form = this.recipeForm();
      if (!form.recipe.name) {
          this.notificationService.show('Nome da receita obrigatório.', 'warning');
          return;
      }
      this.isAiLoading.set(true);
      try {
          // Format data for AI prompt
          const prepData = {
              name: form.recipe.name,
              preparations: form.preparations.map(p => ({
                  name: p.name || 'Etapa sem nome',
                  ingredients: form.ingredients.filter(i => i.preparation_id === p.id).map(i => ({
                      name: this.getIngredientName(i.ingredient_id),
                      quantity: i.quantity,
                      unit: i.unit
                  }))
              })),
              subRecipes: form.subRecipes.map(sr => ({
                  name: this.getSubRecipeName(sr.child_recipe_id),
                  quantity: sr.quantity
              })),
              finalAssemblyIngredients: []
          };
          
          const result = await this.aiService.getMiseEnPlaceSuggestions(prepData);
          this.aiSuggestions.set(result.replace(/\n/g, '<br>'));
      } catch (e: any) {
          this.notificationService.show(`Erro na IA: ${e.message}`, 'error');
      } finally {
          this.isAiLoading.set(false);
      }
  }
  
  // -- Helper placeholders for missing methods --
  openAddStationModal(prepId: string) { 
      this.editingPrepForStationId.set(prepId); 
      this.newStationName.set(''); 
      this.isAddingStation.set(true); 
  }
  closeAddStationModal() { this.isAddingStation.set(false); this.editingPrepForStationId.set(null); }
  async saveNewStation() {
     const name = this.newStationName().trim();
     if(!name) return;
     const { success, data } = await this.settingsDataService.addStation(name);
     if(success && data) {
         this.updatePreparationField(this.editingPrepForStationId()!, 'station_id', data.id);
         this.closeAddStationModal();
     }
  }
  
  openAddIngredientModal() { 
      this.stopAddingItem();
      this.newIngredientForm.set({ ...EMPTY_INGREDIENT });
      this.isAddingIngredient.set(true); 
  }
  closeAddIngredientModal() { this.isAddingIngredient.set(false); }
  
  updateNewIngredientField(field: string, value: any) {
      this.newIngredientForm.update(f => ({ ...f, [field]: value }));
  }
  async saveNewIngredient() {
      const form = this.newIngredientForm();
      if(!form.name) return;
      const { success, data } = await this.inventoryDataService.addIngredient(form);
      if(success && data) {
          // If we were adding to a prep, add it immediately
          const prepId = this.addingToPreparationId();
          if(prepId && prepId !== 'sub-recipe') {
             this.addIngredientToPrep(data as Ingredient);
          }
          this.closeAddIngredientModal();
      }
  }
}
