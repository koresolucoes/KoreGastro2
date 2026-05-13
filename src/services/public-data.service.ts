import { Injectable } from '@angular/core';
import { supabase } from './supabase-client';
import { Recipe, Category, Promotion, PromotionRecipe, LoyaltySettings, LoyaltyReward, CompanyProfile, ReservationSettings, Station, IfoodOptionGroup, RecipeIfoodOptionGroup } from '../models/db.models';

@Injectable({
  providedIn: 'root',
})
export class PublicDataService {
  async getPublicVirtualMenu(userId: string): Promise<{ recipes: (Recipe & { menu_item_id?: string })[], categories: Category[], optionGroups: IfoodOptionGroup[], recipeOptionGroups: RecipeIfoodOptionGroup[] } | null> {
    // 1. Fetch all raw base data
    const [
      { data: recipesData },
      { data: categoriesData },
      { data: ifoodOptionGroups },
      { data: recipeIfoodOptionGroups },
      { data: menus },
      { data: menuCategories },
      { data: menuItems },
      { data: menuOptions },
      { data: menuChoices }
    ] = await Promise.all([
      supabase.from('recipes').select('*').eq('user_id', userId).eq('is_available', true).eq('is_sub_recipe', false),
      supabase.from('categories').select('*').eq('user_id', userId),
      supabase.from('ifood_option_groups').select('*, ifood_options(*)').eq('user_id', userId),
      supabase.from('recipe_ifood_option_groups').select('*').eq('user_id', userId),
      supabase.from('menus').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('menu_categories').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('menu_items').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('menu_item_options').select('*').eq('user_id', userId),
      supabase.from('menu_item_option_choices').select('*').eq('user_id', userId)
    ]);

    const baseRecipes = recipesData || [];
    let baseCategories = categoriesData || [];
    let baseOptionGroups = ifoodOptionGroups || [];
    let baseRecipeOptionGroups = recipeIfoodOptionGroups || [];

    // Filter "delivery" menus
    const onlineMenus = (menus || []).filter(m => {
        if (!m.type) return false;
        return m.type.split(',').map((t: string) => t.trim()).includes('online');
    });

    if (onlineMenus.length === 0) {
        return { recipes: baseRecipes, categories: baseCategories, optionGroups: baseOptionGroups, recipeOptionGroups: baseRecipeOptionGroups };
    }

    const validMenuIds = new Set(onlineMenus.map(m => m.id));
    const activeMenuCategories = (menuCategories || []).filter(c => validMenuIds.has(c.menu_id));
    const validCatIds = new Set(activeMenuCategories.map(c => c.id));
    
    // Virtual Categories
    const virtualCategories = activeMenuCategories.sort((a,b) => (a.display_order ?? 0) - (b.display_order ?? 0)).map(cat => ({
        id: cat.id,
        user_id: cat.user_id,
        name: cat.name,
        description: cat.description || '',
        created_at: new Date().toISOString()
    } as unknown as Category));

    const activeMenuItems = (menuItems || []).filter(i => validCatIds.has(i.menu_category_id)).sort((a,b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    const recipesMap = new Map((baseRecipes).map(r => [r.id, r]));

    // Virtual Recipes
    const virtualRecipes = activeMenuItems.map(item => {
        const baseRecipe = recipesMap.get(item.recipe_id);
        if (!baseRecipe) return null;
        
        return {
            ...baseRecipe,
            id: baseRecipe.id,
            menu_item_id: item.id,
            category_id: item.menu_category_id,
            name: (item.custom_name && item.custom_name.trim() !== '') ? item.custom_name : baseRecipe.name,
            description: item.custom_description ?? baseRecipe.description,
            price: item.custom_price !== null && item.custom_price !== undefined ? Number(item.custom_price) : baseRecipe.price,
            image_url: item.custom_image_url ?? baseRecipe.image_url
        } as Recipe & { menu_item_id?: string };
    }).filter(r => r !== null) as (Recipe & { menu_item_id?: string })[];

    // Virtual Options
    const virtualOptionGroups: IfoodOptionGroup[] = [];
    for (const virtualR of virtualRecipes) {
        if (!virtualR.menu_item_id) continue;
        const opts = (menuOptions || []).filter(o => o.menu_item_id === virtualR.menu_item_id);
        
        for (const opt of opts) {
            const choices = (menuChoices || []).filter(c => c.menu_item_option_id === opt.id);
            const virtualChoices = choices.map(choice => {
                const linkedRecipe = choice.recipe_id ? recipesMap.get(choice.recipe_id) : null;
                return {
                    id: choice.id,
                    user_id: opt.user_id,
                    ifood_option_group_id: opt.id,
                    name: choice.custom_name || linkedRecipe?.name || 'Complemento',
                    external_code: choice.id,
                    price: choice.additional_price,
                    status: (linkedRecipe && linkedRecipe.is_available === false) ? 'UNAVAILABLE' as const : 'AVAILABLE' as const,
                    sequence: choice.display_order,
                    ifood_product_id: linkedRecipe ? linkedRecipe.id : null,
                    hasStock: true // public menu doesn't strict check stock here yet
                };
            }).sort((a,b) => a.sequence - b.sequence);

            virtualOptionGroups.push({
                id: opt.id,
                user_id: virtualR.user_id,
                name: opt.name,
                external_code: opt.id,
                min_required: opt.min_choices || 0,
                max_options: opt.max_choices || 1,
                sequence: opt.display_order,
                status: 'AVAILABLE',
                ifood_options: virtualChoices
            } as unknown as IfoodOptionGroup);
            
            // Add relations so customizer can find it
            baseRecipeOptionGroups.push({
                recipe_id: virtualR.id,
                ifood_option_group_id: opt.id,
                user_id: opt.user_id
            });
        }
    }

    return {
        recipes: virtualRecipes,
        categories: virtualCategories,
        optionGroups: [...baseOptionGroups, ...virtualOptionGroups],
        recipeOptionGroups: baseRecipeOptionGroups
    };
  }

  async getPublicStations(userId: string): Promise<Station[]> {
    const { data, error } = await supabase
      .from('stations')
      .select('*')
      .eq('user_id', userId);
    if (error) {
      console.error('Error fetching public stations:', error);
      return [];
    }
    return data || [];
  }

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
      .select('*') // Select all to bypass potential column-specific RLS issues
      .eq('user_id', userId)
      .single();
      
    if (error) {
      // Don't log "not found" as a critical error, it's a valid case.
      if (error.code !== 'PGRST116') {
        console.error('Error fetching public company profile:', error);
      }
      return null;
    }
    
    if (data) {
      // IMPORTANT: Explicitly remove sensitive fields before returning to the client.
      // This prevents exposing API keys or other private data.
      delete (data as any).external_api_key;
      delete (data as any).ifood_merchant_id;
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

  async getPublicOptionGroups(userId: string): Promise<IfoodOptionGroup[]> {
    const { data, error } = await supabase
      .from('ifood_option_groups')
      .select('*, ifood_options(*)')
      .eq('user_id', userId)
      .order('sequence', { ascending: true });
    if (error) {
      if (error.code !== 'PGRST205') {
        console.error('Error fetching public option groups:', error);
      }
      return [];
    }
    return data || [];
  }

  async getPublicRecipeOptionGroups(userId: string): Promise<RecipeIfoodOptionGroup[]> {
    const { data, error } = await supabase
      .from('recipe_ifood_option_groups')
      .select('*')
      .eq('user_id', userId);
    if (error) {
      if (error.code !== 'PGRST205') {
        console.error('Error fetching public recipe option groups:', error);
      }
      return [];
    }
    return data || [];
  }
}
