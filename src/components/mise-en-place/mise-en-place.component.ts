
import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ProductionPlan, ProductionTask, ProductionTaskStatus, Recipe, Station, Ingredient } from '../../models/db.models';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { MiseEnPlaceDataService } from '../../services/mise-en-place-data.service';
import { NotificationService } from '../../services/notification.service';
import { OperationalAuthService } from '../../services/operational-auth.service';
import { MiseEnPlaceRecipeModalComponent } from './mise-en-place-recipe-modal/mise-en-place-recipe-modal.component';
import { MiseEnPlaceFocusComponent } from './mise-en-place-focus/mise-en-place-focus.component';

// Import new state services
import { RecipeStateService } from '../../services/recipe-state.service';
import { PosStateService } from '../../services/pos-state.service';
import { HrStateService } from '../../services/hr-state.service';
import { InventoryStateService } from '../../services/inventory-state.service';

// FIX: Omit task_type from ProductionTask to avoid type conflict with local 'recipe' | 'custom' type
type TaskForm = Partial<Omit<ProductionTask, 'id' | 'production_plan_id' | 'user_id' | 'task_type'>> & { task_type: 'recipe' | 'custom' };

@Component({
  selector: 'app-mise-en-place',
  standalone: true,
  imports: [CommonModule, DragDropModule, MiseEnPlaceRecipeModalComponent, MiseEnPlaceFocusComponent],
  templateUrl: './mise-en-place.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MiseEnPlaceComponent {
  stateService = inject(SupabaseStateService);
  dataService = inject(MiseEnPlaceDataService);
  notificationService = inject(NotificationService);
  operationalAuthService = inject(OperationalAuthService);
  
  private recipeState = inject(RecipeStateService);
  private posState = inject(PosStateService);
  private hrState = inject(HrStateService);
  private inventoryState = inject(InventoryStateService);

  // Data Signals
  subRecipes = computed(() => this.recipeState.recipes().filter(r => r.is_sub_recipe));
  stations = this.posState.stations;
  employees = computed(() => {
    const rolesMap = new Map(this.hrState.roles().map(r => [r.id, r.name]));
    const allowedRoles = new Set(['Gerente', 'Cozinha', 'Garçom', 'Caixa']);
    return this.hrState.employees().filter(e => {
        const roleName = e.role_id ? rolesMap.get(e.role_id) as (string | undefined) : undefined;
        return roleName ? allowedRoles.has(roleName) : false;
    });
  });
  activeEmployee = this.operationalAuthService.activeEmployee;
  recipeCosts = this.recipeState.recipeCosts;

  // View State
  viewMode = signal<'manager' | 'cook'>('manager');
  selectedDate = signal(new Date().toISOString().split('T')[0]);
  selectedStationFilter = signal<string | 'all'>('all'); // NEW FILTER

  activePlan = computed(() => {
    const plans = this.inventoryState.productionPlans();
    const date = this.selectedDate();
    return plans.find(p => p.plan_date === date) ?? null;
  });
  
  isLoading = signal(true);
  
  // Modal State
  isModalOpen = signal(false);
  editingTask = signal<ProductionTask | null>(null);
  taskForm = signal<TaskForm>({ task_type: 'recipe' });

  // Focus Mode State
  focusedTask = signal<ProductionTask | null>(null);

  // Recipe Modal
  isRecipeModalOpen = signal(false);
  selectedTaskForRecipe = signal<ProductionTask | null>(null);

  isManager = computed(() => this.activeEmployee()?.role === 'Gerente');
  
  // Tasks filtered and sorted
  tasks = computed(() => {
    const allTasks = this.activePlan()?.production_tasks || [];
    let filtered = allTasks;
    
    if (this.selectedStationFilter() !== 'all') {
        filtered = filtered.filter(t => t.station_id === this.selectedStationFilter());
    }
    
    // Sort by priority (ascending, 1 is highest/first)
    return [...filtered].sort((a, b) => (a.priority || 999) - (b.priority || 999));
  });

  // Filter for Cook View
  cookTasks = computed(() => {
      const all = this.tasks();
      
      // Simple filter: tasks not completed
      return all.filter(t => t.status !== 'Concluído');
  });

  // Highlight missing ingredients for tasks
  taskWarnings = computed(() => {
     const warnings = new Map<string, boolean>();
     const recipes = this.recipeState.recipes();
     const allTaskIngredients = this.recipeState.recipeIngredients();
     const inventory = this.inventoryState.ingredients();
     const allPreparations = this.recipeState.recipePreparations();

     const inventoryMap = new Map(inventory.map(i => [i.id, i.stock]));

     for (const task of this.tasks()) {
         if (!task.sub_recipe_id || task.status === 'Concluído') continue;
         
         const recipePreps = allPreparations.filter(p => p.recipe_id === task.sub_recipe_id);
         let hasShortage = false;

         for (const prep of recipePreps) {
             const ingredients = allTaskIngredients.filter(i => i.preparation_id === prep.id);
             for (const ing of ingredients) {
                 const currentStock = inventoryMap.get(ing.ingredient_id) || 0;
                 const requiredAmount = ing.quantity * task.quantity_to_produce; // Simplified scale
                 if (currentStock < requiredAmount) {
                     hasShortage = true;
                     break;
                 }
             }
             if (hasShortage) break;
         }
         warnings.set(task.id, hasShortage);
     }
     
     return warnings;
  });

  recipeForModal = computed(() => {
      // (Existing logic for recipe modal data preparation)
      const task = this.selectedTaskForRecipe();
      if (!task || !task.sub_recipe_id) return null;
      const allRecipes = this.recipeState.recipes();
      const recipe = allRecipes.find(r => r.id === task.sub_recipe_id);
      if (!recipe) return null;
      
      // Re-implement logic to gather preparations and sub-recipes for the modal display
      const allPreparations = this.recipeState.recipePreparations();
      const allIngredients = this.recipeState.recipeIngredients();
      const allSubRecipes = this.recipeState.recipeSubRecipes();
      const ingredientsMap = new Map<string, Ingredient>(this.inventoryState.ingredients().map(i => [i.id, i]));
      const recipesMap = new Map<string, Recipe>(allRecipes.map(r => [r.id, r]));

      const recipePreps = allPreparations
        .filter(p => p.recipe_id === recipe.id)
        .map(p => {
          const prepIngredients = allIngredients
            .filter(i => i.preparation_id === p.id)
            .map(i => {
              const ingredientDetails = ingredientsMap.get(i.ingredient_id);
              return {
                ...i,
                name: ingredientDetails?.name || 'Ingrediente Excluído',
                unit: ingredientDetails?.unit || 'un', // Fallback
                quantity: i.quantity * (task.quantity_to_produce || 1)
              };
            });
          return { ...p, ingredients: prepIngredients };
        })
        .sort((a, b) => a.display_order - b.display_order);

      const recipeSubRecipesData = allSubRecipes
        .filter(sr => sr.parent_recipe_id === recipe.id)
        .map(sr => ({
          ...sr,
          name: recipesMap.get(sr.child_recipe_id)?.name || '?',
          quantity: sr.quantity * (task.quantity_to_produce || 1)
        }));

      return { recipe, preparations: recipePreps, subRecipes: recipeSubRecipesData }; 
  });

  constructor() {
    effect(() => {
        if (!this.isManager()) {
            this.viewMode.set('cook');
        }
    });

    effect(() => {
      const date = this.selectedDate();
      const isDataLoaded = this.stateService.isDataLoaded();

      if (!isDataLoaded) {
        this.isLoading.set(true);
        return; 
      }

      const planExists = this.inventoryState.productionPlans().some(p => p.plan_date === date);

      if (planExists) {
          this.isLoading.set(false);
      } else {
        this.isLoading.set(true);
        this.dataService.getOrCreatePlanForDate(date).then(({ error }) => {
          if (error) {
            this.notificationService.alert(`Erro ao carregar plano: ${error.message}`);
          }
          this.isLoading.set(false);
        });
      }
    }, { allowSignalWrites: true });
  }

  handleDateChange(event: Event) {
    const newDate = (event.target as HTMLInputElement).value;
    this.selectedDate.set(newDate);
  }

  // --- Focus Mode ---
  enterFocusMode(task: ProductionTask) {
      this.focusedTask.set(task);
  }

  exitFocusMode() {
      this.focusedTask.set(null);
  }

  get tasksTodo() { return this.tasks().filter(t => t.status === 'A Fazer'); }
  get tasksInProgress() { return this.tasks().filter(t => t.status === 'Em Preparo'); }
  get tasksDone() { return this.tasks().filter(t => t.status === 'Concluído'); }

  // --- Drag and Drop Logic ---
  drop(event: CdkDragDrop<ProductionTask[]>) {
    if (event.previousContainer === event.container) {
      // Reorder logic inside same list
      const items = [...event.container.data];
      moveItemInArray(items, event.previousIndex, event.currentIndex);
      items.forEach((item, idx) => item.priority = idx + 1);
      this.dataService.updateTaskPriorities(items.map(t => ({ id: t.id, priority: t.priority })));
    } else {
      // Moved to another list/status
      const task = event.previousContainer.data[event.previousIndex];
      const newStatus = event.container.id as ProductionTaskStatus;
      this.dataService.updateTask(task.id, { status: newStatus });
    }
  }

  // --- Task Management ---
  openTaskModal(task: ProductionTask | null = null) {
      // ... existing logic to open modal
      if (task) {
        this.editingTask.set(task);
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
          this.taskForm.set({ task_type: 'recipe', quantity_to_produce: 1, station_id: this.stations()[0]?.id });
      }
      this.isModalOpen.set(true);
  }
  
  closeModal() { this.isModalOpen.set(false); }

  updateTaskFormField(field: any, value: any) {
      this.taskForm.update(f => ({...f, [field]: value}));
  }

  async saveTask() {
      // ... existing save logic calling dataService.addTask or updateTask
      let plan = this.activePlan();
      if (!plan) return; // Should allow creating plan if missing
      
      const form = this.taskForm();
      const taskData: Partial<ProductionTask> = {
        sub_recipe_id: form.task_type === 'recipe' ? form.sub_recipe_id : null,
        custom_task_name: form.task_type === 'custom' ? form.custom_task_name : null,
        quantity_to_produce: form.quantity_to_produce,
        station_id: form.station_id,
        employee_id: form.employee_id,
      };

      if (this.editingTask()) {
          await this.dataService.updateTask(this.editingTask()!.id, taskData);
      } else {
          await this.dataService.addTask(plan.id, taskData);
      }
      this.closeModal();
  }

  async deleteTask(taskId: string) {
      if(confirm('Deletar tarefa?')) {
          await this.dataService.deleteTask(taskId);
      }
  }

  getStatusClass(status: ProductionTaskStatus): string {
    switch (status) {
        case 'A Fazer': return 'border-yellow-500 bg-gray-800';
        case 'Em Preparo': return 'border-blue-500 bg-blue-900/30';
        case 'Concluído': return 'border-green-500 bg-green-900/20 opacity-60';
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
