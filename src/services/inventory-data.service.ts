import { Injectable, inject } from '@angular/core';
import { Ingredient, IngredientCategory, Supplier } from '../models/db.models';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';

@Injectable({
  providedIn: 'root',
})
export class InventoryDataService {
  private authService = inject(AuthService);

  async addIngredient(ingredient: Partial<Ingredient>): Promise<{ success: boolean, error: any, data?: Ingredient }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { data, error } = await supabase.from('ingredients').insert({ ...ingredient, user_id: userId }).select().single();
    return { success: !error, error, data };
  }
  
  async updateIngredient(ingredient: Partial<Ingredient>): Promise<{ success: boolean; error: any }> {
    const { id, ...updateData } = ingredient;
    const { error } = await supabase.from('ingredients').update(updateData).eq('id', id!);
    return { success: !error, error };
  }

  async deleteIngredient(id: string): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('ingredients').delete().eq('id', id);
    return { success: !error, error };
  }
  
  async adjustIngredientStock(ingredientId: string, quantityChange: number, reason: string, expirationDate: string | null | undefined): Promise<{ success: boolean, error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase.rpc('adjust_stock', { p_ingredient_id: ingredientId, p_quantity_change: quantityChange, p_reason: reason, p_user_id: userId, p_expiration_date: expirationDate });
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
}
