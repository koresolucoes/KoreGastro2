
import { Injectable, inject } from '@angular/core';
import { Recipe, RecipeIngredient, RecipePreparation, RecipeSubRecipe, Category } from '../models/db.models';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';
import { UnitContextService } from './unit-context.service';
import { AuditDataService } from './audit-data.service';

@Injectable({
  providedIn: 'root',
})
export class RecipeDataService {
  private authService = inject(AuthService);
  private unitContextService = inject(UnitContextService);
  private auditDataService = inject(AuditDataService);

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
         
         if (updateData.price !== undefined || customPrice !== undefined) {
             const priceMsg = customPrice !== undefined ? customPrice : updateData.price;
             await this.auditDataService.logAction('UPDATE_PRICE', `Preço da ficha técnica atualizado. Novo Valor: R$ ${priceMsg}`);
         } else {
             await this.auditDataService.logAction('UPDATE_RECIPE', `Ficha técnica editada.`);
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
      // 0. Fetch source & target stations
      const { data: sourceStations } = await supabase.from('stations').select('*').eq('user_id', sourceStoreId);
      const { data: targetStations } = await supabase.from('stations').select('*').eq('user_id', targetStoreId);
      
      const existingStationsMap = new Map(targetStations?.map(s => [s.name.trim().toLowerCase(), s.id]) || []);
      const stationIdMap = new Map<string, string>();

      if (sourceStations && sourceStations.length > 0) {
          for (const st of sourceStations) {
              const lowerName = st.name.trim().toLowerCase();
              if (existingStationsMap.has(lowerName)) {
                  stationIdMap.set(st.id, existingStationsMap.get(lowerName)!);
              } else {
                  const { data: newSt, error } = await supabase.from('stations').insert({
                      name: st.name,
                      user_id: targetStoreId
                  }).select().single();
                  if (!error && newSt) {
                      stationIdMap.set(st.id, newSt.id);
                      existingStationsMap.set(lowerName, newSt.id);
                  }
              }
          }
      }

      // 1. Fetch source & target categories
      const { data: sourceCategories } = await supabase.from('categories').select('*').eq('user_id', sourceStoreId);
      const { data: targetCategories } = await supabase.from('categories').select('*').eq('user_id', targetStoreId);
        
      const existingCategoriesMap = new Map(targetCategories?.map(c => [c.name.trim().toLowerCase(), c.id]) || []);
      const categoryIdMap = new Map<string, string>();

      if (sourceCategories && sourceCategories.length > 0) {
          for (const cat of sourceCategories) {
            const lowerName = cat.name.trim().toLowerCase();
            if (existingCategoriesMap.has(lowerName)) {
                categoryIdMap.set(cat.id, existingCategoriesMap.get(lowerName)!);
            } else {
                const { data: newCat, error } = await supabase.from('categories')
                  .insert({ name: cat.name, image_url: cat.image_url, user_id: targetStoreId })
                  .select().single();
                if (!error && newCat) {
                    categoryIdMap.set(cat.id, newCat.id);
                    existingCategoriesMap.set(lowerName, newCat.id);
                }
            }
          }
      }

      // 2. Fetch source & target recipes
      const { data: sourceRecipes } = await supabase.from('recipes').select('*').eq('store_id', sourceStoreId);
      const { data: targetRecipes } = await supabase.from('recipes').select('id, name').eq('store_id', targetStoreId);
      
      const existingRecipesMap = new Map(targetRecipes?.map(r => [r.name.trim().toLowerCase(), r.id]) || []);
      const recipeIdMap = new Map<string, string>();
      const newSourceRecipeIds = new Set<string>(); // to track which recipes are new so we clone their preps/ingredients

      if (sourceRecipes && sourceRecipes.length > 0) {
        const recipesToInsert: any[] = [];
        const sourceRecsToInsertIdx: number[] = [];

        sourceRecipes.forEach((r, index) => {
             const lowerName = r.name.trim().toLowerCase();
             if (existingRecipesMap.has(lowerName)) {
                 recipeIdMap.set(r.id, existingRecipesMap.get(lowerName)!);
             } else {
                 newSourceRecipeIds.add(r.id);
                 recipesToInsert.push({
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
                 });
                 sourceRecsToInsertIdx.push(index);
             }
        });

        if (recipesToInsert.length > 0) {
            const { data: insertedRecipes, error: insertRecError } = await supabase.from('recipes').insert(recipesToInsert).select();
            
            if (!insertRecError && insertedRecipes && insertedRecipes.length > 0) {
                insertedRecipes.forEach((newRec: any, i: number) => {
                    const originalIdx = sourceRecsToInsertIdx[i];
                    const oldId = sourceRecipes[originalIdx].id;
                    recipeIdMap.set(oldId, newRec.id);
                    existingRecipesMap.set(newRec.name.trim().toLowerCase(), newRec.id);
                });
            }
        }
      }

      // 3. Clone Preparations only for NEW recipes
      if (newSourceRecipeIds.size > 0) {
          const { data: sourcePreparations } = await supabase.from('recipe_preparations')
              .select('*').in('recipe_id', Array.from(newSourceRecipeIds));

          if (sourcePreparations && sourcePreparations.length > 0) {
               const prepsToInsert = sourcePreparations.map(p => ({
                   recipe_id: recipeIdMap.get(p.recipe_id) || p.recipe_id,
                   step_order: p.step_order,
                   description: p.description,
                   user_id: targetStoreId
               }));
               await supabase.from('recipe_preparations').insert(prepsToInsert);
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
                      station_id: ing.station_id ? (stationIdMap.get(ing.station_id) || null) : null,
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

      // 7. Fetch and insert Recipe Ingredients (Ficha Técnica) ONLY for NEW recipes OR for EXISTING recipes IF they don't have ingredients yet
      if (sourceRecipes && sourceRecipes.length > 0) {
          // Instead of assuming, fetch all to be safe? Or just fetch recipe_ingredients for sourceRecipes
          const { data: sourceRecipeIngs } = await supabase.from('recipe_ingredients').select('*').in('recipe_id', sourceRecipes.map(r => r.id));
          const { data: targetRecipeIngs } = await supabase.from('recipe_ingredients').select('recipe_id, ingredient_id').eq('user_id', targetStoreId);

          if (sourceRecipeIngs && sourceRecipeIngs.length > 0) {
              const recIngsToInsert: any[] = [];
              const targetPairs = new Set(targetRecipeIngs?.map(tri => `${tri.recipe_id}_${tri.ingredient_id}`) || []);

              sourceRecipeIngs.forEach(ri => {
                  const targetRecipeId = recipeIdMap.get(ri.recipe_id) || ri.recipe_id;
                  const targetIngredientId = ingredientIdMap.get(ri.ingredient_id) || ri.ingredient_id;
                  
                  // Skip if this specific recipe/ingredient pair already exists in the target
                  if (!targetPairs.has(`${targetRecipeId}_${targetIngredientId}`)) {
                      recIngsToInsert.push({
                          recipe_id: targetRecipeId,
                          ingredient_id: targetIngredientId,
                          quantity: ri.quantity,
                          preparation_id: ri.preparation_id,
                          user_id: targetStoreId,
                          correction_factor: ri.correction_factor
                      });
                  }
              });

              if (recIngsToInsert.length > 0) {
                  await supabase.from('recipe_ingredients').insert(recIngsToInsert);
              }
          }
      }

      return { success: true, error: null };
    } catch (error) {
      console.error('Error cloning menu:', error);
      return { success: false, error };
    }
  }

  // --- Opcionais e Combos ---

  async createLocalOptionGroup(group: Partial<any>): Promise<{ success: boolean; data?: any; error?: any }> {
    const storeId = this.getActiveUnitId();
    if (!storeId) return { success: false, error: new Error('Sem unidade ativa.') };

    try {
      const { data, error } = await supabase
        .from('ifood_option_groups')
        .insert({
          user_id: storeId,
          name: group.name,
          external_code: group.externalCode || null,
          min_required: group.minRequired || 0,
          max_options: group.maxOptions || 1,
          sequence: group.sequence || 0
        })
        .select()
        .single();
      if (error) throw error;
      return { success: true, data };
    } catch (err) {
      console.error('Error creating option group:', err);
      return { success: false, error: err };
    }
  }

  async updateLocalOptionGroup(id: string, group: Partial<any>): Promise<{ success: boolean; error?: any }> {
    const storeId = this.getActiveUnitId();
    if (!storeId) return { success: false, error: new Error('Sem unidade ativa.') };
    try {
      const { error } = await supabase
        .from('ifood_option_groups')
        .update({
          name: group.name,
          external_code: group.externalCode || null,
          min_required: group.minRequired,
          max_options: group.maxOptions,
          sequence: group.sequence
        })
        .eq('id', id)
        .eq('user_id', storeId);
      if (error) throw error;
      return { success: true };
    } catch (err) {
      return { success: false, error: err };
    }
  }
  
  async deleteLocalOptionGroup(id: string): Promise<{ success: boolean; error?: any }> {
    const storeId = this.getActiveUnitId();
    if (!storeId) return { success: false, error: new Error('Sem unidade ativa.') };
    try {
      const { error } = await supabase.from('ifood_option_groups').delete().eq('id', id).eq('user_id', storeId);
      if (error) throw error;
      return { success: true };
    } catch (err) {
      return { success: false, error: err };
    }
  }

  async createLocalOption(option: Partial<any>): Promise<{ success: boolean; error?: any }> {
    const storeId = this.getActiveUnitId();
    if (!storeId) return { success: false, error: new Error('Sem unidade ativa.') };
    try {
      const { error } = await supabase
        .from('ifood_options')
        .insert({
          user_id: storeId,
          ifood_option_group_id: option.optionGroupId,
          name: option.name,
          external_code: option.externalCode || null,
          price: option.price || 0,
          sequence: option.sequence || 0,
          ifood_product_id: option.productId || null
        });
      if (error) throw error;
      return { success: true };
    } catch (err) {
      return { success: false, error: err };
    }
  }

  async updateLocalOption(id: string, option: Partial<any>): Promise<{ success: boolean; error?: any }> {
     const storeId = this.getActiveUnitId();
     if (!storeId) return { success: false, error: new Error('Sem unidade ativa.') };
     try {
       const { error } = await supabase
         .from('ifood_options')
         .update({ 
            name: option.name, 
            external_code: option.externalCode || null, 
            price: option.price, 
            sequence: option.sequence 
         })
         .eq('id', id).eq('user_id', storeId);
       if (error) throw error;
       return { success: true };
     } catch (err) {
       return { success: false, error: err };
     }
  }

  async deleteLocalOption(id: string): Promise<{ success: boolean; error?: any }> {
     const storeId = this.getActiveUnitId();
     if (!storeId) return { success: false, error: new Error('Sem unidade ativa.') };
     try {
       const { error } = await supabase.from('ifood_options').delete().eq('id', id).eq('user_id', storeId);
       if (error) throw error;
       return { success: true };
     } catch (err) {
       return { success: false, error: err };
     }
  }

  async updateLocalOptionGroupStatus(groupId: string, status: string): Promise<any> {
    const storeId = this.getActiveUnitId();
    if (!storeId) return { success: false, error: new Error('Sem unidade ativa.') };
    try {
        const { error } = await supabase.from('ifood_option_groups').update({ ifood_id: status }).eq('id', groupId).eq('user_id', storeId);
        if(error) throw error;
        return { success: true };
    } catch (err) {
        return { success: false, error: err };
    }
  }

  async updateLocalOptionStatus(optionId: string, status: string): Promise<any> {
    const storeId = this.getActiveUnitId();
    if (!storeId) return { success: false, error: new Error('Sem unidade ativa.') };
    try {
        const { error } = await supabase.from('ifood_options').update({ ifood_option_id: status }).eq('id', optionId).eq('user_id', storeId);
        if(error) throw error;
        return { success: true };
    } catch (err) {
        return { success: false, error: err };
    }
  }

  async linkOptionGroupToRecipe(recipeId: string, groupId: string): Promise<{ success: boolean; error?: any }> {
     const storeId = this.getActiveUnitId();
     if (!storeId) return { success: false, error: new Error('Sem unidade ativa.') };
     try {
       const { error } = await supabase.from('recipe_ifood_option_groups').insert({ user_id: storeId, recipe_id: recipeId, ifood_option_group_id: groupId });
       if (error) throw error;
       return { success: true };
     } catch (err) {
       return { success: false, error: err };
     }
  }

  async unlinkOptionGroupFromRecipe(recipeId: string, groupId: string): Promise<{ success: boolean; error?: any }> {
     const storeId = this.getActiveUnitId();
     if (!storeId) return { success: false, error: new Error('Sem unidade ativa.') };
     try {
       const { error } = await supabase.from('recipe_ifood_option_groups').delete().eq('recipe_id', recipeId).eq('ifood_option_group_id', groupId).eq('user_id', storeId);
       if (error) throw error;
       return { success: true };
     } catch (err) {
       return { success: false, error: err };
     }
  }

  async getRecipeOptionGroups(recipeId: string): Promise<any[]> {
      const storeId = this.getActiveUnitId();
      if (!storeId) return [];
      const { data, error } = await supabase
        .from('recipe_ifood_option_groups')
        .select('*')
        .eq('recipe_id', recipeId)
        .eq('user_id', storeId);
      if (error) return [];
      return data || [];
  }
}
