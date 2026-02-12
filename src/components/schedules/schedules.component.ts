import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Employee, LeaveRequest, Schedule, Shift } from '../../models/db.models';
import { HrStateService } from '../../services/hr-state.service';
import { ScheduleDataService } from '../../services/schedule-data.service';
import { NotificationService } from '../../services/notification.service';
import { OperationalAuthService } from '../../services/operational-auth.service';
import { SupabaseStateService } from '../../services/supabase-state.service';

function formatISOToInput(isoString: string | null | undefined): string {
    if (!isoString) return '';
    const date = new Date(isoString);
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 16);
}

function parseInputToISO(inputString: string | null | undefined): string | null {
    if (!inputString) return null;
    return new Date(inputString).toISOString();
}

@Component({
  selector: 'app-schedules',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './schedules.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchedulesComponent {
  private hrState = inject(HrStateService);
  private scheduleDataService = inject(ScheduleDataService);
  private notificationService = inject(NotificationService);
  private operationalAuthService = inject(OperationalAuthService);
  private supabaseStateService = inject(SupabaseStateService);

  allEmployees = this.hrState.employees;
  availableRoles: string[] = ['Gerente', 'Caixa', 'Garçom', 'Cozinha'];

  isLoading = signal(true);
  weekStartDate = signal(this.getStartOfWeek(new Date()));
  
  isModalOpen = signal(false);
  editingShift = signal<Shift | null>(null);
  shiftForm = signal<Partial<Shift>>({});
  
  isManager = computed(() => this.operationalAuthService.activeEmployee()?.role === 'Gerente');

  // Warning state for conflict
  shiftConflictWarning = signal<string | null>(null);

  employeesToDisplay = computed(() => {
    if (this.isManager()) {
      return this.allEmployees();
    }
    const activeEmployee = this.operationalAuthService.activeEmployee();
    return activeEmployee ? [activeEmployee] : [];
  });

  activeSchedule = computed(() => {
    const schedule = this.hrState.schedules().find(s => s.week_start_date === this.weekStartDate());
    if (this.isManager()) {
        return schedule; 
    }
    return schedule?.is_published ? schedule : null;
  });

  weekDays = computed(() => {
    const start = new Date(this.weekStartDate() + 'T00:00:00');
    return Array.from({ length: 7 }).map((_, i) => {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        return date;
    });
  });

  approvedLeaveByDateAndEmployee = computed(() => {
    const map = new Map<string, Map<string, LeaveRequest>>();
    const approved = this.hrState.leaveRequests().filter(r => r.status === 'Aprovada');
    for (const req of approved) {
      let currentDate = new Date(req.start_date + 'T00:00:00');
      const endDate = new Date(req.end_date + 'T00:00:00');
      while (currentDate <= endDate) {
        const dateString = currentDate.toISOString().split('T')[0];
        if (!map.has(dateString)) {
          map.set(dateString, new Map());
        }
        map.get(dateString)!.set(req.employee_id, req);
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }
    return map;
  });

  shiftsByEmployeeAndDay = computed(() => {
    const map = new Map<string, Map<string, Shift | null>>();
    const allShifts = this.activeSchedule()?.shifts ?? [];

    this.employeesToDisplay().forEach(emp => {
      const dayMap = new Map<string, Shift | null>();
      this.weekDays().forEach(day => {
        dayMap.set(day.toISOString().split('T')[0], null);
      });
      map.set(emp.id, dayMap);
    });
    
    allShifts.forEach(shift => {
      const employeeDayMap = map.get(shift.employee_id);
      if (employeeDayMap) {
        const shiftDate = new Date(shift.start_time).toISOString().split('T')[0];
        employeeDayMap.set(shiftDate, shift);
      }
    });

    return map;
  });

  weekInputValue = computed(() => {
    const startOfWeekStr = this.weekStartDate();
    const date = new Date(startOfWeekStr + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const year = date.getUTCFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${year}-W${String(weekNo).padStart(2, '0')}`;
  });

  constructor() {
    effect(() => {
      const date = this.weekStartDate();
      const isDataLoaded = this.supabaseStateService.isDataLoaded();

      if (!isDataLoaded) {
        this.isLoading.set(true);
        return; 
      }
      
      if (this.isManager()) {
        this.isLoading.set(true);
        this.scheduleDataService.getOrCreateScheduleForDate(date).then(({ error }) => {
          if (error) {
            this.notificationService.alert(`Erro ao carregar ou criar escala: ${error.message}`);
          }
          this.isLoading.set(false);
        });
      } else {
        this.isLoading.set(false);
      }
    }, { allowSignalWrites: true });
  }

  private getStartOfWeek(date: Date): string {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff)).toISOString().split('T')[0];
  }

  changeWeek(direction: number) {
    const current = new Date(this.weekStartDate() + 'T00:00:00');
    current.setDate(current.getDate() + (7 * direction));
    this.weekStartDate.set(this.getStartOfWeek(current));
  }
  
  handleDateChange(event: Event) {
    const weekValue = (event.target as HTMLInputElement).value;
    if (!weekValue) return;
    const [year, week] = weekValue.split('-W').map(Number);
    const dayInWeek = new Date(year, 0, 4 + (week - 1) * 7);
    this.weekStartDate.set(this.getStartOfWeek(dayInWeek));
  }

  openShiftModal(day: Date, employeeId: string, shift: Shift | null = null) {
    if (!this.isManager() || this.activeSchedule()?.is_published) {
      if(this.activeSchedule()?.is_published) this.notificationService.alert('A escala está publicada e não pode ser editada.');
      return;
    }

    this.checkConflict(day, employeeId); // Initial check

    if (shift) {
      this.editingShift.set(shift);
      this.shiftForm.set({ ...shift });
    } else {
      this.editingShift.set(null);
      const startTime = new Date(day);
      startTime.setHours(9, 0, 0, 0);
      const endTime = new Date(day);
      endTime.setHours(17, 0, 0, 0);
      
      const employee = this.allEmployees().find(e => e.id === employeeId);
      const rolesMap = new Map(this.hrState.roles().map(r => [r.id, r.name]));
      const employeeRoleName = employee?.role_id ? rolesMap.get(employee.role_id) ?? null : null;

      this.shiftForm.set({
        employee_id: employeeId,
        role_assigned: employeeRoleName,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString()
      });
    }
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
    this.shiftConflictWarning.set(null);
  }

  // Check for conflicts with approved leaves
  checkConflict(date: Date, employeeId: string) {
      const dateString = date.toISOString().split('T')[0];
      const leave = this.approvedLeaveByDateAndEmployee().get(dateString)?.get(employeeId);
      if (leave) {
          this.shiftConflictWarning.set(`Atenção: Este funcionário está de ${leave.request_type} neste dia.`);
      } else {
          this.shiftConflictWarning.set(null);
      }
  }

  updateShiftFormField(field: keyof Omit<Shift, 'id' | 'created_at' | 'user_id' | 'schedule_id' | 'start_time' | 'end_time' | 'is_day_off'>, value: string | boolean) {
      this.shiftForm.update(form => {
        const newForm = { ...form, [field]: value };
        
        if (field === 'employee_id') {
            const employee = this.allEmployees().find(e => e.id === value);
            const rolesMap = new Map(this.hrState.roles().map(r => [r.id, r.name]));
            const employeeRoleName = employee?.role_id ? rolesMap.get(employee.role_id) ?? null : null;
            newForm.role_assigned = employeeRoleName;
            
            // Re-check conflict if date is set
            if (newForm.start_time) {
                this.checkConflict(new Date(newForm.start_time), value as string);
            }
        }
        return newForm;
      });
  }

  updateShiftFormDateTime(field: 'start_time' | 'end_time', value: string) {
      this.shiftForm.update(form => {
          const newForm = { ...form, [field]: parseInputToISO(value) };
          if (field === 'start_time' && newForm.start_time && newForm.employee_id) {
              this.checkConflict(new Date(newForm.start_time), newForm.employee_id);
          }
          return newForm;
      });
  }
  
  async saveShift() {
    const schedule = this.activeSchedule();
    const form = this.shiftForm();

    if (!schedule || !form.employee_id || (!form.is_day_off && (!form.start_time || !form.end_time))) {
      this.notificationService.alert('Preencha todos os campos obrigatórios.');
      return;
    }
    
    if (form.is_day_off) {
      const day = new Date(this.shiftForm().start_time!);
      const startTime = new Date(day); startTime.setHours(0,0,0,0);
      form.start_time = startTime.toISOString();
      form.end_time = startTime.toISOString();
    }
    
    const { success, error } = await this.scheduleDataService.saveShift(schedule.id, form);
    if(success) {
      this.closeModal();
    } else {
      this.notificationService.alert(`Erro ao salvar turno: ${error?.message}`);
    }
  }
  
  async deleteShift() {
    const shift = this.editingShift();
    if(!shift) return;
    const confirmed = await this.notificationService.confirm('Deseja realmente excluir este turno?');
    if (confirmed) {
        const { success, error } = await this.scheduleDataService.deleteShift(shift.id);
        if(!success) this.notificationService.alert(`Erro ao excluir turno: ${error?.message}`);
        this.closeModal();
    }
  }

  async togglePublish() {
    const schedule = this.activeSchedule();
    if (!schedule) return;
    const action = schedule.is_published ? 'Cancelar a publicação' : 'Publicar';
    const confirmed = await this.notificationService.confirm(`Deseja ${action} desta escala?`);
    if(confirmed) {
        await this.scheduleDataService.publishSchedule(schedule.id, !schedule.is_published);
    }
  }

  async copyFromPreviousWeek() {
      const schedule = this.activeSchedule();
      if (!schedule) return;
      
      const confirmed = await this.notificationService.confirm('Copiar os turnos da semana anterior para a semana atual? Isso pode duplicar turnos se já existirem.');
      if (confirmed) {
          const { success, error, count } = await this.scheduleDataService.copyScheduleFromPreviousWeek(schedule.week_start_date, schedule.id);
          if (success) {
              this.notificationService.show(`${count} turnos copiados com sucesso!`, 'success');
              // Refresh logic typically handled by realtime subscription
          } else {
              this.notificationService.alert(`Erro ao copiar: ${error?.message}`);
          }
      }
  }
  
  getApprovedLeave(day: Date, employee: Employee): LeaveRequest | undefined {
    const dateString = day.toISOString().split('T')[0];
    return this.approvedLeaveByDateAndEmployee().get(dateString)?.get(employee.id);
  }

  formatForInput(iso: string | null | undefined): string {
    return formatISOToInput(iso);
  }
}
