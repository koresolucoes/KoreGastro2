import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Employee, Schedule, Shift, TimeClockEntry, CompanyProfile } from '../../models/db.models';
// FIX: Import feature-specific state services
import { SettingsStateService } from '../../services/settings-state.service';
import { HrStateService } from '../../services/hr-state.service';
import { NotificationService } from '../../services/notification.service';
import { TimeClockService } from '../../services/time-clock.service';
import { PrintingService } from '../../services/printing.service';

interface PayrollData {
  employee: Employee & { role: string };
  scheduledHours: number;
  workedHours: number;
  overtimeHours: number;
  basePay: number;
  overtimePay: number;
  totalPay: number;
}

// Helper function to calculate effective work duration in milliseconds for a time entry
function calculateDurationInMs(entry: TimeClockEntry): number {
    if (!entry.clock_out_time) return 0;
    
    const start = new Date(entry.clock_in_time).getTime();
    const end = new Date(entry.clock_out_time).getTime();
    const totalDuration = end > start ? end - start : 0;
    
    let breakDuration = 0;
    if (entry.break_start_time && entry.break_end_time) {
        const breakStart = new Date(entry.break_start_time).getTime();
        const breakEnd = new Date(entry.break_end_time).getTime();
        if (breakEnd > breakStart) {
            breakDuration = breakEnd - breakStart;
        }
    }
    
    return Math.max(0, totalDuration - breakDuration);
}

