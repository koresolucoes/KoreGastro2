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

  async updateRecipeDetails(recipeId: string, recipeData: Partial<Recipe>): Promise<{ success: boolean; error: any }> {
    const { id, created_at, hasStock, ...updateData } = recipeData as any;
    const { error } = await supabase
      .from('recipes')
      .update(updateData)
      .eq('id', recipeId);
      
    return { success: !error, error };
  }

  async updateRecipeImage(recipeId: string, imageFile: File): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    
    const fileExt = imageFile.name.split('.').pop();
    const path = `public/recipes/${recipeId}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('restaurant_assets')
      .upload(path, imageFile, { upsert: true });

    if (uploadError) {
      return { success: false, error: uploadError };
    }

    const { data } = supabase.storage
      .from('restaurant_assets')
      .getPublicUrl(path);

    const { error: dbError } = await supabase
      .from('recipes')
      .update({ image_url: data.publicUrl })
      .eq('id', recipeId);

    return { success: !dbError, error: dbError };
  }

  async updateRecipeAvailability(recipeId: string, isAvailable: boolean): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase
      .from('recipes')
      .update({ is_available: isAvailable })
      .eq('id', recipeId);
      
    return { success: !error, error };
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
  async addRecipeCategory(name: string, imageFile?: File | null): Promise<{ success: boolean, error: any, data?: Category }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const { data, error } = await supabase.from('categories').insert({ name, user_id: userId }).select().single();
    
    if (error) {
        return { success: false, error, data: undefined };
    }

    if (imageFile && data) {
        const { success, error: imageError } = await this.updateRecipeCategoryImage(data.id, imageFile);
        if (!success) {
            // Optionally, decide if you want to delete the created category if image upload fails
            console.error("Category created, but image upload failed:", imageError);
        }
    }
    
    // Refetch data to include the image_url if it was added
    const { data: finalData } = await supabase.from('categories').select('*').eq('id', data.id).single();

    return { success: true, error: null, data: finalData || data };
  }

  async updateRecipeCategory(id: string, name: string, imageFile?: File | null): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('categories').update({ name }).eq('id', id);

    if (error) {
        return { success: false, error };
    }

    if (imageFile) {
        return this.updateRecipeCategoryImage(id, imageFile);
    }

    return { success: true, error: null };
  }

  async updateRecipeCategoryImage(id: string, imageFile: File): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    const fileExt = imageFile.name.split('.').pop();
    const path = `public/categories/${id}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('restaurant_assets')
      .upload(path, imageFile, { upsert: true });

    if (uploadError) {
      return { success: false, error: uploadError };
    }

    const { data } = supabase.storage
      .from('restaurant_assets')
      .getPublicUrl(path);

    const { error: dbError } = await supabase
      .from('categories')
      .update({ image_url: data.publicUrl })
      .eq('id', id);
      
    return { success: !dbError, error: dbError };
  }

  async deleteRecipeCategory(id: string): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('categories').delete().eq('id', id);
    return { success: !error, error };
  }
}
