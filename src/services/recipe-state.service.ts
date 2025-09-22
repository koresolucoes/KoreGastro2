import { Injectable, signal, computed, inject } from '@angular/core';
import { Recipe, Category, RecipeIngredient, RecipePreparation, RecipeSubRecipe, Promotion, PromotionRecipe } from '../models/db.models';
import { InventoryStateService } from './inventory-state.service';

@Injectable({ providedIn: 'root' })
export class RecipeStateService {
  private inventoryState = inject(InventoryStateService);
  
  // Signals
  recipes = signal<Recipe[]>([]);
  categories = signal<Category[]>([]); // Recipe categories
  recipeIngredients = signal<RecipeIngredient[]>([]);
  recipePreparations = signal<RecipePreparation[]>([]);
  recipeSubRecipes = signal<RecipeSubRecipe[]>([]);
  promotions = signal<Promotion[]>([]);
  promotionRecipes = signal<PromotionRecipe[]>([]);

  // Computed
  recipesById = computed(() => new Map(this.recipes().map(r => [r.id, r])));

  recipeCosts = computed(() => {
    const ingredientsMap = new Map(this.inventoryState.ingredients().map(i => [i.id, i]));
    const recipeIngredients = this.recipeIngredients();
    const recipeSubRecipes = this.recipeSubRecipes();
    const recipes = this.recipes();
    const memo = new Map<string, { totalCost: number; ingredientCount: number; rawIngredients: Map<string, number> }>();

    const calculateCost = (recipeId: string): { totalCost: number; ingredientCount: number; rawIngredients: Map<string, number> } => {
        if (memo.has(recipeId)) {
            return memo.get(recipeId)!;
        }

        let totalCost = 0;
        const rawIngredients = new Map<string, number>();
        
        const directIngredients = recipeIngredients.filter(ri => ri.recipe_id === recipeId);
        for (const ri of directIngredients) {
            // FIX: Add a guard to ensure ingredient exists before accessing its properties.
            const ingredient = ingredientsMap.get(ri.ingredient_id);
            if (ingredient) {
                totalCost += (ingredient.cost || 0) * ri.quantity;
                rawIngredients.set(ri.ingredient_id, (rawIngredients.get(ri.ingredient_id) || 0) + ri.quantity);
            }
        }

        const subRecipes = recipeSubRecipes.filter(rsr => rsr.parent_recipe_id === recipeId);
        for (const sr of subRecipes) {
            const subRecipeCost = calculateCost(sr.child_recipe_id);
            totalCost += subRecipeCost.totalCost * sr.quantity;
            for (const [ingId, qty] of subRecipeCost.rawIngredients.entries()) {
              rawIngredients.set(ingId, (rawIngredients.get(ingId) || 0) + (qty * sr.quantity));
            }
        }
        
        const result = {
            totalCost,
            ingredientCount: directIngredients.length + subRecipes.length,
            rawIngredients,
        };
        memo.set(recipeId, result);
        return result;
    };

    for (const recipe of recipes) {
        if (!memo.has(recipe.id)) {
            calculateCost(recipe.id);
        }
    }
    
    return memo;
  });

  recipeDirectComposition = computed(() => {
    const recipes = this.recipes();
    const recipeIngredients = this.recipeIngredients();
    const recipeSubRecipes = this.recipeSubRecipes();
    const recipesMap = new Map(recipes.map(r => [r.id, r]));

    const compositionMap = new Map<string, { directIngredients: { ingredientId: string, quantity: number }[], subRecipeIngredients: { ingredientId: string, quantity: number }[] }>();

    for (const recipe of recipes) {
        const directIngredients = recipeIngredients
            .filter(ri => ri.recipe_id === recipe.id)
            .map(ri => ({ ingredientId: ri.ingredient_id, quantity: ri.quantity }));

        const subRecipeIngredients = recipeSubRecipes
            .filter(rsr => rsr.parent_recipe_id === recipe.id)
            .map(rsr => {
                // FIX: Add a guard to ensure childRecipe is not undefined.
                const childRecipe = recipesMap.get(rsr.child_recipe_id);
                // The ingredient to deduct is the one linked to the sub-recipe via source_ingredient_id
                return childRecipe?.source_ingredient_id 
                    ? { ingredientId: childRecipe.source_ingredient_id, quantity: rsr.quantity }
                    : null;
            })
            .filter((item): item is { ingredientId: string, quantity: number } => item !== null);

        compositionMap.set(recipe.id, { directIngredients, subRecipeIngredients });
    }
    return compositionMap;
  });

  recipesWithStockStatus = computed(() => {
    const ingredientsStockMap = new Map(this.inventoryState.ingredients().map(i => [i.id, i.stock]));
    const directCompositions = this.recipeDirectComposition();
    const allRecipes = this.recipes();

    const memoCanProduce = new Map<string, boolean>();

    const canProduce = (recipeId: string): boolean => {
      if (memoCanProduce.has(recipeId)) {
        return memoCanProduce.get(recipeId)!;
      }

      const composition = directCompositions.get(recipeId);
      if (!composition) {
        memoCanProduce.set(recipeId, true);
        return true;
      }

      for (const ing of composition.directIngredients) {
        // FIX: Explicitly cast the map get result to number to satisfy the compiler.
        if (((ingredientsStockMap.get(ing.ingredientId) as number | undefined) ?? 0) < ing.quantity) {
          memoCanProduce.set(recipeId, false);
          return false;
        }
      }

      for (const sub of composition.subRecipeIngredients) {
        const subRecipe = allRecipes.find(r => r.source_ingredient_id === sub.ingredientId);
        if (!subRecipe || !canProduce(subRecipe.id)) {
          memoCanProduce.set(recipeId, false);
          return false;
        }
      }

      memoCanProduce.set(recipeId, true);
      return true;
    };

    return allRecipes.map(recipe => {
      const composition = directCompositions.get(recipe.id);
      let hasStock = true;

      if (composition) {
        for (const ing of composition.directIngredients) {
          if (((ingredientsStockMap.get(ing.ingredientId) as number | undefined) ?? 0) <= 0) {
            hasStock = false;
            break;
          }
        }
        if (!hasStock) return { ...recipe, hasStock };

        for (const sub of composition.subRecipeIngredients) {
          const subRecipeStock = (ingredientsStockMap.get(sub.ingredientId) as number | undefined) ?? 0;
          
          if (subRecipeStock > 0) {
            continue;
          } else {
            const subRecipe = allRecipes.find(r => r.source_ingredient_id === sub.ingredientId);
            if (!subRecipe || !canProduce(subRecipe.id)) {
              hasStock = false;
              break;
            }
          }
        }
      }
      return { ...recipe, hasStock };
    });
  });

  clearData() {
    this.recipes.set([]);
    this.categories.set([]);
    this.recipeIngredients.set([]);
    this.recipePreparations.set([]);
    this.recipeSubRecipes.set([]);
    this.promotions.set([]);
    this.promotionRecipes.set([]);
  }
}