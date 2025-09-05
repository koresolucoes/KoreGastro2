
import { Injectable } from '@angular/core';
import { supabase } from './supabase-client';
import { Recipe, Category, Promotion, PromotionRecipe } from '../models/db.models';

@Injectable({
  providedIn: 'root',
})
export class PublicDataService {
  async getPublicRecipes(userId: string): Promise<Recipe[]> {
    const { data, error } = await supabase
      .from('recipes')
      .select('*')
      .eq('user_id', userId)
      .eq('is_available', true)
      .eq('is_sub_recipe', false);
    if (error) {
      console.error('Error fetching public recipes:', error);
      return [];
    }
    return data || [];
  }

  async getPublicCategories(userId: string): Promise<Category[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId);
    if (error) {
      console.error('Error fetching public categories:', error);
      return [];
    }
    return data || [];
  }

  async getPublicPromotions(userId: string): Promise<Promotion[]> {
    const { data, error } = await supabase
      .from('promotions')
      .select('*')
      .eq('user_id', userId);
    if (error) {
      console.error('Error fetching public promotions:', error);
      return [];
    }
    return data || [];
  }

  async getPublicPromotionRecipes(userId: string): Promise<PromotionRecipe[]> {
    const { data, error } = await supabase
      .from('promotion_recipes')
      .select('*')
      .eq('user_id', userId);
    if (error) {
      console.error('Error fetching public promotion recipes:', error);
      return [];
    }
    return data || [];
  }
}
