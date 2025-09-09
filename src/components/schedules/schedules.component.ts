import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, AfterViewInit, OnDestroy, QueryList, ViewChildren, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Employee, Schedule, Shift } from '../../models/db.models';
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
  employees = this.stateService.employees;
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

  shiftsByDay = computed(() => {
    const allShifts = this.activeSchedule()?.shifts ?? [];
    const employee = this.operationalAuthService.activeEmployee();

    const shiftsToDisplay = (employee && !this.isManager())
      ? allShifts.filter(shift => shift.employee_id === employee.id)
      : allShifts;

    const days = this.weekDays();
    const map = new Map<string, Shift[]>();

    days.forEach(day => {
        map.set(day.toISOString().split('T')[0], []);
    });

    shiftsToDisplay.forEach(shift => {
        const shiftDate = new Date(shift.start_time).toISOString().split('T')[0];
        if(map.has(shiftDate)) {
            map.get(shiftDate)!.push(shift);
        }
    });
    
    // Sort shifts within each day
    map.forEach(dayShifts => dayShifts.sort((a,b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()));

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
      
      // Only managers can create a new schedule record by navigating to a week that doesn't have one.
      if (this.isManager()) {
        this.isLoading.set(true);
        this.scheduleDataService.getOrCreateScheduleForDate(date).then(({ error }) => {
          if (error) {
            this.notificationService.alert(`Erro ao carregar ou criar escala: ${error.message}`);
          }
          this.isLoading.set(false);
        });
      } else {
        // Non-managers can only view existing schedules, which are loaded in SupabaseStateService.
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
    
    // Defer setup to ensure DOM elements are available.
    Promise.resolve().then(() => {
        const scrollContainer = this.elementRef.nativeElement.querySelector('.schedule-scroll-container');
        if (!scrollContainer || this.dayColumns.length === 0) return;

        const options = {
            root: scrollContainer,
            threshold: 0.5, // Trigger when 50% of the day column is visible
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
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    return new Date(d.setDate(diff)).toISOString().split('T')[0];
  }

  changeWeek(direction: number) {
    const current = new Date(this.weekStartDate() + 'T00:00:00');
    current.setDate(current.getDate() + (7 * direction));
    this.weekStartDate.set(this.getStartOfWeek(current));
  }
  
  handleDateChange(event: Event) {
    const weekValue = (event.target as HTMLInputElement).value; // "YYYY-Www"
    if (!weekValue) return;

    const [year, week] = weekValue.split('-W').map(Number);
    
    // Get a date roughly in the middle of the week (e.g., the 4th day) to avoid edge cases
    const dayInWeek = new Date(year, 0, 4 + (week - 1) * 7);

    this.weekStartDate.set(this.getStartOfWeek(dayInWeek));
  }

  openShiftModal(day: Date, shift: Shift | null = null) {
    if (!this.isManager()) return;

    if (this.activeSchedule()?.is_published) {
      this.notificationService.alert('A escala está publicada e não pode ser editada. Cancele a publicação para fazer alterações.');
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

      this.shiftForm.set({
        employee_id: this.employees()[0]?.id,
        role_assigned: this.employees()[0]?.role,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString()
      });
    }
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
  }

  updateShiftFormField(field: keyof Omit<Shift, 'id' | 'created_at' | 'user_id' | 'schedule_id' | 'start_time' | 'end_time'>, value: string) {
      this.shiftForm.update(form => ({ ...form, [field]: value }));
      if (field === 'employee_id') {
          const emp = this.employees().find(e => e.id === value);
          if (emp) {
            this.shiftForm.update(form => ({...form, role_assigned: emp.role}));
          }
      }
  }

  updateShiftFormDateTime(field: 'start_time' | 'end_time', value: string) {
      this.shiftForm.update(form => ({ ...form, [field]: parseInputToISO(value) }));
  }

  async saveShift() {
    const schedule = this.activeSchedule();
    const form = this.shiftForm();

    if (!schedule || !form.employee_id || !form.start_time || !form.end_time) {
      this.notificationService.alert('Preencha todos os campos obrigatórios.');
      return;
    }
    
    const { success, error } = await this.scheduleDataService.saveShift(schedule.id, form);
    if(success) {
      this.closeModal();
    } else {
      this.notificationService.alert(`Erro ao salvar turno: ${error?.message}`);
    }
  }
  
  async deleteShift(shiftId: string) {
    const confirmed = await this.notificationService.confirm('Deseja realmente excluir este turno?');
    if (confirmed) {
        const { success, error } = await this.scheduleDataService.deleteShift(shiftId);
        if(!success) this.notificationService.alert(`Erro ao excluir turno: ${error?.message}`);
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

  formatForInput(iso: string | null | undefined): string {
    return formatISOToInput(iso);
  }
}
