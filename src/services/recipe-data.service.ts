

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

  async saveTechnicalSheet(
    recipeId: string,
    recipeUpdates: Partial<Recipe>,
    preparationsFromUI: (RecipePreparation & { recipe_ingredients: RecipeIngredient[] })[]
  ): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) {
      return { success: false, error: { message: 'User not authenticated' } };
    }

    try {
      // 1. Update the main recipe details
      const { error: recipeUpdateError } = await supabase.from('recipes').update(recipeUpdates).eq('id', recipeId);
      if (recipeUpdateError) throw recipeUpdateError;

      // 2. Clear existing associations for a clean slate
      await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
      await supabase.from('recipe_preparations').delete().eq('recipe_id', recipeId);
      
      // 3. Prepare and filter valid preparations from the UI, ensuring a stable order
      const validPreparations = preparationsFromUI
        .filter(p => p.name && p.name.trim() !== '')
        .map((p, index) => ({ ...p, display_order: index })); 

      if (validPreparations.length === 0) {
        return { success: true, error: null };
      }

      // 4. Batch insert all new preparations
      const prepsToInsert = validPreparations.map(p => ({
        recipe_id: recipeId,
        station_id: p.station_id,
        name: p.name,
        prep_instructions: p.prep_instructions,
        display_order: p.display_order,
        user_id: userId
      }));

      const { data: newlyCreatedPreps, error: prepInsertError } = await supabase
        .from('recipe_preparations')
        .insert(prepsToInsert)
        .select('id, display_order');

      if (prepInsertError) throw prepInsertError;
      if (newlyCreatedPreps.length !== validPreparations.length) {
          throw new Error('Mismatch between inserted preparations and returned data.');
      }

      // 5. Create a reliable map from temp UI ID to new DB ID using the stable display_order
      const dbPrepMapByOrder = new Map(newlyCreatedPreps.map(p => [p.display_order, p.id]));
      const tempIdToDbIdMap = new Map<string, string>();
      validPreparations.forEach(p => {
        const dbId = dbPrepMapByOrder.get(p.display_order);
        if (dbId) {
          tempIdToDbIdMap.set(p.id, dbId);
        }
      });

      // 6. Consolidate ALL ingredients across ALL preparations to handle the unique constraint
      const ingredientsMap = new Map<string, { quantity: number; preparation_id: string }>();

      for (const uiPrep of validPreparations) {
        const dbPrepId = tempIdToDbIdMap.get(uiPrep.id);
        if (!dbPrepId || !uiPrep.recipe_ingredients) continue;

        for (const ingredient of uiPrep.recipe_ingredients) {
          if (ingredient.quantity <= 0) continue;

          const existing = ingredientsMap.get(ingredient.ingredient_id);
          if (existing) {
            existing.quantity += ingredient.quantity;
          } else {
            ingredientsMap.set(ingredient.ingredient_id, {
              quantity: ingredient.quantity,
              preparation_id: dbPrepId, // Associate with the first preparation it appears in
            });
          }
        }
      }
      
      const allIngredientsToInsert = Array.from(ingredientsMap.entries()).map(([ingredient_id, details]) => ({
        recipe_id: recipeId,
        ingredient_id: ingredient_id,
        quantity: details.quantity,
        preparation_id: details.preparation_id,
        user_id: userId,
      }));


      // 7. Batch insert all consolidated ingredients
      if (allIngredientsToInsert.length > 0) {
        const { error: ingredientsInsertError } = await supabase
          .from('recipe_ingredients')
          .insert(allIngredientsToInsert);
        if (ingredientsInsertError) throw ingredientsInsertError;
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
    const { error } = await supabase.from('recipes').delete().eq('id', id);
    return { success: !error, error };
  }
}