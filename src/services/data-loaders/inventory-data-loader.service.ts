import { Injectable } from '@angular/core';
import { supabase } from '../supabase-client';
import { InventoryDataLoadResult } from '../../models/data-loader.models';
import { assertCriticalDataResult } from './data-loader.utils';

@Injectable({
  providedIn: 'root'
})
export class InventoryDataLoaderService {
  public async load(userId: string): Promise<InventoryDataLoadResult> {
    const [
      ingredientsRes, 
      ingredientCategoriesRes, 
      suppliersRes, 
      stationStocksRes
    ] = await Promise.all([
      supabase.from('ingredients').select('*, ingredient_categories(name), suppliers(name)').eq('user_id', userId),
      supabase.from('ingredient_categories').select('*').eq('user_id', userId),
      supabase.from('suppliers').select('*').eq('user_id', userId),
      supabase.from('station_stocks').select('*, stations(name), ingredients(name, unit)').eq('user_id', userId)
    ]);

    const ingredients = assertCriticalDataResult(ingredientsRes, 'ingredients') || [];
    const ingredientCategories = assertCriticalDataResult(ingredientCategoriesRes, 'ingredient_categories') || [];
    const suppliers = assertCriticalDataResult(suppliersRes, 'suppliers') || [];
    const stationStocks = assertCriticalDataResult(stationStocksRes, 'station_stocks') || [];

    return {
      ingredients,
      ingredientCategories,
      suppliers,
      stationStocks
    };
  }
}
