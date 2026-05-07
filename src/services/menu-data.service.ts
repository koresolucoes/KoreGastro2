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
    category.user_id = userId;

    let result;
    if (category.id) {
      result = await supabase.from('menu_categories').update(category).eq('id', category.id).eq('user_id', userId);
    } else {
      result = await supabase.from('menu_categories').insert(category);
    }
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

    let result;
    if (item.id) {
       result = await supabase.from('menu_items').update(item).eq('id', item.id).eq('user_id', userId);
    } else {
       result = await supabase.from('menu_items').insert(item);
    }
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
    option.user_id = userId;

    let result;
    if (option.id) {
       result = await supabase.from('menu_item_option_groups').update(option).eq('id', option.id).eq('user_id', userId);
    } else {
       result = await supabase.from('menu_item_option_groups').insert(option);
    }
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
    choice.user_id = userId;

    let result;
    if (choice.id) {
       result = await supabase.from('menu_item_option_choices').update(choice).eq('id', choice.id).eq('user_id', userId);
    } else {
       result = await supabase.from('menu_item_option_choices').insert(choice);
    }
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
      .from('images')
      .upload(fileName, file);

    if (uploadError) return { success: false, error: uploadError };

    const { data } = supabase.storage.from('images').getPublicUrl(fileName);
    return { success: true, url: data.publicUrl };
  }
}

