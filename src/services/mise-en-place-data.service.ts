
import { Injectable, inject } from '@angular/core';
import { ProductionPlan, ProductionTask, ProductionTaskStatus } from '../models/db.models';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';
import { InventoryDataService } from './inventory-data.service';
import { InventoryStateService } from './inventory-state.service';
import { CompletionData } from '../components/mise-en-place/completion-modal/completion-modal.component'; 
import { UnitContextService } from './unit-context.service';

@Injectable({
  providedIn: 'root',
})
export class MiseEnPlaceDataService {
  private authService = inject(AuthService);
  private inventoryDataService = inject(InventoryDataService);
  private inventoryState = inject(InventoryStateService);
  private unitContextService = inject(UnitContextService);

  private getActiveUnitId(): string | null {
      return this.unitContextService.activeUnitId();
  }

  // ... (getOrCreatePlanForDate remains the same, assuming it's correctly filtering by userId/storeId) ...
  async getOrCreatePlanForDate(date: string): Promise<{ success: boolean, error: any, data: ProductionPlan | null }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Active unit not found' }, data: null };

    // First, try to find an existing plan
    let { data: existingPlan, error: findError } = await supabase
      .from('production_plans')
      .select('*, production_tasks(*, recipes(name, source_ingredient_id, shelf_life_prepared_days, image_url), stations(name), employees(name))')
      .eq('user_id', userId)
      .eq('plan_date', date)
      .maybeSingle();
    
    if (findError) {
        console.error("Error finding production plan:", findError);
        return { success: false, error: findError, data: null };
    }
    
    if (existingPlan) {
        // Sort tasks by priority
        if (existingPlan.production_tasks) {
            existingPlan.production_tasks.sort((a: any, b: any) => (a.priority || 0) - (b.priority || 0));
        }
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
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Active unit not found' } };
    
    // Get max priority
    const plan = this.inventoryState.productionPlans().find(p => p.id === planId);
    const maxPriority = plan?.production_tasks?.reduce((max, t) => Math.max(max, t.priority || 0), 0) ?? 0;

    const { data: newTask, error } = await supabase.from('production_tasks').insert({
        ...taskData,
        production_plan_id: planId,
        user_id: userId,
        status: 'A Fazer',
        priority: maxPriority + 1
    }).select('*, recipes(name, source_ingredient_id, shelf_life_prepared_days, image_url), stations(name), employees(name)').single();

    if (!error && newTask) {
        this.updateTaskInState(newTask);
    }

    return { success: !error, error };
  }

  // New V2 Method: Update Priorities (Drag and Drop)
  async updateTaskPriorities(tasks: { id: string; priority: number }[]): Promise<{ success: boolean; error: any }> {
    const updates = tasks.map(t => ({ id: t.id, priority: t.priority }));
    
    // Supabase JS doesn't support bulk update with different values easily in one call without RPC
    // For now, loop parallel updates (not atomic but OK for this scale) or use UPSERT if full object
    // A better way is Upsert with just ID and priority, but requires all required fields or relaxed constraints
    // Let's do parallel updates for simplicity in prototype
    
    const promises = updates.map(t => 
        supabase.from('production_tasks').update({ priority: t.priority }).eq('id', t.id)
    );

    const results = await Promise.all(promises);
    const error = results.find(r => r.error)?.error;

    return { success: !error, error };
  }

  // New V2 Method: Start Task (Timer)
  async startTask(taskId: string): Promise<{ success: boolean; error: any }> {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('production_tasks')
        .update({ 
            status: 'Em Preparo', 
            started_at: now 
        })
        .eq('id', taskId)
        .select('*, recipes(name, source_ingredient_id, shelf_life_prepared_days, image_url), stations(name), employees(name)')
        .single();
    
    if (!error && data) {
        this.updateTaskInState(data);
    }
    return { success: !error, error };
  }

  async updateTask(taskId: string, taskData: Partial<ProductionTask>): Promise<{ success: boolean; error: any }> {
    const { id, ...updateData } = taskData;
    const { data: updatedTask, error } = await supabase
        .from('production_tasks')
        .update(updateData)
        .eq('id', taskId)
        .select('*, recipes(name, source_ingredient_id, shelf_life_prepared_days, image_url), stations(name), employees(name)')
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
            expiration_date: new Date(data.expirationDate).toISOString(), // Convert to full ISO
            completed_at: new Date().toISOString() // New V2
        })
        .eq('id', task.id)
        .select('*, recipes(name, source_ingredient_id, shelf_life_prepared_days, image_url), stations(name), employees(name)')
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

  private syncPlanToState(plan: ProductionPlan) {
     this.inventoryState.productionPlans.update(current => {
         const index = current.findIndex(p => p.id === plan.id);
         if (index !== -1) {
             // If plan exists, we replace it only if the tasks count is different or we forced a refresh
             // For simple sync, replacing it is safer to ensure we have the latest
             const newPlans = [...current];
             newPlans[index] = plan;
             return newPlans;
         }
         return [plan, ...current];
     });
  }

  private updateTaskInState(updatedTask: any) {
      this.inventoryState.productionPlans.update(plans => {
        return plans.map(plan => {
            if (plan.id === updatedTask.production_plan_id) {
                const currentTasks = plan.production_tasks || [];
                // Check if task exists
                const taskExists = currentTasks.some(t => t.id === updatedTask.id);
                
                let newTasks;
                if (taskExists) {
                    newTasks = currentTasks.map(t => t.id === updatedTask.id ? updatedTask : t);
                } else {
                    newTasks = [...currentTasks, updatedTask];
                }
                
                // Re-sort locally
                newTasks.sort((a,b) => (a.priority || 0) - (b.priority || 0));

                return { ...plan, production_tasks: newTasks };
            }
            return plan;
        });
    });
  }
}
