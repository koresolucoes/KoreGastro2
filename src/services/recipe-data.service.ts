
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

      // 2.5 Fetch target categories to avoid duplicating names
      const { data: targetCategories } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', targetStoreId);
        
      const existingCategoriesMap = new Map(targetCategories?.map(c => [c.name.trim().toLowerCase(), c.id]) || []);

      // 3. Map old category IDs to new ones
      const categoryIdMap = new Map<string, string>();

      for (const cat of sourceCategories) {
        const lowerName = cat.name.trim().toLowerCase();
        
        if (existingCategoriesMap.has(lowerName)) {
            categoryIdMap.set(cat.id, existingCategoriesMap.get(lowerName)!);
        } else {
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
            existingCategoriesMap.set(lowerName, newCat.id);
        }
      }

      // 4. Insert recipes with new category IDs
      let recipeIdMap = new Map<string, string>();
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
          prep_time_in_minutes: r.prep_time_in_minutes,
          operational_cost: r.operational_cost,
          external_code: r.external_code,
          ncm_code: r.ncm_code,
          shelf_life_prepared_days: r.shelf_life_prepared_days,
          storage_conditions: r.storage_conditions,
          par_level: r.par_level
        }));

        const { data: insertedRecipes, error: insertRecError } = await supabase
          .from('recipes')
          .insert(recipesToInsert)
          .select();
        
        if (insertRecError) throw insertRecError;

        if (insertedRecipes && insertedRecipes.length > 0) {
            sourceRecipes.forEach((oldR, index) => {
                recipeIdMap.set(oldR.id, insertedRecipes[index].id);
            });

            // Clone Preparations (Instructions)
            const { data: sourcePreparations } = await supabase
                .from('recipe_preparations')
                .select('*')
                .in('recipe_id', sourceRecipes.map(r => r.id));

            if (sourcePreparations && sourcePreparations.length > 0) {
                 const prepsToInsert = sourcePreparations.map(p => ({
                     recipe_id: recipeIdMap.get(p.recipe_id) || p.recipe_id,
                     step_order: p.step_order,
                     description: p.description,
                     user_id: targetStoreId // use active context as user_id for this table
                 }));
                 await supabase.from('recipe_preparations').insert(prepsToInsert);
            }
        }
      }

      // --- INGREDIENT CLONING ---
      
      // 5. Fetch source & target ingredient categories
      const { data: sourceIngCategories } = await supabase.from('ingredient_categories').select('*').eq('user_id', sourceStoreId);
      const { data: targetIngCategories } = await supabase.from('ingredient_categories').select('*').eq('user_id', targetStoreId);
      
      const existingIngCatMap = new Map(targetIngCategories?.map(c => [c.name.trim().toLowerCase(), c.id]) || []);
      const ingCategoryIdMap = new Map<string, string>();

      if (sourceIngCategories && sourceIngCategories.length > 0) {
          for (const cat of sourceIngCategories) {
              const lowerName = cat.name.trim().toLowerCase();
              if (existingIngCatMap.has(lowerName)) {
                  ingCategoryIdMap.set(cat.id, existingIngCatMap.get(lowerName)!);
              } else {
                  const { data: newCat, error } = await supabase.from('ingredient_categories').insert({
                      name: cat.name,
                      user_id: targetStoreId
                  }).select().single();
                  if (!error && newCat) {
                      ingCategoryIdMap.set(cat.id, newCat.id);
                      existingIngCatMap.set(lowerName, newCat.id);
                  }
              }
          }
      }

      // 6. Fetch source & target ingredients
      const { data: sourceIngredients } = await supabase.from('ingredients').select('*').eq('user_id', sourceStoreId);
      const { data: targetIngredients } = await supabase.from('ingredients').select('*').eq('user_id', targetStoreId);
      
      const existingIngMap = new Map(targetIngredients?.map(i => [i.name.trim().toLowerCase(), i.id]) || []);
      const ingredientIdMap = new Map<string, string>(); // old ingredient id -> new ingredient id

      if (sourceIngredients && sourceIngredients.length > 0) {
          const ingredientsToInsert: any[] = [];
          const sourceIngsToInsertIdx: number[] = [];

          sourceIngredients.forEach((ing, index) => {
              const lowerName = ing.name.trim().toLowerCase();
              if (existingIngMap.has(lowerName)) {
                  ingredientIdMap.set(ing.id, existingIngMap.get(lowerName)!);
              } else {
                  ingredientsToInsert.push({
                      name: ing.name,
                      unit: ing.unit,
                      stock: 0, // Reset stock for the new store
                      cost: ing.cost,
                      min_stock: 0, 
                      category_id: ing.category_id ? (ingCategoryIdMap.get(ing.category_id) || null) : null,
                      supplier_id: null, // Suppliers are isolated, reset
                      is_sellable: ing.is_sellable,
                      price: ing.price,
                      pos_category_id: null,
                      station_id: null, // Reset station assignment
                      external_code: ing.external_code,
                      is_portionable: ing.is_portionable,
                      is_yield_product: ing.is_yield_product,
                      standard_portion_weight_g: ing.standard_portion_weight_g,
                      shelf_life_after_open_days: ing.shelf_life_after_open_days,
                      proxy_recipe_id: ing.proxy_recipe_id ? (recipeIdMap.get(ing.proxy_recipe_id) || null) : null,
                      user_id: targetStoreId
                  });
                  sourceIngsToInsertIdx.push(index);
              }
          });

          if (ingredientsToInsert.length > 0) {
              const { data: insertedIngs, error } = await supabase.from('ingredients').insert(ingredientsToInsert).select();
              if (!error && insertedIngs) {
                  insertedIngs.forEach((newIng, i) => {
                      const originalIdx = sourceIngsToInsertIdx[i];
                      const oldId = sourceIngredients[originalIdx].id;
                      ingredientIdMap.set(oldId, newIng.id);
                      existingIngMap.set(newIng.name.trim().toLowerCase(), newIng.id);
                  });
              }
          }
      }

      // 7. Fetch and insert Recipe Ingredients (Ficha Técnica)
      if (sourceRecipes && sourceRecipes.length > 0) {
          const { data: sourceRecipeIngs } = await supabase
              .from('recipe_ingredients')
              .select('*')
              .in('recipe_id', sourceRecipes.map(r => r.id));

          if (sourceRecipeIngs && sourceRecipeIngs.length > 0) {
              const recIngsToInsert = sourceRecipeIngs.map(ri => ({
                  recipe_id: recipeIdMap.get(ri.recipe_id) || ri.recipe_id,
                  ingredient_id: ingredientIdMap.get(ri.ingredient_id) || ri.ingredient_id, // Map to new ingredient
                  quantity: ri.quantity,
                  preparation_id: ri.preparation_id,
                  user_id: targetStoreId, // Some tables use user_id to isolate
                  correction_factor: ri.correction_factor
              }));

              // Ignore failures on individual recipe ingredients if some mapping failed, just try to insert
              await supabase.from('recipe_ingredients').insert(recIngsToInsert);
          }
      }

      return { success: true, error: null };
    } catch (error) {
      console.error('Error cloning menu:', error);
      return { success: false, error };
    }
  }
}
