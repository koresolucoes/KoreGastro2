import { Injectable, inject } from '@angular/core';
import { ProductionPlan, ProductionTask, ProductionTaskStatus } from '../models/db.models';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';
import { InventoryDataService } from './inventory-data.service';
import { SupabaseStateService } from './supabase-state.service';

@Injectable({
  providedIn: 'root',
})
export class MiseEnPlaceDataService {
  private authService = inject(AuthService);
  private inventoryDataService = inject(InventoryDataService);
  private stateService = inject(SupabaseStateService);

  async getOrCreatePlanForDate(date: string): Promise<{ success: boolean, error: any, data: ProductionPlan | null }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' }, data: null };

    // First, try to find an existing plan
    let { data: existingPlan, error: findError } = await supabase
      .from('production_plans')
      .select('*, production_tasks(*, recipes!sub_recipe_id(name, source_ingredient_id), stations(name), employees(name))')
      .eq('user_id', userId)
      .eq('plan_date', date)
      .single();
    
    if (findError && findError.code !== 'PGRST116') { // PGRST116 = not found
        console.error("Error finding production plan:", findError);
        return { success: false, error: findError, data: null };
    }
    
    if (existingPlan) {
        return { success: true, error: null, data: existingPlan };
    }
    
    // If not found, create a new one
    const { data: newPlan, error: createError } = await supabase
        .from('production_plans')
        .insert({ plan_date: date, user_id: userId })
        .select()
        .single();
        
    if (createError) {
        console.error("Error creating production plan:", createError);
        return { success: false, error: createError, data: null };
    }
    
    return { success: true, error: null, data: { ...newPlan, production_tasks: [] } };
  }

  async addTask(planId: string, taskData: Partial<ProductionTask>): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    
    const { error } = await supabase.from('production_tasks').insert({
        ...taskData,
        production_plan_id: planId,
        user_id: userId,
        status: 'A Fazer'
    });
    return { success: !error, error };
  }

  async updateTask(taskId: string, taskData: Partial<ProductionTask>): Promise<{ success: boolean; error: any }> {
    const { id, ...updateData } = taskData;
    const { error } = await supabase.from('production_tasks').update(updateData).eq('id', taskId);
    return { success: !error, error };
  }
  
  async updateTaskStatusAndStock(taskId: string, status: ProductionTaskStatus): Promise<{ success: boolean; error: any }> {
    // If task is being marked as complete, handle stock adjustment
    if (status === 'Concluído') {
      const { data: task } = await supabase.from('production_tasks').select('*, recipes!inner(id, source_ingredient_id)').eq('id', taskId).single();
      
      if (task && task.sub_recipe_id && task.recipes?.source_ingredient_id) {
        const { success, error } = await this.inventoryDataService.adjustStockForProduction(
          task.sub_recipe_id, 
          task.recipes.source_ingredient_id, 
          task.quantity_to_produce
        );
        if (!success) {
          // If stock adjustment fails, don't update the status and return the error.
          return { success: false, error };
        }
      }
    }

    const { error } = await supabase.from('production_tasks').update({ status }).eq('id', taskId);
    return { success: !error, error };
  }

  async deleteTask(taskId: string): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('production_tasks').delete().eq('id', taskId);
    return { success: !error, error };
  }
}