import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductionPlan, ProductionTask, ProductionTaskStatus, Recipe, Station, Employee, RecipeIngredient, IngredientUnit, RecipeSubRecipe, Ingredient } from '../../models/db.models';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { MiseEnPlaceDataService } from '../../services/mise-en-place-data.service';
import { NotificationService } from '../../services/notification.service';
import { OperationalAuthService } from '../../services/operational-auth.service';
import { MiseEnPlaceRecipeModalComponent } from './mise-en-place-recipe-modal/mise-en-place-recipe-modal.component';
// FIX: Import new state services
import { RecipeStateService } from '../../services/recipe-state.service';
import { PosStateService } from '../../services/pos-state.service';
import { HrStateService } from '../../services/hr-state.service';
import { InventoryStateService } from '../../services/inventory-state.service';

type TaskForm = Partial<Omit<ProductionTask, 'id' | 'production_plan_id' | 'user_id'>> & { task_type: 'recipe' | 'custom' };

@Component({
  selector: 'app-mise-en-place',
  standalone: true,
  imports: [CommonModule, MiseEnPlaceRecipeModalComponent],
  templateUrl: './mise-en-place.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MiseEnPlaceComponent {
  stateService = inject(SupabaseStateService);
  dataService = inject(MiseEnPlaceDataService);
  notificationService = inject(NotificationService);
  operationalAuthService = inject(OperationalAuthService);
  // FIX: Inject feature-specific state services
  private recipeState = inject(RecipeStateService);
  private posState = inject(PosStateService);
  private hrState = inject(HrStateService);
  private inventoryState = inject(InventoryStateService);

  // Data Signals
  // FIX: Access state from the correct feature-specific services
  subRecipes = computed(() => this.recipeState.recipes().filter(r => r.is_sub_recipe));
  stations = this.posState.stations;
  employees = computed(() => {
    const rolesMap = new Map(this.hrState.roles().map(r => [r.id, r.name]));
    const allowedRoles = new Set(['Gerente', 'Cozinha', 'Garçom', 'Caixa']);
    return this.hrState.employees().filter(e => {
        // FIX: Explicitly typing the variable helps the compiler with type inference inside complex computed signals.
        const roleName: string | undefined = e.role_id ? rolesMap.get(e.role_id) : undefined;
        return roleName ? allowedRoles.has(roleName) : false;
    });
  });
  activeEmployee = this.operationalAuthService.activeEmployee;
  recipeCosts = this.recipeState.recipeCosts;

  // View State
  selectedDate = signal(new Date().toISOString().split('T')[0]);
  activePlan = computed(() => {
    // FIX: Access state from the correct feature-specific service
    const plans = this.inventoryState.productionPlans();
    const date = this.selectedDate();
    return plans.find(p => p.plan_date === date) ?? null;
  });
  isLoading = signal(true);
  updatingStockTasks = signal<Set<string>>(new Set());
  
  // Modal State
  isModalOpen = signal(false);
  editingTask = signal<ProductionTask | null>(null);
  taskForm = signal<TaskForm>({ task_type: 'recipe' });

  // Recipe Modal State
  isRecipeModalOpen = signal(false);
  selectedTaskForRecipe = signal<ProductionTask | null>(null);

  isManager = computed(() => this.activeEmployee()?.role === 'Gerente');

  recipeForModal = computed(() => {
    const task = this.selectedTaskForRecipe();
    if (!task || !task.sub_recipe_id) return null;

    // FIX: Access state from the correct feature-specific services
    const allRecipes = this.recipeState.recipes();
    const recipe = allRecipes.find(r => r.id === task.sub_recipe_id);
    if (!recipe) return null;

    const allPreparations = this.recipeState.recipePreparations();
    const allIngredients = this.recipeState.recipeIngredients();
    const allSubRecipes = this.recipeState.recipeSubRecipes();
    // FIX: Explicitly typing the Map generic types resolves compiler type inference issues.
    const ingredientsMap = new Map<string, Ingredient>(this.inventoryState.ingredients().map(i => [i.id, i]));
    // FIX: Explicitly typing the Map generic types resolves compiler type inference issues.
    const recipesMap = new Map<string, Recipe>(allRecipes.map(r => [r.id, r]));

    const recipePreps = allPreparations
      .filter(p => p.recipe_id === recipe.id)
      .map(p => {
        const prepIngredients = allIngredients
          .filter(i => i.preparation_id === p.id)
          .map(i => {
            // FIX: Add a guard to ensure ingredientDetails is not undefined.
            const ingredientDetails = ingredientsMap.get(i.ingredient_id);
            const baseUnit = ingredientDetails?.unit || 'un';
            let displayUnit: IngredientUnit = baseUnit;
            let displayQuantity = i.quantity;

            if (baseUnit === 'kg' && displayQuantity > 0 && displayQuantity < 1) {
                displayUnit = 'g';
                displayQuantity *= 1000;
            } else if (baseUnit === 'l' && displayQuantity > 0 && displayQuantity < 1) {
                displayUnit = 'ml';
                displayQuantity *= 1000;
            }

            return {
              ...i,
              // FIX: Add a guard to ensure ingredientDetails is not undefined.
              name: ingredientDetails?.name || '?',
              unit: displayUnit,
              quantity: displayQuantity
            };
          });
        return { ...p, ingredients: prepIngredients };
      })
      .sort((a,b) => a.display_order - b.display_order);

    const recipeSubRecipesData = allSubRecipes
      .filter(sr => sr.parent_recipe_id === recipe.id)
      .map(sr => ({
        ...sr,
        // FIX: Add a guard to ensure recipe exists before accessing its properties.
        name: recipesMap.get(sr.child_recipe_id)?.name || '?'
      }));

    return {
      recipe: recipe,
      preparations: recipePreps,
      subRecipes: recipeSubRecipesData
    };
  });

  constructor() {
    effect(() => {
      const date = this.selectedDate();
      const isDataLoaded = this.stateService.isDataLoaded();

      if (!isDataLoaded) {
        this.isLoading.set(true);
        return; // Wait for initial data load
      }

      // Check if a plan for this date is already loaded in the global state.
      // FIX: Access state from the correct feature-specific service
      const planExists = this.inventoryState.productionPlans().some(p => p.plan_date === date);

      if (planExists) {
          this.isLoading.set(false);
      } else {
        // Data is loaded, but no plan for this date. Let's create it.
        this.isLoading.set(true);
        this.dataService.getOrCreatePlanForDate(date).then(({ error }) => {
          if (error) {
            this.notificationService.alert(`Erro ao carregar ou criar plano: ${error.message}`);
          }
          // The creation will trigger a realtime event which updates the stateService.productionPlans signal.
          // Our `activePlan` computed will then pick it up. We just need to stop loading.
          this.isLoading.set(false);
        });
      }
    }, { allowSignalWrites: true });
  }

  filteredTasks = computed(() => {
    const tasks = this.activePlan()?.production_tasks || [];
    const employee = this.activeEmployee();
    if (employee?.role === 'Gerente') {
      return tasks;
    }
    return tasks.filter(task => !task.employee_id || task.employee_id === employee?.id);
  });
  
  groupedTasksByStation = computed(() => {
    const tasks = this.filteredTasks();
    const allStations = this.stations();
    const stationsMap = new Map<string, { id: string, name: string, tasks: ProductionTask[] }>();
    
    for (const station of allStations) {
      stationsMap.set(station.id, { id: station.id, name: station.name, tasks: [] });
    }
    
    for (const task of tasks) {
      const station = stationsMap.get(task.station_id);
      if (station) {
        station.tasks.push(task);
      } else {
        // Handle tasks with stations that might have been deleted
        const unknownStationKey = 'unknown';
        if (!stationsMap.has(unknownStationKey)) {
            stationsMap.set(unknownStationKey, { id: unknownStationKey, name: 'Estação Desconhecida', tasks: [] });
        }
        stationsMap.get(unknownStationKey)!.tasks.push(task);
      }
    }
    
    return Array.from(stationsMap.values()).filter(s => s.tasks.length > 0 || allStations.some(as => as.id === s.id));
  });

  handleDateChange(event: Event) {
    const newDate = (event.target as HTMLInputElement).value;
    this.selectedDate.set(newDate);
  }

  openTaskModal(task: ProductionTask | null = null) {
    if (task) {
      this.editingTask.set(task as ProductionTask);
      this.taskForm.set({
        task_type: task.sub_recipe_id ? 'recipe' : 'custom',
        sub_recipe_id: task.sub_recipe_id,
        custom_task_name: task.custom_task_name,
        quantity_to_produce: task.quantity_to_produce,
        station_id: task.station_id,
        employee_id: task.employee_id,
      });
    } else {
      this.editingTask.set(null);
      this.taskForm.set({
        task_type: 'recipe',
        quantity_to_produce: 1,
        station_id: this.stations()[0]?.id,
        employee_id: null,
        sub_recipe_id: null,
        custom_task_name: ''
      });
    }
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
  }

  updateTaskFormField(field: keyof TaskForm, value: any) {
    this.taskForm.update(form => {
      const newForm = { ...form, [field]: value };
      if (field === 'task_type') {
        newForm.sub_recipe_id = null;
        newForm.custom_task_name = '';
      }
      return newForm;
    });
  }

  async saveTask() {
    let plan = this.activePlan();
    if (!plan) {
        const { success, error, data } = await this.dataService.getOrCreatePlanForDate(this.selectedDate());
        if (!success) {
            await this.notificationService.alert(`Erro ao criar plano de produção: ${error.message}`);
            return;
        }
        plan = data!;
    }

    const form = this.taskForm();
    const taskData: Partial<ProductionTask> = {
      sub_recipe_id: form.task_type === 'recipe' ? form.sub_recipe_id : null,
      custom_task_name: form.task_type === 'custom' ? form.custom_task_name : null,
      quantity_to_produce: form.quantity_to_produce,
      station_id: form.station_id,
      employee_id: form.employee_id,
    };

    let result;
    if (this.editingTask()) {
      result = await this.dataService.updateTask(this.editingTask()!.id, taskData);
    } else {
      result = await this.dataService.addTask(plan.id, taskData);
    }

    if (result.success) {
      this.closeModal();
    } else {
      await this.notificationService.alert(`Erro ao salvar tarefa: ${result.error?.message}`);
    }
  }
  
  async handleTaskClick(task: ProductionTask) {
    if (task.status === 'Concluído' || this.updatingStockTasks().has(task.id)) return;

    this.updatingStockTasks.update(set => new Set(set).add(task.id));
    
    try {
      if (task.status === 'A Fazer') {
        const { success, error } = await this.dataService.updateTask(task.id, { status: 'Em Preparo' });
        if (!success) throw error;
      } else if (task.status === 'Em Preparo') {
        const date = new Date();
        const defaultLot = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}-${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}`;
        
        const { confirmed, value: lotNumber } = await this.notificationService.prompt(
            'Confirme ou edite o número do lote para esta produção.',
            'Finalizar Produção',
            { initialValue: defaultLot, confirmText: 'Confirmar', inputType: 'text' }
        );
        
        if (confirmed && lotNumber) {
            const totalCost = this.getTaskCost(task);
            const { success, error } = await this.dataService.completeTask(task, lotNumber, totalCost);
            if (!success) throw error;
        }
      }
    } catch (error: any) {
        await this.notificationService.alert(`Ocorreu um erro: ${error.message}`);
    } finally {
        this.updatingStockTasks.update(set => {
            const newSet = new Set(set);
            newSet.delete(task.id);
            return newSet;
        });
    }
  }

  async deleteTask(taskId: string) {
    const confirmed = await this.notificationService.confirm('Tem certeza que deseja remover esta tarefa?', 'Remover Tarefa');
    if (confirmed) {
        const { success, error } = await this.dataService.deleteTask(taskId);
        if (!success) await this.notificationService.alert(`Erro ao remover tarefa: ${error?.message}`);
    }
  }
  
  getTaskCost(task: ProductionTask): number {
    if (task.total_cost !== null && task.total_cost !== undefined) {
        return task.total_cost;
    }
    if (task.sub_recipe_id) {
        const recipeCost = this.recipeCosts().get(task.sub_recipe_id)?.totalCost ?? 0;
        return recipeCost * task.quantity_to_produce;
    }
    return 0;
  }

  getStatusClass(status: ProductionTaskStatus): string {
    switch (status) {
        case 'A Fazer': return 'border-yellow-500 bg-gray-800';
        case 'Em Preparo': return 'border-blue-500 bg-blue-900/40';
        case 'Concluído': return 'border-green-500 bg-green-900/30 opacity-70';
        case 'Rascunho': return 'border-gray-500 bg-gray-900/40';
        default: return 'border-gray-600';
    }
  }

  openRecipeModal(task: ProductionTask) {
    if (!task.sub_recipe_id) {
      this.notificationService.show('Esta é uma tarefa personalizada e não possui ficha técnica.', 'info');
      return;
    }
    this.selectedTaskForRecipe.set(task);
    this.isRecipeModalOpen.set(true);
  }

  closeRecipeModal() {
    this.isRecipeModalOpen.set(false);
    this.selectedTaskForRecipe.set(null);
  }
}