@Component({
  selector: 'app-payroll',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe, DecimalPipe],
  templateUrl: './payroll.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PayrollComponent {
  // FIX: Inject feature-specific state services
  private settingsState = inject(SettingsStateService);
  private hrState = inject(HrStateService);
  private timeClockService = inject(TimeClockService);
  private notificationService = inject(NotificationService);
  private printingService = inject(PrintingService);

  isLoading = signal(true);
  
  // Filter state
  selectedMonth = signal(new Date().getMonth());
  selectedYear = signal(new Date().getFullYear());
  
  // Data state
  timeEntriesForPeriod = signal<TimeClockEntry[]>([]);
  schedulesForPeriod = signal<Schedule[]>([]);
  // FIX: Access state from the correct feature-specific service
  companyProfile = this.settingsState.companyProfile;
  
  // Payslip Modal State
  employeeForPayslip = signal<PayrollData | null>(null);

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

    // FIX: Access schedules from the correct state service
    const allSchedules = this.hrState.schedules();
    const periodSchedules = allSchedules.filter(s => {
        const scheduleDate = new Date(s.week_start_date + 'T00:00:00');
        return scheduleDate.getFullYear() === year && scheduleDate.getMonth() === month;
    });
    this.schedulesForPeriod.set(periodSchedules);

    this.isLoading.set(false);
  }

  payrollData = computed<PayrollData[]>(() => {
    // FIX: Access employees and roles from the correct state service
    const employees = this.hrState.employees();
    const timeEntries = this.timeEntriesForPeriod();
    const schedules = this.schedulesForPeriod();
    const rolesMap = new Map(this.hrState.roles().map(r => [r.id, r.name]));

    // Helper to get a unique week identifier (e.g., 202423 for 23rd week of 2024)
    const getWeekNumber = (d: Date): number => {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        // Calculate week number
        const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
        return d.getUTCFullYear() * 100 + weekNo;
    };

    return employees.map(employee => {
      const augmentedEmployee = {
        ...employee,
        role: employee.role_id ? rolesMap.get(employee.role_id) || 'Cargo Excluído' : 'Sem Cargo'
      };

      const employeeEntries = timeEntries.filter(e => e.employee_id === employee.id);

      // --- New Overtime Calculation (Daily and Weekly) ---
      let totalOvertimeMs = 0;
      const dailyRegularMsMap = new Map<string, number>(); // Key: YYYY-MM-DD, Value: regular ms
      const entriesByDay = new Map<string, TimeClockEntry[]>();
      
      // Group entries by day
      employeeEntries.forEach(entry => {
        const dayKey = new Date(entry.clock_in_time).toISOString().split('T')[0];
        if (!entriesByDay.has(dayKey)) entriesByDay.set(dayKey, []);
        entriesByDay.get(dayKey)!.push(entry);
      });

      // 1. Calculate daily overtime (anything over 9 hours a day)
      for (const [dayKey, dayEntries] of entriesByDay.entries()) {
          const dailyWorkedMs = dayEntries.reduce((acc, entry) => acc + calculateDurationInMs(entry), 0);
          const dailyOvertimeMs = Math.max(0, dailyWorkedMs - (9 * 60 * 60 * 1000));
          totalOvertimeMs += dailyOvertimeMs;
          dailyRegularMsMap.set(dayKey, dailyWorkedMs - dailyOvertimeMs);
      }
      
      // Group the remaining regular hours by week
      const weeklyRegularMsMap = new Map<number, number>(); // Key: week number, Value: regular ms
      for (const [dayKey, regularMs] of dailyRegularMsMap.entries()) {
          // Use noon UTC to avoid timezone issues when determining the week
          const weekKey = getWeekNumber(new Date(dayKey + 'T12:00:00Z'));
          weeklyRegularMsMap.set(weekKey, (weeklyRegularMsMap.get(weekKey) || 0) + regularMs);
      }

      // 2. Calculate weekly overtime (regular hours over 44 per week)
      for (const weeklyMs of weeklyRegularMsMap.values()) {
          const weeklyOvertimeMs = Math.max(0, weeklyMs - (44 * 60 * 60 * 1000));
          totalOvertimeMs += weeklyOvertimeMs;
      }
      // --- End New Overtime Calculation ---

      const totalWorkedMs = employeeEntries.reduce((acc, entry) => acc + calculateDurationInMs(entry), 0);
      const workedHours = totalWorkedMs / (1000 * 60 * 60);
      const overtimeHours = totalOvertimeMs / (1000 * 60 * 60);

      // Calculate Scheduled Hours (for display purposes only)
      const employeeShifts = schedules.flatMap(s => s.shifts).filter(sh => sh.employee_id === employee.id && !sh.is_day_off);
      const scheduledHours = employeeShifts.reduce((acc, shift) => {
          if (!shift.end_time) return acc;
          const start = new Date(shift.start_time).getTime();
          const end = new Date(shift.end_time).getTime();
          return acc + (end > start ? (end - start) / (1000 * 60 * 60) : 0);
      }, 0);

      // Calculate Pay
      let basePay = 0, overtimePay = 0;
      const { salary_type, salary_rate, overtime_rate_multiplier } = employee;

      if (salary_type && salary_rate) {
          const regularHours = workedHours - overtimeHours;

          if (salary_type === 'mensal') {
              // CLT DSR (Descanso Semanal Remunerado) consideration makes the divisor 220
              const effectiveHourlyRate = salary_rate / 220; 
              basePay = regularHours * effectiveHourlyRate;
              overtimePay = overtimeHours * effectiveHourlyRate * (overtime_rate_multiplier || 1.5);
          } else { // horista
              basePay = regularHours * salary_rate;
              overtimePay = overtimeHours * salary_rate * (overtime_rate_multiplier || 1.5);
          }
      }

      return {
          employee: augmentedEmployee,
          scheduledHours,
          workedHours,
          overtimeHours,
          basePay,
          overtimePay,
          totalPay: basePay + overtimePay
      };
    }).filter(p => p.workedHours > 0 || p.scheduledHours > 0);
  });
  
  // Totals for the template
  totalScheduledHours = computed(() => this.payrollData().reduce((acc, p) => acc + p.scheduledHours, 0));
  totalWorkedHours = computed(() => this.payrollData().reduce((acc, p) => acc + p.workedHours, 0));
  totalOvertimeHours = computed(() => this.payrollData().reduce((acc, p) => acc + p.overtimeHours, 0));
  totalBasePay = computed(() => this.payrollData().reduce((acc, p) => acc + p.basePay, 0));
  totalOvertimePay = computed(() => this.payrollData().reduce((acc, p) => acc + p.overtimePay, 0));
  grandTotalPay = computed(() => this.payrollData().reduce((acc, p) => acc + p.totalPay, 0));
  
  // --- Payslip Computeds (Simulated values) ---
  
  payslipReferenceMonth = computed(() => {
    const monthName = this.months[this.selectedMonth()].name;
    const year = this.selectedYear();
    return `${monthName}/${year}`;
  });
  
  payslipNormalHoursWorked = computed(() => {
    const data = this.employeeForPayslip();
    if (!data) return 0;
    return data.workedHours - data.overtimeHours;
  });

  payslipINSS = computed(() => (this.employeeForPayslip()?.basePay ?? 0) * 0.09); // Simplified 9%
  payslipVT = computed(() => (this.employeeForPayslip()?.basePay ?? 0) * 0.06); // Simplified 6%
  payslipTotalProventos = computed(() => (this.employeeForPayslip()?.totalPay ?? 0));
  payslipTotalDescontos = computed(() => this.payslipINSS() + this.payslipVT());
  payslipLiquido = computed(() => this.payslipTotalProventos() - this.payslipTotalDescontos());
  payslipBaseFGTS = computed(() => this.payslipTotalProventos());
  payslipFGTSMes = computed(() => this.payslipBaseFGTS() * 0.08);

  openPayslip(data: PayrollData) {
    this.employeeForPayslip.set(data);
  }
  
  closePayslip() {
    this.employeeForPayslip.set(null);
  }

  printPayslip() {
    const payslipElement = document.querySelector('.payslip-printable-area');
    if (payslipElement) {
      const payslipData = this.employeeForPayslip();
      const employeeName = payslipData?.employee.name || 'Funcionário';
      this.printingService.printPayslip(payslipElement.outerHTML, employeeName);
    } else {
      this.notificationService.show('Não foi possível encontrar o conteúdo do contracheque para impressão.', 'error');
    }
  }

  printReport() {
    window.print();
  }
  
  totalHours = computed(() => {
    const totalMilliseconds = this.timeEntriesForPeriod()
        .reduce((sum, entry) => {
            const duration = calculateDurationInMs(entry);
            return sum + duration;
        }, 0);
    
    return totalMilliseconds / (1000 * 60 * 60); // Convert to hours
  });

  formatDuration(durationMs: number): string {
    if (durationMs <= 0) return '00:00:00';

    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  getFormattedDuration(entry: TimeClockEntry): string {
    if (!entry.clock_out_time) return 'Em andamento';
    const durationMs = calculateDurationInMs(entry);
    return this.formatDuration(durationMs);
  }
}
