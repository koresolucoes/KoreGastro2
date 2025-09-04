
import { Injectable, inject } from '@angular/core';
import { Recipe, RecipeIngredient, Category, RecipePreparation, RecipeSubRecipe } from '../models/db.models';
import { AuthService } from './auth.service';
import { SupabaseStateService } from './supabase-state.service';
import { supabase } from './supabase-client';
import { v4 as uuidv4 } from 'uuid';

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

  async updateRecipeCategory(id: string, name: string): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('categories').update({ name }).eq('id', id);
    return { success: !error, error };
  }

  async deleteRecipeCategory(id: string): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('categories').delete().eq('id', id);
    return { success: !error, error };
  }

  async saveTechnicalSheet(
    recipeId: string,
    recipeUpdates: Partial<Recipe>,
    // FIX: Changed parameter type to be compatible with form data from the component.
    preparations: (Partial<RecipePreparation> & { id: string })[],
    // FIX: The `ingredients` parameter now correctly reflects the shape of the form data
    // coming from the component, which omits `user_id` and `recipe_id`.
    ingredients: Omit<RecipeIngredient, 'user_id' | 'recipe_id'>[],
    // FIX: Changed subRecipes parameter type to match the form data shape.
    subRecipes: Omit<RecipeSubRecipe, 'user_id' | 'parent_recipe_id'>[]
  ): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    try {
      // 1. Update recipe details
      const { error: recipeUpdateError } = await supabase.from('recipes').update(recipeUpdates).eq('id', recipeId);
      if (recipeUpdateError) throw recipeUpdateError;

      // 2. Clear all existing associations
      await supabase.from('recipe_preparations').delete().eq('recipe_id', recipeId);
      await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
      await supabase.from('recipe_sub_recipes').delete().eq('parent_recipe_id', recipeId);

      const tempIdToDbIdMap = new Map<string, string>();
      let finalAssemblyPrepId: string | undefined;

      // FIX: Create an implicit preparation step for items in "Final Assembly".
      // The component uses 'final-assembly' as a placeholder ID, which is not a valid foreign key.
      if (ingredients.some(i => i.preparation_id === 'final-assembly')) {
        finalAssemblyPrepId = uuidv4();
        const finalAssemblyPrep: RecipePreparation = {
          id: finalAssemblyPrepId,
          recipe_id: recipeId,
          station_id: this.stateService.stations()[0]?.id || '', // Default station
          name: 'Montagem Final',
          prep_instructions: 'Ingredientes para a montagem final do prato.',
          display_order: preparations.length,
          created_at: new Date().toISOString(),
          user_id: userId,
        };
        preparations.push(finalAssemblyPrep);
      }

      // 3. Insert new preparations and map temporary IDs
      const prepsToInsert = preparations.map(({ id, ...rest }) => {
        const newId = id.startsWith('temp-') ? uuidv4() : id;
        if (id.startsWith('temp-')) {
          tempIdToDbIdMap.set(id, newId);
        }
        return { ...rest, id: newId, user_id: userId, recipe_id: recipeId };
      });
      
      if (prepsToInsert.length > 0) {
        const { error: prepInsertError } = await supabase.from('recipe_preparations').insert(prepsToInsert as RecipePreparation[]);
        if (prepInsertError) throw prepInsertError;
      }

      // 4. Insert new ingredients with correct preparation IDs
      const ingredientsToInsert = ingredients.map(i => {
        const originalPrepId = i.preparation_id;
        let dbPrepId = tempIdToDbIdMap.get(originalPrepId) || originalPrepId;
        
        // Assign the newly created prep ID for final assembly items.
        if (originalPrepId === 'final-assembly') {
          dbPrepId = finalAssemblyPrepId!;
        }

        return {
          recipe_id: recipeId,
          ingredient_id: i.ingredient_id,
          quantity: i.quantity,
          preparation_id: dbPrepId,
          user_id: userId,
        };
      });

      if (ingredientsToInsert.length > 0) {
        const { error: ingredientsError } = await supabase.from('recipe_ingredients').insert(ingredientsToInsert);
        if (ingredientsError) throw ingredientsError;
      }

      // 5. Insert new sub-recipes
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
    // If this is a proxy recipe, unlink it from the source ingredient first
    const { data: recipeToDelete } = await supabase.from('recipes').select('source_ingredient_id').eq('id', id).single();
    if (recipeToDelete?.source_ingredient_id) {
        await supabase.from('ingredients').update({ 
            is_sellable: false, 
            price: null, 
            proxy_recipe_id: null,
            pos_category_id: null,
            station_id: null
        }).eq('id', recipeToDelete.source_ingredient_id);
    }
    
    // Standard deletion of all related items
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', id);
    await supabase.from('recipe_preparations').delete().eq('recipe_id', id);
    await supabase.from('recipe_sub_recipes').delete().eq('parent_recipe_id', id);
    await supabase.from('recipe_sub_recipes').delete().eq('child_recipe_id', id);
    const { error } = await supabase.from('recipes').delete().eq('id', id);
    return { success: !error, error };
  }
}