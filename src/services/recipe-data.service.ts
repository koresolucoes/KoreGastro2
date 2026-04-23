
import { Injectable, inject } from '@angular/core';
import { Recipe, RecipeIngredient, RecipePreparation, RecipeSubRecipe, Category } from '../models/db.models';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';
import { UnitContextService } from './unit-context.service';

@Injectable({
  providedIn: 'root',
})
export class RecipeDataService {
  private authService = inject(AuthService);
  private unitContextService = inject(UnitContextService);

  private getActiveUnitId(): string | null {
      return this.unitContextService.activeUnitId();
  }

  async addRecipe(recipe: Partial<Omit<Recipe, 'id' | 'created_at'>>): Promise<{ success: boolean; error: any; data?: Recipe }> {
    const storeId = this.getActiveUnitId();
    const ownerId = this.authService.currentUser()?.id;
    if (!storeId || !ownerId) return { success: false, error: { message: 'Active unit or user not found' }, data: undefined };
    
    const { data, error } = await supabase.from('recipes').insert({ 
      ...recipe, 
      user_id: ownerId, 
      store_id: storeId 
    }).select().single();
    return { success: !error, error, data };
  }
  
  async saveTechnicalSheet(
    recipeId: string,
    recipeData: Partial<Recipe>,
    preparations: Partial<RecipePreparation>[],
    ingredients: Partial<RecipeIngredient>[],
    subRecipes: Partial<RecipeSubRecipe>[]
  ): Promise<{ success: boolean; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Active unit not found' } };

    const { error: recipeError } = await supabase.from('recipes').update(recipeData).eq('id', recipeId);
    if (recipeError) return { success: false, error: recipeError };

    await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
    await supabase.from('recipe_sub_recipes').delete().eq('parent_recipe_id', recipeId);
    await supabase.from('recipe_preparations').delete().eq('recipe_id', recipeId);

    if (preparations.length > 0) {
        const prepsToInsert = preparations.map(p => ({ ...p, recipe_id: recipeId, user_id: userId }));
        const { error: prepError } = await supabase.from('recipe_preparations').insert(prepsToInsert);
        if (prepError) return { success: false, error: prepError };
    }

    if (ingredients.length > 0) {
        const ingredientsToInsert = ingredients.map(i => {
            const { ingredients: _, ...rest } = i as any;
            return { ...rest, recipe_id: recipeId, user_id: userId };
        });
        const { error: ingredientError } = await supabase.from('recipe_ingredients').insert(ingredientsToInsert);
        if (ingredientError) return { success: false, error: ingredientError };
    }
    
    if (subRecipes.length > 0) {
        const subRecipesToInsert = subRecipes.map(sr => {
            const { recipes: _, ...rest } = sr as any;
            return { ...rest, parent_recipe_id: recipeId, user_id: userId };
        });
        const { error: subRecipeError } = await supabase.from('recipe_sub_recipes').insert(subRecipesToInsert);
        if (subRecipeError) return { success: false, error: subRecipeError };
    }

    return { success: true, error: null };
  }

  async updateRecipeDetails(recipeId: string, recipeData: Partial<Recipe>, customPrice?: number | null): Promise<{ success: boolean; error: any }> {
    const { id, created_at, hasStock, ...updateData } = recipeData as any;
    const { error } = await supabase
      .from('recipes')
      .update(updateData)
      .eq('id', recipeId);
      
    if (!error) {
         // Also update/insert the custom price
         const storeId = this.getActiveUnitId();
         if (storeId) {
             if (customPrice === null) {
                 // Explicitly remove the override for this store
                 await supabase.from('store_custom_prices').delete().eq('store_id', storeId).eq('recipe_id', recipeId);
             } else if (customPrice !== undefined) {
                 const { data: existingPrice } = await supabase
                    .from('store_custom_prices')
                    .select('*')
                    .eq('store_id', storeId)
                    .eq('recipe_id', recipeId)
                    .maybeSingle();

                 if (existingPrice) {
                     await supabase.from('store_custom_prices')
                        .update({ custom_price: customPrice })
                        .eq('id', existingPrice.id);
                 } else {
                     await supabase.from('store_custom_prices')
                        .insert({ store_id: storeId, recipe_id: recipeId, custom_price: customPrice });
                 }
             }
         }
    }
      
    return { success: !error, error };
  }

