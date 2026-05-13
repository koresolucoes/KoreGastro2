import { Injectable, inject } from '@angular/core';
import { supabase } from './supabase-client';
import { UnitContextService } from './unit-context.service';
import { MenuStateService } from './menu-state.service';
import { Menu, MenuCategory, MenuItem, MenuItemOption, MenuItemOptionChoice } from '../models/db.models';

@Injectable({ providedIn: 'root' })
export class MenuDataService {
  private unitContext = inject(UnitContextService);
  private menuState = inject(MenuStateService);

  private getActiveUnitId(): string | null {
    return this.unitContext.activeUnitId();
  }

  async loadAllMenuData(): Promise<{ success: boolean; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Nenhuma unidade/loja ativa encontrada.' } };

    try {
      const [
        { data: menus, error: err1 },
        { data: cats, error: err2 },
        { data: items, error: err3 },
        { data: options, error: err4 },
        { data: choices, error: err5 }
      ] = await Promise.all([
        supabase.from('menus').select('*').eq('user_id', userId),
        supabase.from('menu_categories').select('*').eq('user_id', userId),
        supabase.from('menu_items').select('*').eq('user_id', userId),
        supabase.from('menu_item_option_groups').select('*').eq('user_id', userId),
        supabase.from('menu_item_option_choices').select('*').eq('user_id', userId)
      ]);

      if (err1) throw err1;
      if (err2) throw err2;
      if (err3) throw err3;
      if (err4) throw err4;
      if (err5) throw err5;

      const itemRecipeIds = (items || []).map((i: any) => i.recipe_id).filter(Boolean);
      const choiceRecipeIds = (choices || []).map((c: any) => c.recipe_id).filter(Boolean);
      const allRecipeIds = Array.from(new Set([...itemRecipeIds, ...choiceRecipeIds]));

      if (allRecipeIds.length > 0) {
        const { data: recipes } = await supabase.from('recipes').select('*').in('id', allRecipeIds);
        const recipesMap = new Map((recipes || []).map(r => [r.id, r]));
        
        (items || []).forEach((i: any) => {
          if (i.recipe_id && !i.recipe) i.recipe = recipesMap.get(i.recipe_id);
        });
        (choices || []).forEach((c: any) => {
          if (c.recipe_id && !c.recipe) c.recipe = recipesMap.get(c.recipe_id);
        });
      }

      this.menuState.setMenus((menus || []) as Menu[]);
      this.menuState.setCategories((cats || []) as MenuCategory[]);
      this.menuState.setItems((items || []) as MenuItem[]);
      this.menuState.setOptions((options || []) as MenuItemOption[]);
      this.menuState.setOptionChoices((choices || []) as MenuItemOptionChoice[]);

      return { success: true, error: null };
    } catch (error) {
      console.error('[MenuDataService] Erro ao carregar dados do cardápio:', error);
      return { success: false, error };
    }
  }

  // CRUD for Menus
  async saveMenu(menu: Partial<Menu>): Promise<{ success: boolean; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: 'No active unit' };
    menu.user_id = userId;

