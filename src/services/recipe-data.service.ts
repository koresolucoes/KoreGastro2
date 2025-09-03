
import { Injectable, inject } from '@angular/core';
import { Recipe, RecipeIngredient, Category, RecipePreparation, RecipeSubRecipe } from '../models/db.models';
import { AuthService } from './auth.service';
import { SupabaseStateService } from './supabase-state.service';
import { supabase } from './supabase-client';

@Injectable({
  providedIn: 'root',
})
export class RecipeDataService {
  private authService = inject(AuthService);
  private stateService = inject(SupabaseStateService);

  getRecipePreparations(recipeId: string): RecipePreparation[] {
    return this.stateService.recipePreparations().filter(p => p.recipe_id === recipeId);
  }

  getRecipeIngredients(recipeId: string): RecipeIngredient[] {
    return this.stateService.recipeIngredients().filter(ri => ri.recipe_id === recipeId);
  }
  
  async addRecipe(recipe: Partial<Omit<Recipe, 'id' | 'created_at'>>): Promise<{ success: boolean, error: any, data?: Recipe }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const recipeData = { is_available: true, price: 0, is_sub_recipe: false, ...recipe, user_id: userId };
    const { data, error } = await supabase.from('recipes').insert(recipeData).select().single();
    return { success: !error, error, data };
  }
  
  async addRecipeCategory(name: string): Promise<{ success: boolean, error: any, data?: Category }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { data, error } = await supabase.from('categories').insert({ name, user_id: userId }).select().single();
    return { success: !error, error, data };
  }

  async saveTechnicalSheet(
    recipeId: string,
    recipeUpdates: Partial<Recipe>,
    ingredients: RecipeIngredient[],
    subRecipes: RecipeSubRecipe[]
  ): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    try {
      const { error: recipeUpdateError } = await supabase.from('recipes').update(recipeUpdates).eq('id', recipeId);
      if (recipeUpdateError) throw recipeUpdateError;

      // Clean slate for associations
      await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
      await supabase.from('recipe_sub_recipes').delete().eq('parent_recipe_id', recipeId);

      const ingredientsToInsert = ingredients.map(i => ({
        recipe_id: recipeId,
        ingredient_id: i.ingredient_id,
        quantity: i.quantity,
        preparation_id: 'default', // Simplified for now
        user_id: userId,
      }));

      if (ingredientsToInsert.length > 0) {
        const { error: ingredientsError } = await supabase.from('recipe_ingredients').insert(ingredientsToInsert);
        if (ingredientsError) throw ingredientsError;
      }

      const subRecipesToInsert = subRecipes.map(sr => ({
        parent_recipe_id: recipeId,
        child_recipe_id: sr.child_recipe_id,
        quantity: sr.quantity,
        user_id: userId,
      }));
      
      if (subRecipesToInsert.length > 0) {
        const { error: subRecipesError } = await supabase.from('recipe_sub_recipes').insert(subRecipesToInsert);
        if (subRecipesError) throw subRecipesError;
      }
      
      return { success: true, error: null };
    } catch (error: any) {
      console.error('Error saving technical sheet:', error);
      return { success: false, error };
    }
  }

  async updateRecipeAvailability(id: string, is_available: boolean): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('recipes').update({ is_available }).eq('id', id);
    return { success: !error, error };
  }

  async deleteRecipe(id: string): Promise<{ success: boolean, error: any }> {
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', id);
    await supabase.from('recipe_preparations').delete().eq('recipe_id', id);
    await supabase.from('recipe_sub_recipes').delete().eq('parent_recipe_id', id);
    const { error } = await supabase.from('recipes').delete().eq('id', id);
    return { success: !error, error };
  }
}
