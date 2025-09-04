import { Injectable, inject } from '@angular/core';
import { Recipe, RecipeIngredient, RecipePreparation, RecipeSubRecipe, Category } from '../models/db.models';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';

@Injectable({
  providedIn: 'root',
})
export class RecipeDataService {
  private authService = inject(AuthService);

  async addRecipe(recipe: Partial<Omit<Recipe, 'id' | 'created_at'>>): Promise<{ success: boolean; error: any; data?: Recipe }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' }, data: undefined };
    const { data, error } = await supabase.from('recipes').insert({ ...recipe, user_id: userId }).select().single();
    return { success: !error, error, data };
  }
  
  async saveTechnicalSheet(
    recipeId: string,
    recipeData: Partial<Recipe>,
    preparations: Partial<RecipePreparation>[],
    ingredients: Partial<RecipeIngredient>[],
    subRecipes: Partial<RecipeSubRecipe>[]
  ): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    // 1. Update the main recipe details
    const { error: recipeError } = await supabase.from('recipes').update(recipeData).eq('id', recipeId);
    if (recipeError) return { success: false, error: recipeError };

    // 2. Clear old technical sheet data
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
    await supabase.from('recipe_sub_recipes').delete().eq('parent_recipe_id', recipeId);
    await supabase.from('recipe_preparations').delete().eq('recipe_id', recipeId);

    // 3. Insert new technical sheet data
    if (preparations.length > 0) {
        const prepsToInsert = preparations.map(p => ({ ...p, recipe_id: recipeId, user_id: userId }));
        const { error: prepError } = await supabase.from('recipe_preparations').insert(prepsToInsert);
        if (prepError) return { success: false, error: prepError };
    }

    if (ingredients.length > 0) {
        const ingredientsToInsert = ingredients.map(i => ({ ...i, recipe_id: recipeId, user_id: userId }));
        const { error: ingredientError } = await supabase.from('recipe_ingredients').insert(ingredientsToInsert);
        if (ingredientError) return { success: false, error: ingredientError };
    }
    
    if (subRecipes.length > 0) {
        const subRecipesToInsert = subRecipes.map(sr => ({ ...sr, parent_recipe_id: recipeId, user_id: userId }));
        const { error: subRecipeError } = await supabase.from('recipe_sub_recipes').insert(subRecipesToInsert);
        if (subRecipeError) return { success: false, error: subRecipeError };
    }

    return { success: true, error: null };
  }

  async deleteRecipe(recipeId: string): Promise<{ success: boolean; error: any }> {
    // Must delete in order to respect foreign key constraints
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
    await supabase.from('recipe_sub_recipes').delete().eq('parent_recipe_id', recipeId);
    await supabase.from('recipe_sub_recipes').delete().eq('child_recipe_id', recipeId);
    await supabase.from('recipe_preparations').delete().eq('recipe_id', recipeId);
    await supabase.from('promotion_recipes').delete().eq('recipe_id', recipeId);
    await supabase.from('order_items').delete().eq('recipe_id', recipeId);

    const { error } = await supabase.from('recipes').delete().eq('id', recipeId);
    return { success: !error, error };
  }

  // --- Recipe Category Management ---
  async addRecipeCategory(name: string): Promise<{ success: boolean, error: any, data?: Category }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { data, error } = await supabase.from('categories').insert({ name, user_id: userId }).select().single();
    return { success: !error, error, data };
  }

  async updateRecipeCategory(id: string, name: string): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('categories').update({ name }).eq('id', id);
    return { success: !error, error };
  }

  async deleteRecipeCategory(id: string): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('categories').delete().eq('id', id);
    return { success: !error, error };
  }
}