import { Recipe, RecipePreparation, RecipeIngredient, RecipeSubRecipe, IngredientUnit } from './db.models';

// Represents the data structure for the technical sheet form
export interface RecipeForm {
  recipe: Partial<Recipe>;
  preparations: (Partial<RecipePreparation> & { id: string })[];
  ingredients: (Omit<RecipeIngredient, 'user_id' | 'recipe_id'> & { unit: IngredientUnit })[];
  subRecipes: Omit<RecipeSubRecipe, 'user_id' | 'parent_recipe_id'>[];
}

// Represents a complete recipe object with all its relations for display
export interface FullRecipe extends Recipe {
    preparations: RecipePreparation[];
    ingredients: (RecipeIngredient & { name: string; unit: string; cost: number })[];
    subRecipes: (RecipeSubRecipe & { name: string; cost: number })[];
    cost: { totalCost: number; ingredientCount: number; rawIngredients: Map<string, number> };
}
