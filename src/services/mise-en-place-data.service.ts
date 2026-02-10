
import { Injectable, inject } from '@angular/core';
import { ProductionPlan, ProductionTask, ProductionTaskStatus } from '../models/db.models';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';
import { InventoryDataService } from './inventory-data.service';
import { InventoryStateService } from './inventory-state.service';
import { CompletionData } from '../components/mise-en-place/completion-modal/completion-modal.component'; // Import type (interface only)

@Injectable({
  providedIn: 'root',
})
export class MiseEnPlaceDataService {
  private authService = inject(AuthService);
  private inventoryDataService = inject(InventoryDataService);
  private inventoryState = inject(InventoryStateService);

  async getOrCreatePlanForDate(date: string): Promise<{ success: boolean, error: any, data: ProductionPlan | null }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' }, data: null };

    // First, try to find an existing plan
    let { data: existingPlan, error: findError } = await supabase
      .from('production_plans')
      .select('*, production_tasks(*, recipes(name, source_ingredient_id, shelf_life_prepared_days), stations(name), employees(name))')
      .eq('user_id', userId)
      .eq('plan_date', date)
      .maybeSingle();
    
    if (findError) {
        console.error("Error finding production plan:", findError);
        return { success: false, error: findError, data: null };
    }
    
    if (existingPlan) {
        this.syncPlanToState(existingPlan);
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
    
    const newPlanWithTasks = { ...newPlan, production_tasks: [] };
    this.syncPlanToState(newPlanWithTasks);
    
    return { success: true, error: null, data: newPlanWithTasks };
  }

  async addTask(planId: string, taskData: Partial<ProductionTask>): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    
    const { data: newTask, error } = await supabase.from('production_tasks').insert({
        ...taskData,
        production_plan_id: planId,
        user_id: userId,
        status: 'A Fazer'
    }).select('*, recipes(name, source_ingredient_id, shelf_life_prepared_days), stations(name), employees(name)').single();

    if (!error && newTask) {
        // Manually update state to reflect change immediately in UI
        this.inventoryState.productionPlans.update(plans => {
            return plans.map(plan => {
                if (plan.id === planId) {
                    const currentTasks = plan.production_tasks || [];
                    // Avoid duplicates if realtime hits fast
                    if (currentTasks.some(t => t.id === newTask.id)) return plan;
                    return { ...plan, production_tasks: [...currentTasks, newTask] };
                }
                return plan;
            });
        });
    }

    return { success: !error, error };
  }

  async updateTask(taskId: string, taskData: Partial<ProductionTask>): Promise<{ success: boolean; error: any }> {
    const { id, ...updateData } = taskData;
    const { data: updatedTask, error } = await supabase
        .from('production_tasks')
        .update(updateData)
        .eq('id', taskId)
        .select('*, recipes(name, source_ingredient_id, shelf_life_prepared_days), stations(name), employees(name)')
        .single();
    
    if (!error && updatedTask) {
        this.updateTaskInState(updatedTask);
    }
    return { success: !error, error };
  }
  
  async completeTask(task: ProductionTask, data: CompletionData, totalCost: number): Promise<{ success: boolean; error: any }> {
    // Refetch task to be sure about source_ingredient_id
    const { data: fullTaskData, error: fetchError } = await supabase
        .from('production_tasks')
        .select('*, recipes!inner(id, source_ingredient_id)')
        .eq('id', task.id)
        .single();

    if (fetchError) {
        return { success: false, error: fetchError };
    }
    
    // UPDATED: Use quantityProduced from modal instead of task.quantity_to_produce
    if (fullTaskData.sub_recipe_id && fullTaskData.recipes?.source_ingredient_id) {
        const { success, error } = await this.inventoryDataService.adjustStockForProduction(
            fullTaskData.sub_recipe_id, 
            fullTaskData.recipes.source_ingredient_id, 
            data.quantityProduced, // Use Actual Quantity
            data.lotNumber,
            fullTaskData.station_id
        );
        if (!success) {
            return { success: false, error };
        }
    }
    
    // Now update the task itself with the completion details
    const { data: updatedTask, error: updateError } = await supabase
        .from('production_tasks')
        .update({ 
            status: 'Concluído', 
            lot_number: data.lotNumber, 
            total_cost: totalCost,
            quantity_produced: data.quantityProduced,
            completion_notes: data.notes,
            expiration_date: new Date(data.expirationDate).toISOString() // Convert to full ISO
        })
        .eq('id', task.id)
        .select('*, recipes(name, source_ingredient_id, shelf_life_prepared_days), stations(name), employees(name)')
        .single();
        
    if (!updateError && updatedTask) {
        this.updateTaskInState(updatedTask);
    }

    return { success: !updateError, error: updateError };
  }

  async deleteTask(taskId: string): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('production_tasks').delete().eq('id', taskId);
    
    if (!error) {
         this.inventoryState.productionPlans.update(plans => {
            return plans.map(plan => {
                if (plan.production_tasks?.some(t => t.id === taskId)) {
                    return {
                        ...plan,
                        production_tasks: plan.production_tasks.filter(t => t.id !== taskId)
                    };
                }
                return plan;
            });
        });
    }

    return { success: !error, error };
  }

  // Helper to ensure the plan exists in the global state
  private syncPlanToState(plan: ProductionPlan) {
     this.inventoryState.productionPlans.update(current => {
         // Check if plan already exists to avoid overwriting newer data if present
         const index = current.findIndex(p => p.id === plan.id);
         if (index !== -1) {
             // If it exists but has no tasks loaded (rare edge case), we might want to update it,
             // but usually we trust the existing state or realtime. 
             // For now, if it exists, we assume it's up to date via realtime.
             return current; 
         }
         return [plan, ...current];
     });
  }

  // Helper to update a single task in the state
  private updateTaskInState(updatedTask: any) {
      this.inventoryState.productionPlans.update(plans => {
        return plans.map(plan => {
            if (plan.id === updatedTask.production_plan_id) {
                const currentTasks = plan.production_tasks || [];
                return { 
                    ...plan, 
                    production_tasks: currentTasks.map(t => t.id === updatedTask.id ? updatedTask : t) 
                };
            }
            return plan;
        });
    });
  }
}
