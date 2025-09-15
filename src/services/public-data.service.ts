import { Injectable } from '@angular/core';
import { supabase } from './supabase-client';
import { Recipe, Category, Promotion, PromotionRecipe, LoyaltySettings, LoyaltyReward, CompanyProfile, ReservationSettings } from '../models/db.models';

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

  async getPublicLoyaltySettings(userId: string): Promise<LoyaltySettings | null> {
    const { data, error } = await supabase
      .from('loyalty_settings')
      .select('*')
      .eq('user_id', userId)
      .eq('is_enabled', true)
      .single();
    if (error && error.code !== 'PGRST116') { // Ignore "no rows found" error
      console.error('Error fetching public loyalty settings:', error);
      return null;
    }
    return data;
  }

  async getPublicLoyaltyRewards(userId: string): Promise<LoyaltyReward[]> {
    const { data, error } = await supabase
      .from('loyalty_rewards')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('points_cost', { ascending: true });
    if (error) {
      console.error('Error fetching public loyalty rewards:', error);
      return [];
    }
    return data || [];
  }
  
  async getPublicCompanyProfile(userId: string): Promise<Partial<CompanyProfile> | null> {
    const { data, error } = await supabase
      .from('company_profile')
      .select('company_name, logo_url, address, phone')
      .eq('user_id', userId)
      .single();
    if (error) {
      console.error('Error fetching public company profile:', error);
      return null;
    }
    return data;
  }

  async getPublicReservationSettings(userId: string): Promise<ReservationSettings | null> {
    const { data, error } = await supabase
      .from('reservation_settings')
      .select('*')
      .eq('user_id', userId)
      .eq('is_enabled', true)
      .single(); // Use single() as there should be only one
    if (error && error.code !== 'PGRST116') { // Ignore "no rows found" error
      console.error('Error fetching public reservation settings:', error);
      return null;
    }
    return data;
  }
}