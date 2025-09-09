import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Employee, Schedule, Shift, TimeClockEntry } from '../../models/db.models';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { NotificationService } from '../../services/notification.service';
import { TimeClockService } from '../../services/time-clock.service';

interface PayrollData {
  employee: Employee;
  scheduledHours: number;
  workedHours: number;
  overtimeHours: number;
  basePay: number;
  overtimePay: number;
  totalPay: number;
}

@Component({
  selector: 'app-payroll',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe, DecimalPipe],
  templateUrl: './payroll.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PayrollComponent {
  private stateService = inject(SupabaseStateService);
  private timeClockService = inject(TimeClockService);
  private notificationService = inject(NotificationService);

  isLoading = signal(true);
  
  // Filter state
  selectedMonth = signal(new Date().getMonth());
  selectedYear = signal(new Date().getFullYear());
  
  // Data state
  timeEntriesForPeriod = signal<TimeClockEntry[]>([]);
  schedulesForPeriod = signal<Schedule[]>([]);
  
  availableYears = computed(() => {
    const currentYear = new Date().getFullYear();
    return [currentYear, currentYear - 1, currentYear - 2];
  });

  months = [
    { value: 0, name: 'Janeiro' }, { value: 1, name: 'Fevereiro' },
    { value: 2, name: 'Março' }, { value: 3, name: 'Abril' },
    { value: 4, name: 'Maio' }, { value: 5, name: 'Junho' },
    { value: 6, name: 'Julho' }, { value: 7, name: 'Agosto' },
    { value: 8, name: 'Setembro' }, { value: 9, name: 'Outubro' },
    { value: 10, name: 'Novembro' }, { value: 11, name: 'Dezembro' }
  ];

  constructor() {
    effect(() => {
      this.loadDataForPeriod();
    }, { allowSignalWrites: true });
  }

  async loadDataForPeriod() {
    this.isLoading.set(true);
    const year = this.selectedYear();
    const month = this.selectedMonth();

    const startDate = new Date(year, month, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

    const { data: entries, error: entriesError } = await this.timeClockService.getEntriesForPeriod(startDate, endDate, 'all');
    if (entriesError) {
      this.notificationService.show(`Erro ao carregar ponto: ${entriesError.message}`, 'error');
      this.timeEntriesForPeriod.set([]);
    } else {
      this.timeEntriesForPeriod.set(entries || []);
    }

    const allSchedules = this.stateService.schedules();
    const periodSchedules = allSchedules.filter(s => {
        const scheduleDate = new Date(s.week_start_date + 'T00:00:00');
        return scheduleDate.getFullYear() === year && scheduleDate.getMonth() === month;
    });
    this.schedulesForPeriod.set(periodSchedules);

    this.isLoading.set(false);
  }

  payrollData = computed<PayrollData[]>(() => {
    const employees = this.stateService.employees();
    const timeEntries = this.timeEntriesForPeriod();
    const schedules = this.schedulesForPeriod();

    return employees.map(employee => {
      // 1. Calculate Worked Hours
      const employeeEntries = timeEntries.filter(e => e.employee_id === employee.id);
      const totalWorkedMs = employeeEntries.reduce((acc, entry) => {
          if (!entry.clock_out_time) return acc;
          const start = new Date(entry.clock_in_time).getTime();
          const end = new Date(entry.clock_out_time).getTime();
          const totalDuration = end > start ? end - start : 0;
          let breakDuration = 0;
          if (entry.break_start_time && entry.break_end_time) {
              const breakStart = new Date(entry.break_start_time).getTime();
              const breakEnd = new Date(entry.break_end_time).getTime();
              if (breakEnd > breakStart) breakDuration = breakEnd - breakStart;
          }
          return acc + Math.max(0, totalDuration - breakDuration);
      }, 0);
      const workedHours = totalWorkedMs / (1000 * 60 * 60);

      // 2. Calculate Scheduled Hours
      const employeeShifts = schedules.flatMap(s => s.shifts).filter(sh => sh.employee_id === employee.id && !sh.is_day_off);
      const scheduledHours = employeeShifts.reduce((acc, shift) => {
          if (!shift.end_time) return acc;
          const start = new Date(shift.start_time).getTime();
          const end = new Date(shift.end_time).getTime();
          return acc + (end > start ? (end - start) / (1000 * 60 * 60) : 0);
      }, 0);

      // 3. Calculate Pay
      let basePay = 0, overtimePay = 0, overtimeHours = 0;
      const { salary_type, salary_rate, overtime_rate_multiplier } = employee;

      if (salary_type && salary_rate) {
          overtimeHours = Math.max(0, workedHours - scheduledHours);
          const regularHours = workedHours - overtimeHours;

          if (salary_type === 'mensal') {
              basePay = salary_rate;
              const effectiveHourlyRate = salary_rate / 220; // Standard Brazilian divisor for monthly salary
              overtimePay = overtimeHours * effectiveHourlyRate * (overtime_rate_multiplier || 1.5);
          } else { // horista
              basePay = regularHours * salary_rate;
              overtimePay = overtimeHours * salary_rate * (overtime_rate_multiplier || 1.5);
          }
      }

      return {
          employee,
          scheduledHours,
          workedHours,
          overtimeHours,
          basePay,
          overtimePay,
          totalPay: basePay + overtimePay
      };
    }).filter(p => p.workedHours > 0 || p.scheduledHours > 0); // Only show employees with activity
  });
  
  // Totals for the template
  totalScheduledHours = computed(() => this.payrollData().reduce((acc, p) => acc + p.scheduledHours, 0));
  totalWorkedHours = computed(() => this.payrollData().reduce((acc, p) => acc + p.workedHours, 0));
  totalOvertimeHours = computed(() => this.payrollData().reduce((acc, p) => acc + p.overtimeHours, 0));
  totalBasePay = computed(() => this.payrollData().reduce((acc, p) => acc + p.basePay, 0));
  totalOvertimePay = computed(() => this.payrollData().reduce((acc, p) => acc + p.overtimePay, 0));
  grandTotalPay = computed(() => this.payrollData().reduce((acc, p) => acc + p.totalPay, 0));

  printReport() {
    window.print();
  }
}