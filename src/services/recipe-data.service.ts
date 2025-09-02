import { Injectable, inject } from '@angular/core';
import { Recipe, RecipeIngredient, Category, RecipePreparation } from '../models/db.models';
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
    const recipeData = { is_available: true, price: 0, ...recipe, user_id: userId };
    const { data, error } = await supabase.from('recipes').insert(recipeData).select().single();
    return { success: !error, error, data };
  }
  
  async addRecipeCategory(name: string): Promise<{ success: boolean, error: any, data?: Category }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { data, error } = await supabase.from('categories').insert({ name, user_id: userId }).select().single();
    return { success: !error, error, data };
  }

  async saveTechnicalSheet(recipeId: string, recipeUpdates: Partial<Recipe>, preparationsToSave: (RecipePreparation & { recipe_ingredients: RecipeIngredient[] })[]): Promise<{ success: boolean, error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    
    const { error: recipeErr } = await supabase.from('recipes').update(recipeUpdates).eq('id', recipeId);
    if (recipeErr) return { success: false, error: recipeErr };

    await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
    await supabase.from('recipe_preparations').delete().eq('recipe_id', recipeId);

    const prepInsertions = preparationsToSave.map(({ id, recipe_ingredients, station_name, ...p }) => ({ ...p, user_id: userId }));
    if (prepInsertions.length === 0) return { success: true, error: null };

    const { data: insertedPreps, error: prepErr } = await supabase.from('recipe_preparations').insert(prepInsertions).select();
    if (prepErr) return { success: false, error: prepErr };

    const tempIdToDbId = new Map(preparationsToSave.map((p, i) => [p.id, insertedPreps![i].id]));
    const allIngredientInsertions = preparationsToSave.flatMap(p => p.recipe_ingredients.map(ri => ({ ...ri, user_id: userId, preparation_id: tempIdToDbId.get(p.id) || ri.preparation_id, ingredients: undefined })));
    
    const mergedIngredientsMap = new Map<string, typeof allIngredientInsertions[0]>();
    for (const ing of allIngredientInsertions) {
        const key = `${ing.preparation_id}-${ing.ingredient_id}`;
        const existing = mergedIngredientsMap.get(key);
        if (existing) existing.quantity += ing.quantity;
        else mergedIngredientsMap.set(key, { ...ing });
    }
    const ingredientInsertions = Array.from(mergedIngredientsMap.values());
    
    if (ingredientInsertions.length > 0) {
        const { error: ingError } = await supabase.from('recipe_ingredients').insert(ingredientInsertions);
        if (ingError) return { success: false, error: ingError };
    }
    return { success: true, error: null };
  }

  async updateRecipeAvailability(id: string, is_available: boolean): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('recipes').update({ is_available }).eq('id', id);
    return { success: !error, error };
  }

  async deleteRecipe(id: string): Promise<{ success: boolean, error: any }> {
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', id);
    await supabase.from('recipe_preparations').delete().eq('recipe_id', id);
    const { error } = await supabase.from('recipes').delete().eq('id', id);
    return { success: !error, error };
  }
}