    if (menu.id) {
      const { error } = await supabase.from('menus').update(menu).eq('id', menu.id).eq('user_id', userId);
      return { success: !error, error };
    } else {
      const { error } = await supabase.from('menus').insert(menu);
      return { success: !error, error };
    }
  }

  async deleteMenu(id: string): Promise<{ success: boolean; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: 'No active unit' };
    const { error } = await supabase.from('menus').delete().eq('id', id).eq('user_id', userId);
    return { success: !error, error };
  }

  // CRUD for Categories
  async saveCategory(category: Partial<MenuCategory>): Promise<{ success: boolean; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: 'No active unit' };

    const dbPayload: any = {
      id: category.id || undefined,
      user_id: userId, 
      menu_id: category.menu_id,
      name: category.name,
      display_order: category.display_order
    };
    Object.keys(dbPayload).forEach(key => dbPayload[key] === undefined && delete dbPayload[key]);

    let result;
    if (category.id) {
      result = await supabase.from('menu_categories').update(dbPayload).eq('id', category.id).eq('user_id', userId);
    } else {
      result = await supabase.from('menu_categories').insert(dbPayload);
    }
    if (result.error) { console.error('SUPABASE DB ERROR:', JSON.stringify(result.error)); }
    return { success: !result.error, error: result.error };
  }

  async deleteCategory(id: string): Promise<{ success: boolean; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: 'No active unit' };
    const { error } = await supabase.from('menu_categories').delete().eq('id', id).eq('user_id', userId);
    return { success: !error, error };
  }

  // BULK REORDER
  async updateOrder(table: string, items: { id: string, display_order: number }[]): Promise<{ success: boolean; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: 'No active unit' };
    
    try {
      await Promise.all(items.map(item => 
        supabase.from(table).update({ display_order: item.display_order }).eq('id', item.id).eq('user_id', userId)
      ));
      return { success: true, error: null };
    } catch (e) {
      return { success: false, error: e };
    }
  }

  // CRUD for Items
  async saveItem(item: Partial<MenuItem>): Promise<{ success: boolean; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: 'No active unit' };
    item.user_id = userId;

    const dbPayload: any = {
      id: item.id || undefined,
      user_id: item.user_id, 
      menu_category_id: item.menu_category_id,
      recipe_id: item.recipe_id,
      custom_name: item.custom_name,
      custom_description: item.custom_description,
      custom_price: item.custom_price,
      custom_image_url: item.custom_image_url,
      display_order: item.display_order,
      is_active: item.is_active
    };

    // Remove undefined properties
    Object.keys(dbPayload).forEach(key => dbPayload[key] === undefined && delete dbPayload[key]);

    let result;
    if (item.id) {
       result = await supabase.from('menu_items').update(dbPayload).eq('id', item.id).eq('user_id', userId);
    } else {
       result = await supabase.from('menu_items').insert(dbPayload);
    }
    if (result.error) { console.error('SUPABASE DB ERROR:', JSON.stringify(result.error)); }
    return { success: !result.error, error: result.error };
  }

  async deleteItem(id: string): Promise<{ success: boolean; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: 'No active unit' };
    const { error } = await supabase.from('menu_items').delete().eq('id', id).eq('user_id', userId);
    return { success: !error, error };
  }

  // CRUD for Options
  async saveOption(option: Partial<MenuItemOption>): Promise<{ success: boolean; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: 'No active unit' };

    const dbPayload: any = {
      id: option.id || undefined,
      user_id: userId, store_id: userId,
      menu_item_id: option.menu_item_id,
      name: option.name,
      min_choices: option.min_choices,
      max_choices: option.max_choices,
      display_order: option.display_order,
      

    };
    Object.keys(dbPayload).forEach(key => dbPayload[key] === undefined && delete dbPayload[key]);

    let result;
    if (option.id) {
       result = await supabase.from('menu_item_option_groups').update(dbPayload).eq('id', option.id).eq('user_id', userId);
    } else {
       result = await supabase.from('menu_item_option_groups').insert(dbPayload);
    }
    if (result.error) { console.error('SUPABASE DB ERROR:', JSON.stringify(result.error)); }
    return { success: !result.error, error: result.error };
  }

  async deleteOption(id: string): Promise<{ success: boolean; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: 'No active unit' };
    const { error } = await supabase.from('menu_item_option_groups').delete().eq('id', id).eq('user_id', userId);
    return { success: !error, error };
  }

  // CRUD for Option Choices
  async saveOptionChoice(choice: Partial<MenuItemOptionChoice>): Promise<{ success: boolean; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: 'No active unit' };

    const dbPayload: any = {
      id: choice.id || undefined,
      user_id: userId, 
      menu_item_option_id: choice.menu_item_option_id,
      recipe_id: choice.recipe_id || null,
      custom_name: choice.custom_name,
      additional_price: choice.additional_price,
      display_order: choice.display_order,
      

    };
    Object.keys(dbPayload).forEach(key => dbPayload[key] === undefined && delete dbPayload[key]);

    let result;
    if (choice.id) {
       result = await supabase.from('menu_item_option_choices').update(dbPayload).eq('id', choice.id).eq('user_id', userId);
    } else {
       result = await supabase.from('menu_item_option_choices').insert(dbPayload);
    }
    if (result.error) { console.error('SUPABASE DB ERROR:', JSON.stringify(result.error)); }
    return { success: !result.error, error: result.error };
  }

  async deleteOptionChoice(id: string): Promise<{ success: boolean; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: 'No active unit' };
    const { error } = await supabase.from('menu_item_option_choices').delete().eq('id', id).eq('user_id', userId);
    return { success: !error, error };
  }

  // Upload
  async uploadImage(file: File): Promise<{ success: boolean; url?: string; error?: any }> {
    const fileExt = file.name.split('.').pop();
    const fileName = `menu-items/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('restaurant_assets')
      .upload(fileName, file);

    if (uploadError) return { success: false, error: uploadError };

    const { data } = supabase.storage.from('restaurant_assets').getPublicUrl(fileName);
    return { success: true, url: data.publicUrl };
  }
}

