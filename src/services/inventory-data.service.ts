
import { Injectable, inject } from '@angular/core';
import { Ingredient, IngredientCategory, RecipeIngredient, RecipePreparation, Supplier } from '../models/db.models';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';
import { SupabaseStateService } from './supabase-state.service';
import { RecipeDataService } from './recipe-data.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable({
  providedIn: 'root',
})
export class InventoryDataService {
  private authService = inject(AuthService);
  private stateService = inject(SupabaseStateService);
  private recipeDataService = inject(RecipeDataService);

  async addIngredient(ingredient: Partial<Ingredient>): Promise<{ success: boolean, error: any, data?: Ingredient }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    
    // Insert the ingredient first
    const { data: newIngredient, error: ingredientError } = await supabase
      .from('ingredients')
      .insert({ ...ingredient, user_id: userId })
      .select()
      .single();

    if (ingredientError) return { success: false, error: ingredientError, data: undefined };

    // If it's sellable, create the proxy recipe
    if (newIngredient.is_sellable) {
      const { success, error } = await this.createOrUpdateProxyRecipe(newIngredient);
      if (!success) {
        // Rollback ingredient creation if proxy recipe fails
        await supabase.from('ingredients').delete().eq('id', newIngredient.id);
        return { success: false, error, data: undefined };
      }
    }