  async updateRecipeImage(recipeId: string, imageFile: File): Promise<{ success: boolean; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Active unit not found' } };
    
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
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
    await supabase.from('recipe_sub_recipes').delete().eq('parent_recipe_id', recipeId);
    await supabase.from('recipe_sub_recipes').delete().eq('child_recipe_id', recipeId);
    await supabase.from('recipe_preparations').delete().eq('recipe_id', recipeId);
    await supabase.from('promotion_recipes').delete().eq('recipe_id', recipeId);
    await supabase.from('order_items').delete().eq('recipe_id', recipeId);

    const { error } = await supabase.from('recipes').delete().eq('id', recipeId);
    return { success: !error, error };
  }

  async addRecipeCategory(name: string, imageFile?: File | null): Promise<{ success: boolean, error: any, data?: Category }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Active unit not found' } };

    const { data, error } = await supabase.from('categories').insert({ name, user_id: userId }).select().single();
    
    if (error) {
        return { success: false, error, data: undefined };
    }

    if (imageFile && data) {
        const { success, error: imageError } = await this.updateRecipeCategoryImage(data.id, imageFile);
        if (!success) {
            console.error("Category created, but image upload failed:", imageError);
        }
    }
    
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
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Active unit not found' } };

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

  async cloneMenuFromStore(sourceStoreId: string): Promise<{ success: boolean, error: any }> {
    const targetStoreId = this.getActiveUnitId();
    const ownerId = this.authService.currentUser()?.id;
    if (!targetStoreId || !ownerId) return { success: false, error: { message: 'Active unit or user not found' } };
    if (sourceStoreId === targetStoreId) return { success: false, error: { message: 'Source and target stores are the same' } };

    try {
      // 1. Fetch source categories
      const { data: sourceCategories, error: catError } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', sourceStoreId);
      
      if (catError) throw catError;
      if (!sourceCategories || sourceCategories.length === 0) return { success: true, error: null };

      // 2. Fetch source recipes
      const { data: sourceRecipes, error: recError } = await supabase
        .from('recipes')
        .select('*')
        .eq('store_id', sourceStoreId);
      
      if (recError) throw recError;

      // 3. Map old category IDs to new ones
      const categoryIdMap = new Map<string, string>();

      for (const cat of sourceCategories) {
        const { data: newCat, error: newCatError } = await supabase
          .from('categories')
          .insert({
            name: cat.name,
            image_url: cat.image_url,
            user_id: targetStoreId
          })
          .select()
          .single();
        
        if (newCatError) throw newCatError;
        categoryIdMap.set(cat.id, newCat.id);
      }

      // 4. Insert recipes with new category IDs
      if (sourceRecipes && sourceRecipes.length > 0) {
        const recipesToInsert = sourceRecipes.map(r => ({
          name: r.name,
          description: r.description,
          price: r.price,
          image_url: r.image_url,
          category_id: categoryIdMap.get(r.category_id) || r.category_id,
          is_available: r.is_available,
          is_sub_recipe: r.is_sub_recipe,
          user_id: ownerId,
          store_id: targetStoreId,
          preparation_time: r.preparation_time,
          calories: r.calories,
          allergens: r.allergens,
          tags: r.tags
        }));

        const { error: insertRecError } = await supabase
          .from('recipes')
          .insert(recipesToInsert);
        
        if (insertRecError) throw insertRecError;
      }

      return { success: true, error: null };
    } catch (error) {
      console.error('Error cloning menu:', error);
      return { success: false, error };
    }
  }
}
