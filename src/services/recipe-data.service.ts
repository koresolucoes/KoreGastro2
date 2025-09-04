import { Injectable, inject } from '@angular/core';
import { Recipe, RecipeIngredient, Category, RecipePreparation, RecipeSubRecipe } from '../models/db.models';
import { AuthService } from './auth.service';
import { SupabaseStateService } from './supabase-state.service';
import { supabase } from './supabase-client';
import { v4 as uuidv4 } from 'uuid';
import { NotificationService } from './notification.service';

@Injectable({
  providedIn: 'root',
})
export class RecipeDataService {
  private authService = inject(AuthService);
  private stateService = inject(SupabaseStateService);
  private notificationService = inject(NotificationService);

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
    preparations: (Partial<RecipePreparation> & { id: string })[],
    ingredients: Omit<RecipeIngredient, 'user_id' | 'recipe_id'>[],
    subRecipes: Omit<RecipeSubRecipe, 'user_id' | 'parent_recipe_id'>[]
  ): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };

    // --- VALIDATION STEP ---
    for (const prep of preparations) {
      if (!prep.station_id) {
        const errorMessage = `A etapa de preparo "${prep.name || 'Nova Etapa'}" não tem uma estação de produção definida. Por favor, selecione uma estação.`;
        await this.notificationService.alert(errorMessage, 'Dados Incompletos');
        return { success: false, error: { message: errorMessage } };
      }
    }

    try {
      // 1. Update recipe details
      if (Object.keys(recipeUpdates).length > 0) {
        const { error: recipeUpdateError } = await supabase.from('recipes').update(recipeUpdates).eq('id', recipeId);
        if (recipeUpdateError) throw recipeUpdateError;
      }

      // 2. Clear all existing associations in parallel for performance
      const [prepDelete, ingDelete, subDelete] = await Promise.all([
          supabase.from('recipe_preparations').delete().eq('recipe_id', recipeId),
          supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId),
          supabase.from('recipe_sub_recipes').delete().eq('parent_recipe_id', recipeId)
      ]);
      if (prepDelete.error) throw prepDelete.error;
      if (ingDelete.error) throw ingDelete.error;
      if (subDelete.error) throw subDelete.error;
      
      const tempIdToDbIdMap = new Map<string, string>();

      // 3. Insert new preparations and map temporary IDs
      if (preparations.length > 0) {
        const prepsToInsert = preparations.map(({ id, ...rest }) => {
            const newId = id.startsWith('temp-') ? uuidv4() : id;
            if (id.startsWith('temp-')) {
                tempIdToDbIdMap.set(id, newId);
            }
            return {
                id: newId,
                recipe_id: recipeId,
                station_id: rest.station_id!, // Not null due to validation above
                name: rest.name!,
                prep_instructions: rest.prep_instructions,
                display_order: rest.display_order!,
                user_id: userId,
                created_at: rest.created_at || new Date().toISOString()
            };
        });
      
        const { error: prepInsertError } = await supabase.from('recipe_preparations').insert(prepsToInsert);
        if (prepInsertError) throw prepInsertError;
      }

      // 4. Insert new ingredients with correct preparation IDs
      if (ingredients.length > 0) {
          const ingredientsToInsert = ingredients.map(i => {
            const dbPrepId = tempIdToDbIdMap.get(i.preparation_id) || i.preparation_id;
            return {
              recipe_id: recipeId,
              ingredient_id: i.ingredient_id,
              quantity: i.quantity,
              preparation_id: dbPrepId,
              user_id: userId,
            };
          });

        const { error: ingredientsError } = await supabase.from('recipe_ingredients').insert(ingredientsToInsert);
        if (ingredientsError) throw ingredientsError;
      }

      // 5. Insert new sub-recipes
      if (subRecipes.length > 0) {
          const subRecipesToInsert = subRecipes.map(sr => ({
            parent_recipe_id: recipeId,
            child_recipe_id: sr.child_recipe_id,
            quantity: sr.quantity,
            user_id: userId,
          }));
      
        const { error: subRecipesError } = await supabase.from('recipe_sub_recipes').insert(subRecipesToInsert);
        if (subRecipesError) throw subRecipesError;
      }
      
      return { success: true, error: null };
    } catch (error: any) {
      console.error('Error saving technical sheet:', error);
      let userMessage = 'Ocorreu um erro desconhecido ao salvar a ficha técnica.';
      if (error.message.includes('foreign key constraint')) {
          userMessage = 'Erro de referência. Verifique se todos os ingredientes, estações e sub-receitas selecionados ainda existem.';
      } else if (error.message.includes('null value in column')) {
          userMessage = `Erro de dados. Um campo obrigatório está faltando. Detalhe: ${error.message}`;
      }
      await this.notificationService.alert(userMessage, 'Falha ao Salvar');
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