    return { success: true, error: null, data: newIngredient };
  }
  
  async updateIngredient(ingredient: Partial<Ingredient>): Promise<{ success: boolean; error: any }> {
    const { data: currentIngredient, error: fetchError } = await supabase.from('ingredients').select('*').eq('id', ingredient.id!).single();
    if (fetchError) return { success: false, error: fetchError };

    const wasSellable = currentIngredient.is_sellable;
    const isNowSellable = ingredient.is_sellable;

    if (wasSellable !== isNowSellable) {
      if (isNowSellable) { // Becoming sellable
        const { success, error, proxyRecipeId } = await this.createOrUpdateProxyRecipe(ingredient as Ingredient);
        if (!success) return { success, error };
        ingredient.proxy_recipe_id = proxyRecipeId;
      } else { // Becoming non-sellable
        if (currentIngredient.proxy_recipe_id) {
          await this.recipeDataService.deleteRecipe(currentIngredient.proxy_recipe_id);
        }
        ingredient.proxy_recipe_id = null;
      }
    } else if (isNowSellable && currentIngredient.proxy_recipe_id) {
      // If it's already sellable, just sync name and price
      if (ingredient.name !== currentIngredient.name || ingredient.price !== currentIngredient.price) {
        await supabase.from('recipes').update({ name: ingredient.name, price: ingredient.price }).eq('id', currentIngredient.proxy_recipe_id);
      }
    }
    
    const { id, ...updateData } = ingredient;
    const { error } = await supabase.from('ingredients').update(updateData).eq('id', id!);
    return { success: !error, error };
  }

  private async createOrUpdateProxyRecipe(ingredient: Ingredient): Promise<{ success: boolean, error: any, proxyRecipeId?: string }> {
     if (!ingredient.price || ingredient.price <= 0) {
        return { success: false, error: { message: 'Preço de venda deve ser definido para um item vendável.' } };
      }
      if (!ingredient.pos_category_id) {
         return { success: false, error: { message: 'Uma "Categoria no PDV" deve ser selecionada.' } };
      }
      if (!ingredient.station_id) {
          return { success: false, error: { message: 'Uma "Estação KDS" deve ser selecionada.' } };
      }

      const { data: recipe, error: recipeError } = await this.recipeDataService.addRecipe({
          name: ingredient.name,
          price: ingredient.price,
          is_available: true,
          source_ingredient_id: ingredient.id,
          category_id: ingredient.pos_category_id,
          is_sub_recipe: false,
          prep_time_in_minutes: 0,
      });

      if (recipeError) return { success: false, error: recipeError };

      const userId = this.authService.currentUser()?.id!;
      const prep: RecipePreparation = {
          id: uuidv4(),
          recipe_id: recipe!.id,
          station_id: ingredient.station_id,
          name: 'Entrega',
          display_order: 0,
          created_at: new Date().toISOString(),
          user_id: userId,
      };
      
      const recipeIngredient: RecipeIngredient = {
          recipe_id: recipe!.id,
          ingredient_id: ingredient.id!,
          quantity: 1,
          preparation_id: prep.id,
          user_id: userId,
      };
      
      await this.recipeDataService.saveTechnicalSheet(recipe!.id, {}, [prep], [recipeIngredient], []);

      // Update ingredient with proxy recipe ID
      const { error: updateError } = await supabase.from('ingredients').update({ proxy_recipe_id: recipe!.id }).eq('id', ingredient.id!);
      if (updateError) return { success: false, error: updateError };
      
      return { success: true, error: null, proxyRecipeId: recipe!.id };
  }

  async deleteIngredient(id: string): Promise<{ success: boolean, error: any }> {
    const { data: ingredient, error: fetchError } = await supabase.from('ingredients').select('proxy_recipe_id').eq('id', id).single();
    if(fetchError) return { success: false, error: fetchError };

    // If it's linked to a proxy recipe, delete that first
    if(ingredient?.proxy_recipe_id) {
        await this.recipeDataService.deleteRecipe(ingredient.proxy_recipe_id);
    }
    
    const { error } = await supabase.from('ingredients').delete().eq('id', id);
    return { success: !error, error };
  }
  
  async adjustIngredientStock(ingredientId: string, quantityChange: number, reason: string, expirationDate: string | null | undefined): Promise<{ success: boolean, error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase.rpc('adjust_stock', { 
        p_ingredient_id: ingredientId, 
        p_quantity_change: quantityChange, 
        p_reason: reason, 
        p_user_id: userId, 
        p_expiration_date: expirationDate 
    });
    return { success: !error, error };
  }

  async addIngredientCategory(name: string): Promise<{ success: boolean, error: any, data?: IngredientCategory }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { data, error } = await supabase.from('ingredient_categories').insert({ name, user_id: userId }).select().single();
    return { success: !error, error, data };
  }

  async updateIngredientCategory(id: string, name: string): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('ingredient_categories').update({ name }).eq('id', id);
    return { success: !error, error };
  }

  async deleteIngredientCategory(id: string): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('ingredient_categories').delete().eq('id', id);
    return { success: !error, error };
  }

  async addSupplier(supplier: Partial<Supplier>): Promise<{ success: boolean, error: any, data?: Supplier }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { data, error } = await supabase.from('suppliers').insert({ ...supplier, user_id: userId }).select().single();
    return { success: !error, error, data };
  }

  async updateSupplier(supplier: Partial<Supplier>): Promise<{ success: boolean, error: any }> {
    const { id, ...updateData } = supplier;
    const { error } = await supabase.from('suppliers').update(updateData).eq('id', id!);
    return { success: !error, error };
  }

  async deleteSupplier(id: string): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    return { success: !error, error };
  }

  async calculateIngredientUsageForPeriod(startDate: Date, endDate: Date): Promise<Map<string, number>> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return new Map();

    const { data: orders, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('user_id', userId)
      .eq('is_completed', true)
      .gte('completed_at', startDate.toISOString())
      .lte('completed_at', endDate.toISOString());

    if (error) {
      console.error("Error fetching orders for usage calculation", error);
      return new Map();
    }

    const totalUsage = new Map<string, number>();
    const recipeCostMap = this.stateService.recipeCosts();

    const getRawIngredientsForRecipe = (recipeId: string, quantity: number) => {
      const recipeComposition = recipeCostMap.get(recipeId);
      if (!recipeComposition) return;

      for (const [ingredientId, amount] of recipeComposition.rawIngredients.entries()) {
        const totalAmount = amount * quantity;
        totalUsage.set(ingredientId, (totalUsage.get(ingredientId) || 0) + totalAmount);
      }
    };
    
    for (const order of orders) {
      for (const item of order.order_items) {
        getRawIngredientsForRecipe(item.recipe_id, item.quantity);
      }
    }
    
    return totalUsage;
  }
}
