import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, AfterViewInit, OnDestroy, QueryList, ViewChildren, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Employee, LeaveRequest, Schedule, Shift } from '../../models/db.models';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { ScheduleDataService } from '../../services/schedule-data.service';
import { NotificationService } from '../../services/notification.service';
import { OperationalAuthService } from '../../services/operational-auth.service';

// Helper to format ISO string to datetime-local input value
function formatISOToInput(isoString: string | null | undefined): string {
    if (!isoString) return '';
    const date = new Date(isoString);
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 16);
}

// Helper to parse datetime-local input value back to ISO string (UTC)
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
export class SchedulesComponent implements AfterViewInit, OnDestroy {
  private stateService = inject(SupabaseStateService);
  private scheduleDataService = inject(ScheduleDataService);
  private notificationService = inject(NotificationService);
  private operationalAuthService = inject(OperationalAuthService);
  private elementRef = inject(ElementRef);

  // Data
  allEmployees = this.stateService.employees;
  availableRoles: string[] = ['Gerente', 'Caixa', 'Garçom', 'Cozinha'];

  // View State
  isLoading = signal(true);
  weekStartDate = signal(this.getStartOfWeek(new Date()));
  
  // Modal State
  isModalOpen = signal(false);
  editingShift = signal<Shift | null>(null);
  shiftForm = signal<Partial<Shift>>({});
  
  // Mobile view state
  @ViewChildren('dayColumn') dayColumns!: QueryList<ElementRef>;
  private observer?: IntersectionObserver;
  mobileVisibleDayIndex = signal(0);

  isManager = computed(() => this.operationalAuthService.activeEmployee()?.role === 'Gerente');

  employeesToDisplay = computed(() => {
    if (this.isManager()) {
      return this.allEmployees();
    }
    const activeEmployee = this.operationalAuthService.activeEmployee();
    return activeEmployee ? [activeEmployee] : [];
  });

  activeSchedule = computed(() => {
    const schedule = this.stateService.schedules().find(s => s.week_start_date === this.weekStartDate());
    if (this.isManager()) {
        return schedule; // Manager sees published and drafts
    }
    // Other roles only see published schedules
    return schedule?.is_published ? schedule : null;
  });

  weekDays = computed(() => {
    const start = new Date(this.weekStartDate() + 'T00:00:00'); // Treat as local
    return Array.from({ length: 7 }).map((_, i) => {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        return date;
    });
  });

  approvedLeaveByDateAndEmployee = computed(() => {
    const map = new Map<string, Map<string, LeaveRequest>>();
    const approved = this.stateService.leaveRequests().filter(r => r.status === 'Aprovada');
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
    const date = new Date(startOfWeekStr + 'T12:00:00Z'); // Use UTC and noon to avoid timezone issues

    // Thursday of the week determines the week number and year
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const year = date.getUTCFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    // Calculate week number
    const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    
    return `${year}-W${String(weekNo).padStart(2, '0')}`;
  });

  constructor() {
    effect(() => {
      const date = this.weekStartDate();
      const isDataLoaded = this.stateService.isDataLoaded();

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

  ngAfterViewInit() {
    this.dayColumns.changes.subscribe(() => this.setupIntersectionObserver());
    this.setupIntersectionObserver();
  }

  ngOnDestroy() {
    this.observer?.disconnect();
  }

  private setupIntersectionObserver() {
    this.observer?.disconnect();
    
    Promise.resolve().then(() => {
        const scrollContainer = this.elementRef.nativeElement.querySelector('.schedule-scroll-container');
        if (!scrollContainer || this.dayColumns.length === 0) return;

        const options = {
            root: scrollContainer,
            threshold: 0.5,
        };

        this.observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    const index = Number(entry.target.getAttribute('data-index'));
                    this.mobileVisibleDayIndex.set(index);
                    return;
                }
            }
        }, options);

        this.dayColumns.forEach(col => this.observer!.observe(col.nativeElement));
    });
  }

  scrollToDay(index: number) {
    const column = this.dayColumns?.toArray()[index];
    if (column) {
      column.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
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

      this.shiftForm.set({
        employee_id: employeeId,
        role_assigned: employee?.role,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString()
      });
    }
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
  }

  updateShiftFormField(field: keyof Omit<Shift, 'id' | 'created_at' | 'user_id' | 'schedule_id' | 'start_time' | 'end_time' | 'is_day_off'>, value: string) {
      this.shiftForm.update(form => ({ ...form, [field]: value }));
  }

  updateShiftFormDateTime(field: 'start_time' | 'end_time', value: string) {
      this.shiftForm.update(form => ({ ...form, [field]: parseInputToISO(value) }));
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
  
  getApprovedLeave(day: Date, employee: Employee): LeaveRequest | undefined {
    const dateString = day.toISOString().split('T')[0];
    return this.approvedLeaveByDateAndEmployee().get(dateString)?.get(employee.id);
  }

  formatForInput(iso: string | null | undefined): string {
    return formatISOToInput(iso);
  }
}
