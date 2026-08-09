import { Injectable } from '@angular/core';
import { supabase } from '../supabase-client';
import { CatalogDataLoadResult } from '../../models/data-loader.models';
import { assertCriticalDataResult, extractOptionalDataResult } from './data-loader.utils';
import { StoreId } from '../../types';

@Injectable({
  providedIn: 'root'
})
export class CatalogDataLoaderService {
  public async load(storeId: StoreId): Promise<CatalogDataLoadResult> {
    const [
      categoriesRes, 
      recipesRes, 
      promotionsRes, 
      promotionRecipesRes, 
      recipeIngredientsRes, 
      recipePreparationsRes, 
      recipeSubRecipesRes, 
      storeCustomPricesRes
    ] = await Promise.all([
      supabase.from('categories').select('*').eq('user_id', storeId),
      supabase.from('recipes').select('*').eq('store_id', storeId),
      supabase.from('promotions').select('*').eq('user_id', storeId),
      supabase.from('promotion_recipes').select('*, recipes(name)').eq('user_id', storeId),
      supabase.from('recipe_ingredients').select('*, ingredients(name, unit, cost)').eq('user_id', storeId),
      supabase.from('recipe_preparations').select('*').eq('user_id', storeId),
      supabase.from('recipe_sub_recipes').select('*, recipes:recipes!child_recipe_id(name, id)').eq('user_id', storeId),
      supabase.from('store_custom_prices').select('*').eq('store_id', storeId)
    ]);

    const categories = assertCriticalDataResult(categoriesRes, 'categories') || [];
    const recipes = assertCriticalDataResult(recipesRes, 'recipes') || [];
    const recipeIngredients = assertCriticalDataResult(recipeIngredientsRes, 'recipe_ingredients') || [];
    const recipePreparations = assertCriticalDataResult(recipePreparationsRes, 'recipe_preparations') || [];
    const recipeSubRecipes = assertCriticalDataResult(recipeSubRecipesRes, 'recipe_sub_recipes') || [];
    const storeCustomPrices = assertCriticalDataResult(storeCustomPricesRes, 'store_custom_prices') || [];
    
    const promotions = extractOptionalDataResult(promotionsRes, 'promotions', []);
    const promotionRecipes = extractOptionalDataResult(promotionRecipesRes, 'promotion_recipes', []);

    return {
      categories,
      recipes,
      promotions,
      promotionRecipes,
      recipeIngredients,
      recipePreparations,
      recipeSubRecipes,
      storeCustomPrices
    };
  }
}
