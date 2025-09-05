import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductionPlan, ProductionTask, ProductionTaskStatus, Recipe, Station, Employee } from '../../models/db.models';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { MiseEnPlaceDataService } from '../../services/mise-en-place-data.service';
import { NotificationService } from '../../services/notification.service';
import { OperationalAuthService } from '../../services/operational-auth.service';
import { RouterLink } from '@angular/router';

type TaskForm = Partial<Omit<ProductionTask, 'id' | 'production_plan_id' | 'user_id'>> & { task_type: 'recipe' | 'custom' };

@Component({
  selector: 'app-mise-en-place',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './mise-en-place.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MiseEnPlaceComponent {
  stateService = inject(SupabaseStateService);
  dataService = inject(MiseEnPlaceDataService);
  notificationService = inject(NotificationService);
  operationalAuthService = inject(OperationalAuthService);

  // Data Signals
  subRecipes = computed(() => this.stateService.recipes().filter(r => r.is_sub_recipe));
  stations = this.stateService.stations;
  employees = computed(() => this.stateService.employees().filter(e => ['Gerente', 'Cozinha', 'Garçom', 'Caixa'].includes(e.role)));
  activeEmployee = this.operationalAuthService.activeEmployee;

  // View State
  selectedDate = signal(new Date().toISOString().split('T')[0]);
  activePlan = signal<ProductionPlan | null>(null);
  isLoading = signal(true);
  updatingStockTasks = signal<Set<string>>(new Set());
  
  // Modal State
  isModalOpen = signal(false);
  editingTask = signal<ProductionTask | null>(null);
  taskForm = signal<TaskForm>({ task_type: 'recipe' });

  isManager = computed(() => this.activeEmployee()?.role === 'Gerente');

  constructor() {
    effect(() => {
      this.loadPlanForDate(this.selectedDate());
    }, { allowSignalWrites: true });
  }

  async loadPlanForDate(date: string) {
    this.isLoading.set(true);
    const { data, error } = await this.dataService.getOrCreatePlanForDate(date);
    if (error) {
        await this.notificationService.alert(`Erro ao carregar plano: ${error.message}`);
        this.activePlan.set(null);
    } else {
        this.activePlan.set(data);
    }
    this.isLoading.set(false);
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
    const stationsMap = new Map<string, { id: string, name: string, tasks: any[] }>();
    
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

  openTaskModal(task: any | null = null) { // Use any to handle joined data
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
      this.loadPlanForDate(this.selectedDate()); // Reload plan to show new task
      this.closeModal();
    } else {
      await this.notificationService.alert(`Erro ao salvar tarefa: ${result.error?.message}`);
    }
  }
  
  async handleTaskClick(task: ProductionTask) {
    if (task.status === 'Concluído' || this.updatingStockTasks().has(task.id)) return;

    let nextStatus: ProductionTaskStatus;
    switch (task.status) {
        case 'A Fazer': nextStatus = 'Em Preparo'; break;
        case 'Em Preparo': nextStatus = 'Concluído'; break;
        default: return;
    }

    this.updatingStockTasks.update(set => new Set(set).add(task.id));
    
    const { success, error } = await this.dataService.updateTaskStatusAndStock(task.id, nextStatus);
    
    if (!success) {
        await this.notificationService.alert(`Erro ao atualizar status: ${error?.message}`);
    }
    
    // The realtime subscription will refresh the data, so we just remove the loading state.
    this.updatingStockTasks.update(set => {
        const newSet = new Set(set);
        newSet.delete(task.id);
        return newSet;
    });
  }

  async deleteTask(taskId: string) {
    const confirmed = await this.notificationService.confirm('Tem certeza que deseja remover esta tarefa?', 'Remover Tarefa');
    if (confirmed) {
        const { success, error } = await this.dataService.deleteTask(taskId);
        if (!success) await this.notificationService.alert(`Erro ao remover tarefa: ${error?.message}`);
        else this.loadPlanForDate(this.selectedDate());
    }
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
}