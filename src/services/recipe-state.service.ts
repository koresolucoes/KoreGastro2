import { Injectable, signal, computed, inject } from "@angular/core";
import {
  Recipe,
  Category,
  RecipeIngredient,
  RecipePreparation,
  RecipeSubRecipe,
  Promotion,
  PromotionRecipe,
  Ingredient,
} from "../models/db.models";
import { InventoryStateService } from "./inventory-state.service";

@Injectable({ providedIn: "root" })
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
  recipesById = computed(() => new Map(this.recipes().map((r) => [r.id, r])));

  recipeTheoreticalCosts = computed(() => {
    // FIX: Explicitly type the Map to ensure correct type inference for '.get()'.
    const ingredientsMap = new Map<string, Ingredient>(
      this.inventoryState.ingredients().map((i) => [i.id, i]),
    );
    const recipeIngredients = this.recipeIngredients();
    const recipeSubRecipes = this.recipeSubRecipes();
    const recipes = this.recipes();
    const memo = new Map<
      string,
      {
        totalCost: number;
        ingredientCount: number;
        rawIngredients: Map<string, number>;
      }
    >();
    const visiting = new Set<string>();

    const calculateCost = (
      recipeId: string,
    ): {
      totalCost: number;
      ingredientCount: number;
      rawIngredients: Map<string, number>;
    } => {
      if (memo.has(recipeId)) {
        return memo.get(recipeId)!;
      }
      if (visiting.has(recipeId)) {
        return {
          totalCost: 0,
          ingredientCount: 0,
          rawIngredients: new Map<string, number>(),
        };
      }

      visiting.add(recipeId);

      let totalCost = 0;
      const rawIngredients = new Map<string, number>();
      let ingredientCount = 0;

      const recipe = recipes.find((r) => r.id === recipeId);

      // This calculates the theoretical cost strictly from components!
      // But if it's a simple item mapped directly to an ingredient with NO components, theoretical cost = ingredient cost.
      const directIngredients = recipeIngredients.filter(
        (ri) => ri.recipe_id === recipeId,
      );
      const subRecipes = recipeSubRecipes.filter(
        (rsr) => rsr.parent_recipe_id === recipeId,
      );

      if (
        directIngredients.length === 0 &&
        subRecipes.length === 0 &&
        recipe?.source_ingredient_id
      ) {
        const ingredient = ingredientsMap.get(recipe.source_ingredient_id);
        if (ingredient) {
          totalCost += ingredient.cost || 0;
          rawIngredients.set(recipe.source_ingredient_id, 1);
        }
        ingredientCount = 1;
      } else {
        const countedSubRecipeIds = new Set<string>();
        for (const ri of directIngredients) {
          const ingredient = ingredientsMap.get(ri.ingredient_id);
          if (ingredient) {
            const factor =
              ri.correction_factor && ri.correction_factor > 0
                ? ri.correction_factor
                : 1;
            const actualQuantity = ri.quantity * factor;

            let itemCost = ingredient.cost || 0;
            if (ingredient.proxy_recipe_id) {
              if (visiting.has(ingredient.proxy_recipe_id)) {
                itemCost = ingredient.cost || 0;
              } else {
                const proxyRecipe = recipes.find(
                  (r) => r.id === ingredient.proxy_recipe_id,
                );
                const subRecipeCost = calculateCost(ingredient.proxy_recipe_id);
                itemCost = subRecipeCost.totalCost || ingredient.cost || 0;
                countedSubRecipeIds.add(ingredient.proxy_recipe_id);
              }
            }
            totalCost += itemCost * actualQuantity;
            rawIngredients.set(
              ri.ingredient_id,
              (rawIngredients.get(ri.ingredient_id) || 0) + actualQuantity,
            );
          }
        }

        for (const sr of subRecipes) {
          if (countedSubRecipeIds.has(sr.child_recipe_id)) {
            continue; // Already counted as proxy ingredient in directIngredients
          }
          if (visiting.has(sr.child_recipe_id)) {
            continue; // Cycle detected
          }
          const subRecipeCost = calculateCost(sr.child_recipe_id);
          totalCost += subRecipeCost.totalCost * sr.quantity;
          for (const [ingId, qty] of subRecipeCost.rawIngredients.entries()) {
            rawIngredients.set(
              ingId,
              (rawIngredients.get(ingId) || 0) + qty * sr.quantity,
            );
          }
        }

        ingredientCount = directIngredients.length + subRecipes.length;
      }

      if (recipe) {
        if (recipe.labor_cost) totalCost += recipe.labor_cost;
        if (recipe.yield_quantity && recipe.yield_quantity > 0) {
          totalCost = totalCost / recipe.yield_quantity;
          for (const [ingId, qty] of rawIngredients.entries()) {
            rawIngredients.set(ingId, qty / recipe.yield_quantity);
          }
        }
      }

      const result = { totalCost, ingredientCount, rawIngredients };
      visiting.delete(recipeId);
      memo.set(recipeId, result);
      return result;
    };

    for (const recipe of recipes) {
      if (!memo.has(recipe.id)) calculateCost(recipe.id);
    }
    return memo;
  });

  recipeCosts = computed(() => {
    // FIX: Explicitly type the Map to ensure correct type inference for '.get()'.
    const ingredientsMap = new Map<string, Ingredient>(
      this.inventoryState.ingredients().map((i) => [i.id, i]),
    );
    const recipeIngredients = this.recipeIngredients();
    const recipeSubRecipes = this.recipeSubRecipes();
    const recipes = this.recipes();
    const memo = new Map<
      string,
      {
        totalCost: number;
        ingredientCount: number;
        rawIngredients: Map<string, number>;
      }
    >();
    const visiting = new Set<string>();

    const calculateCost = (
      recipeId: string,
    ): {
      totalCost: number;
      ingredientCount: number;
      rawIngredients: Map<string, number>;
    } => {
      if (memo.has(recipeId)) {
        return memo.get(recipeId)!;
      }
      if (visiting.has(recipeId)) {
        return {
          totalCost: 0,
          ingredientCount: 0,
          rawIngredients: new Map<string, number>(),
        };
      }

      visiting.add(recipeId);

      let totalCost = 0;
      const rawIngredients = new Map<string, number>();
      let ingredientCount = 0;

      const recipe = recipes.find((r) => r.id === recipeId);
      const directIngredients = recipeIngredients.filter(
        (ri) => ri.recipe_id === recipeId,
      );
      const subRecipes = recipeSubRecipes.filter(
        (rsr) => rsr.parent_recipe_id === recipeId,
      );

      if (
        directIngredients.length === 0 &&
        subRecipes.length === 0 &&
        recipe?.source_ingredient_id
      ) {
        const ingredient = ingredientsMap.get(recipe.source_ingredient_id);
        if (ingredient) {
          totalCost += ingredient.cost || 0;
          // Note: For actual quantity, normally it gives 1 unit. Yield logic below applies later
          rawIngredients.set(recipe.source_ingredient_id, 1);
        }
        ingredientCount = 1;
      } else {
        const countedSubRecipeIds = new Set<string>();
        for (const ri of directIngredients) {
          // FIX: Add a guard to ensure ingredient exists before accessing its properties.
          const ingredient = ingredientsMap.get(ri.ingredient_id);
          if (ingredient) {
            // Furo 5: Aplicar fator de correção (se existir, senão 1)
            const factor =
              ri.correction_factor && ri.correction_factor > 0
                ? ri.correction_factor
                : 1;
            const actualQuantity = ri.quantity * factor;

            let itemCost = ingredient.cost || 0;
            if (ingredient.proxy_recipe_id) {
              if (visiting.has(ingredient.proxy_recipe_id)) {
                itemCost = ingredient.cost || 0;
              } else {
                const proxyRecipe = recipes.find(
                  (r) => r.id === ingredient.proxy_recipe_id,
                );
                const subRecipeCost = calculateCost(ingredient.proxy_recipe_id);
                itemCost = subRecipeCost.totalCost || ingredient.cost || 0;
                countedSubRecipeIds.add(ingredient.proxy_recipe_id);
              }
            }
            totalCost += itemCost * actualQuantity;
            rawIngredients.set(
              ri.ingredient_id,
              (rawIngredients.get(ri.ingredient_id) || 0) + actualQuantity,
            );
          }
        }

        const subRecipes = recipeSubRecipes.filter(
          (rsr) => rsr.parent_recipe_id === recipeId,
        );
        for (const sr of subRecipes) {
          if (countedSubRecipeIds.has(sr.child_recipe_id)) {
            continue; // Already counted as proxy ingredient in directIngredients
          }
          if (visiting.has(sr.child_recipe_id)) {
            continue; // Cycle detected
          }
          const subRecipeCost = calculateCost(sr.child_recipe_id);
          totalCost += subRecipeCost.totalCost * sr.quantity;
          for (const [ingId, qty] of subRecipeCost.rawIngredients.entries()) {
            rawIngredients.set(
              ingId,
              (rawIngredients.get(ingId) || 0) + qty * sr.quantity,
            );
          }
        }

        ingredientCount = directIngredients.length + subRecipes.length;
      }

      if (recipe) {
        // Furo 7: Custo de Mão de Obra
        if (recipe.labor_cost) {
          totalCost += recipe.labor_cost;
        }
        // Furo 4: Rendimento de Receitas
        if (recipe.yield_quantity && recipe.yield_quantity > 0) {
          totalCost = totalCost / recipe.yield_quantity;
          for (const [ingId, qty] of rawIngredients.entries()) {
            rawIngredients.set(ingId, qty / recipe.yield_quantity);
          }
        }
      }

      const result = {
        totalCost,
        ingredientCount,
        rawIngredients,
      };
      visiting.delete(recipeId);
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
    // FIX: Explicitly type the Map to ensure correct type inference for '.get()'.
    const recipesMap = new Map<string, Recipe>(recipes.map((r) => [r.id, r]));

    const compositionMap = new Map<
      string,
      {
        directIngredients: { ingredientId: string; quantity: number }[];
        subRecipeIngredients: { ingredientId: string; quantity: number }[];
      }
    >();

    for (const recipe of recipes) {
      const yieldQty =
        recipe.yield_quantity && recipe.yield_quantity > 0
          ? recipe.yield_quantity
          : 1;

      const directIngredients = recipeIngredients
        .filter((ri) => ri.recipe_id === recipe.id)
        .map((ri) => {
          const factor =
            ri.correction_factor && ri.correction_factor > 0
              ? ri.correction_factor
              : 1;
          return {
            ingredientId: ri.ingredient_id,
            quantity: (ri.quantity * factor) / yieldQty,
          };
        });

      if (recipe.source_ingredient_id) {
        const exists = directIngredients.find(
          (di) => di.ingredientId === recipe.source_ingredient_id,
        );
        if (!exists) {
          directIngredients.push({
            ingredientId: recipe.source_ingredient_id,
            quantity: 1 / yieldQty,
          });
        }
      }

      const subRecipeIngredients = recipeSubRecipes
        .filter((rsr) => rsr.parent_recipe_id === recipe.id)
        .map((rsr) => {
          // FIX: Add a guard to ensure childRecipe is not undefined.
          const childRecipe = recipesMap.get(rsr.child_recipe_id);
          // The ingredient to deduct is the one linked to the sub-recipe via source_ingredient_id
          if (childRecipe?.source_ingredient_id) {
            return {
              ingredientId: childRecipe.source_ingredient_id,
              quantity: rsr.quantity / yieldQty,
            };
          }
          return null;
        })
        .filter(
          (item): item is { ingredientId: string; quantity: number } =>
            item !== null,
        );

      compositionMap.set(recipe.id, {
        directIngredients,
        subRecipeIngredients,
      });
    }
    return compositionMap;
  });

  recipesWithStockStatus = computed(() => {
    // FIX: Explicitly type the Map to ensure correct type inference for '.get()'.
    const ingredientsStockMap = new Map<string, number>(
      this.inventoryState.ingredients().map((i) => [i.id, i.stock]),
    );
    const directCompositions = this.recipeDirectComposition();
    const allRecipes = this.recipes();

    const memoCanProduce = new Map<string, boolean>();
    const processing = new Set<string>();

    const canProduce = (recipeId: string): boolean => {
      if (memoCanProduce.has(recipeId)) {
        return memoCanProduce.get(recipeId)!;
      }
      if (processing.has(recipeId)) {
        return false; // Cycle detected, assume false to prevent infinite loop
      }
      processing.add(recipeId);

      const composition = directCompositions.get(recipeId);
      if (!composition) {
        memoCanProduce.set(recipeId, true);
        return true;
      }

      for (const ing of composition.directIngredients) {
        // FIX: Explicitly cast the map get result to number to satisfy the compiler.
        if ((ingredientsStockMap.get(ing.ingredientId) ?? 0) < ing.quantity) {
          memoCanProduce.set(recipeId, false);
          return false;
        }
      }

      for (const sub of composition.subRecipeIngredients) {
        const subRecipe = allRecipes.find(
          (r) => r.source_ingredient_id === sub.ingredientId,
        );
        if (!subRecipe || !canProduce(subRecipe.id)) {
          memoCanProduce.set(recipeId, false);
          return false;
        }
      }

      memoCanProduce.set(recipeId, true);
      return true;
    };

    return allRecipes.map((recipe) => {
      const composition = directCompositions.get(recipe.id);
      let hasStock = true;

      if (composition) {
        for (const ing of composition.directIngredients) {
          if ((ingredientsStockMap.get(ing.ingredientId) ?? 0) <= 0) {
            hasStock = false;
            break;
          }
        }
        if (!hasStock) return { ...recipe, hasStock };

        for (const sub of composition.subRecipeIngredients) {
          const subRecipeStock = ingredientsStockMap.get(sub.ingredientId) ?? 0;

          if (subRecipeStock > 0) {
            continue;
          } else {
            const subRecipe = allRecipes.find(
              (r) => r.source_ingredient_id === sub.ingredientId,
            );
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
