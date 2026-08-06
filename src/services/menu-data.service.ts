import { Injectable, inject } from '@angular/core';
import { supabase } from './supabase-client';
import { UnitContextService } from './unit-context.service';
import { MenuStateService } from './menu-state.service';
import { AuditDataService } from './audit-data.service';
import { Menu, MenuCategory, MenuItem, MenuItemOption, MenuItemOptionChoice } from '../models/db.models';

@Injectable({
  providedIn: 'root'
})
export class MenuDataService {
  private unitContext = inject(UnitContextService);
  private menuState = inject(MenuStateService);
  private auditService = inject(AuditDataService);

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

    const dbPayload: any = {
      id: menu.id || undefined,
      user_id: userId,
      name: menu.name,
      description: menu.description,
      is_active: menu.is_active !== undefined ? menu.is_active : true,
      type: menu.type || 'pdv',
      channels: menu.channels,
      start_time: menu.start_time,
      end_time: menu.end_time,
      days_of_week: menu.days_of_week,
      availability_hours: menu.availability_hours
    };
    Object.keys(dbPayload).forEach(key => dbPayload[key] === undefined && delete dbPayload[key]);

    const { data, error } = await supabase
      .from('menus')
      .upsert(dbPayload, { onConflict: 'id' })
      .select('id')
      .single();

    if (error) {
      console.error('SUPABASE DB ERROR (saveMenu):', JSON.stringify(error));
      return { success: false, error };
    }
    return { success: true, error: null };
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

    const { data, error } = await supabase
      .from('menu_categories')
      .upsert(dbPayload, { onConflict: 'id' })
      .select('id')
      .single();

    if (error) {
      console.error('SUPABASE DB ERROR (saveCategory):', JSON.stringify(error));
    } else {
      this.auditService.logAction('MENU_CATEGORY_SAVED', `Categoria de cardápio ${category.id ? 'atualizada' : 'criada'}: ${category.name}`);
    }
    return { success: !error, error };
  }

  async deleteCategory(id: string): Promise<{ success: boolean; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: 'No active unit' };
    const { error } = await supabase.from('menu_categories').delete().eq('id', id).eq('user_id', userId);
    if (!error) {
      this.auditService.logAction('MENU_CATEGORY_DELETED', `Categoria de cardápio deletada: ${id}`);
    }
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

    const dbPayload: any = {
      id: item.id || undefined,
      user_id: userId, 
      menu_category_id: item.menu_category_id,
      recipe_id: item.recipe_id,
      custom_name: item.custom_name,
      custom_description: item.custom_description,
      custom_price: item.custom_price,
      custom_image_url: item.custom_image_url,
      display_order: item.display_order,
      is_active: item.is_active !== undefined ? item.is_active : true,
      sku: item.sku,
      promotional_price: item.promotional_price
    };
    Object.keys(dbPayload).forEach(key => dbPayload[key] === undefined && delete dbPayload[key]);

    const { data, error } = await supabase
      .from('menu_items')
      .upsert(dbPayload, { onConflict: 'id' })
      .select('id')
      .single();

    if (error) {
      console.error('SUPABASE DB ERROR (saveItem):', JSON.stringify(error));
    } else {
       this.auditService.logAction('MENU_ITEM_SAVED', `Produto ${item.id ? 'atualizado' : 'criado'}: ${item.custom_name || item.recipe_id}`);
    }
    return { success: !error, error };
  }

  async deleteItem(id: string): Promise<{ success: boolean; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: 'No active unit' };
    const { error } = await supabase.from('menu_items').delete().eq('id', id).eq('user_id', userId);
    if (!error) {
       this.auditService.logAction('MENU_ITEM_DELETED', `Produto deletado: ${id}`);
    }
    return { success: !error, error };
  }

  // CRUD for Options
  async saveOption(option: Partial<MenuItemOption>): Promise<{ success: boolean; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: 'No active unit' };

    const dbPayload: any = {
      id: option.id || undefined,
      user_id: userId,
      store_id: userId,
      menu_item_id: option.menu_item_id,
      name: option.name,
      min_choices: option.min_choices,
      max_choices: option.max_choices,
      display_order: option.display_order
    };
    Object.keys(dbPayload).forEach(key => dbPayload[key] === undefined && delete dbPayload[key]);

    const { data, error } = await supabase
      .from('menu_item_option_groups')
      .upsert(dbPayload, { onConflict: 'id' })
      .select('id')
      .single();

    if (error) {
      console.error('SUPABASE DB ERROR (saveOption):', JSON.stringify(error));
    }
    return { success: !error, error };
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

    let finalRecipeId = choice.recipe_id;

    if (!finalRecipeId) {
        // Find or create a dummy recipe
        const { data: dummyRecipe } = await supabase.from('recipes')
            .select('id')
            .eq('user_id', userId)
            .eq('name', 'Opção Personalizada (Sistema)')
            .limit(1)
            .single();
        
        if (dummyRecipe) {
            finalRecipeId = dummyRecipe.id;
        } else {
            // Need a category
            const { data: cat } = await supabase.from('categories')
                .select('id')
                .eq('user_id', userId)
                .limit(1)
                .single();
                
            const catId = cat ? cat.id : '00000000-0000-0000-0000-000000000000'; // fallback, might fail but usually cat exists
            
            const { data: newDummy, error: dummyErr } = await supabase.from('recipes')
                .insert({
                    user_id: userId,
                    name: 'Opção Personalizada (Sistema)',
                    price: 0,
                    category_id: catId,
                    is_available: false,
                    is_sub_recipe: true,
                    unit: 'un'
                })
                .select('id')
                .single();
            if (newDummy) {
                finalRecipeId = newDummy.id;
            } else {
                console.error('Error creating dummy recipe', dummyErr);
            }
        }
    }

    const dbPayload: any = {
      id: choice.id || undefined,
      user_id: userId, 
      menu_item_option_id: choice.menu_item_option_id,
      recipe_id: finalRecipeId,
      custom_name: choice.custom_name,
      additional_price: choice.additional_price,
      display_order: choice.display_order
    };
    Object.keys(dbPayload).forEach(key => dbPayload[key] === undefined && delete dbPayload[key]);

    const { data, error } = await supabase
      .from('menu_item_option_choices')
      .upsert(dbPayload, { onConflict: 'id' })
      .select('id')
      .single();

    if (error) {
      console.error('SUPABASE DB ERROR (saveOptionChoice):', JSON.stringify(error));
    }
    return { success: !error, error };
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

