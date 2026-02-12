
import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { Employee, Schedule, Shift, TimeClockEntry, CompanyProfile, PayrollAdjustment } from '../../models/db.models';
import { SettingsStateService } from '../../services/settings-state.service';
import { HrStateService } from '../../services/hr-state.service';
import { NotificationService } from '../../services/notification.service';
import { TimeClockService } from '../../services/time-clock.service';
import { PrintingService } from '../../services/printing.service';
import { PayrollService } from '../../services/payroll.service';
import { FormsModule } from '@angular/forms';

interface PayrollData {
  employee: Employee & { role: string };
  scheduledHours: number;
  workedHours: number;
  overtimeHours: number;
  basePay: number;
  overtimePay: number;
  adjustmentsTotal: number;
  totalPay: number;
}

function calculateDurationInMs(entry: TimeClockEntry): number {
    if (!entry.clock_out_time) return 0;
    const start = new Date(entry.clock_in_time).getTime();
    const end = new Date(entry.clock_out_time).getTime();
    const totalDuration = end > start ? end - start : 0;
    let breakDuration = 0;
    if (entry.break_start_time && entry.break_end_time) {
        const breakStart = new Date(entry.break_start_time).getTime();
        const breakEnd = new Date(entry.break_end_time).getTime();
        if (breakEnd > breakStart) breakDuration = breakEnd - breakStart;
    }
    return Math.max(0, totalDuration - breakDuration);
}

@Component({
  selector: 'app-payroll',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DecimalPipe, FormsModule],
  templateUrl: './payroll.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PayrollComponent {
  private settingsState = inject(SettingsStateService);
  private hrState = inject(HrStateService);
  private timeClockService = inject(TimeClockService);
  private notificationService = inject(NotificationService);
  private printingService = inject(PrintingService);
  private payrollService = inject(PayrollService);

  isLoading = signal(true);
  
  selectedMonth = signal(new Date().getMonth());
  selectedYear = signal(new Date().getFullYear());
  
  timeEntriesForPeriod = signal<TimeClockEntry[]>([]);
  schedulesForPeriod = signal<Schedule[]>([]);
  adjustmentsForPeriod = signal<PayrollAdjustment[]>([]);
  companyProfile = this.settingsState.companyProfile;
  
  employeeForPayslip = signal<PayrollData | null>(null);
  
  // Adjustment Modal
  isAdjustmentModalOpen = signal(false);
  adjustmentForm = signal<{ employeeId: string, type: 'BONUS' | 'DEDUCTION', description: string, amount: number }>({
      employeeId: '', type: 'BONUS', description: '', amount: 0
  });

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

  periodString = computed(() => {
      return `${(this.selectedMonth() + 1).toString().padStart(2, '0')}/${this.selectedYear()}`;
  });

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
    const period = this.periodString();

    const [entriesRes, adjustmentsRes] = await Promise.all([
         this.timeClockService.getEntriesForPeriod(startDate, endDate, 'all'),
         this.payrollService.getAdjustments(period)
    ]);
    
    if (entriesRes.error) {
      this.notificationService.show(`Erro ao carregar ponto: ${entriesRes.error.message}`, 'error');
      this.timeEntriesForPeriod.set([]);
    } else {
      this.timeEntriesForPeriod.set(entriesRes.data || []);
    }
    
    this.adjustmentsForPeriod.set(adjustmentsRes.data || []);

    const allSchedules = this.hrState.schedules();
    const periodSchedules = allSchedules.filter(s => {
        const scheduleDate = new Date(s.week_start_date + 'T00:00:00');
        return scheduleDate.getFullYear() === year && scheduleDate.getMonth() === month;
    });
    this.schedulesForPeriod.set(periodSchedules);

    this.isLoading.set(false);
  }

  payrollData = computed<PayrollData[]>(() => {
    const employees = this.hrState.employees();
    const timeEntries = this.timeEntriesForPeriod();
    const schedules = this.schedulesForPeriod();
    const adjustments = this.adjustmentsForPeriod();
    const rolesMap = new Map(this.hrState.roles().map(r => [r.id, r.name]));

    const getWeekNumber = (d: Date): number => {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
        return d.getUTCFullYear() * 100 + weekNo;
    };

    return employees.map(employee => {
      const augmentedEmployee = {
        ...employee,
        role: employee.role_id ? rolesMap.get(employee.role_id) || 'Cargo Excluído' : 'Sem Cargo'
      };

      const employeeEntries = timeEntries.filter(e => e.employee_id === employee.id);
      
      // Calculate Adjustments
      const employeeAdjustments = adjustments.filter(a => a.employee_id === employee.id);
      const adjustmentsTotal = employeeAdjustments.reduce((sum, a) => {
          return sum + (a.type === 'BONUS' ? a.amount : -a.amount);
      }, 0);

      // --- Overtime Calculation ---
      let totalOvertimeMs = 0;
      const dailyRegularMsMap = new Map<string, number>(); 
      const entriesByDay = new Map<string, TimeClockEntry[]>();
      
      employeeEntries.forEach(entry => {
        const dayKey = new Date(entry.clock_in_time).toISOString().split('T')[0];
        if (!entriesByDay.has(dayKey)) entriesByDay.set(dayKey, []);
        entriesByDay.get(dayKey)!.push(entry);
      });

      for (const [dayKey, dayEntries] of entriesByDay.entries()) {
          const dailyWorkedMs = dayEntries.reduce((acc, entry) => acc + calculateDurationInMs(entry), 0);
          const dailyOvertimeMs = Math.max(0, dailyWorkedMs - (9 * 60 * 60 * 1000));
          totalOvertimeMs += dailyOvertimeMs;
          dailyRegularMsMap.set(dayKey, dailyWorkedMs - dailyOvertimeMs);
      }
      
      const weeklyRegularMsMap = new Map<number, number>(); 
      for (const [dayKey, regularMs] of dailyRegularMsMap.entries()) {
          const weekKey = getWeekNumber(new Date(dayKey + 'T12:00:00Z'));
          weeklyRegularMsMap.set(weekKey, (weeklyRegularMsMap.get(weekKey) || 0) + regularMs);
      }

      for (const weeklyMs of weeklyRegularMsMap.values()) {
          const weeklyOvertimeMs = Math.max(0, weeklyMs - (44 * 60 * 60 * 1000));
          totalOvertimeMs += weeklyOvertimeMs;
      }

      const totalWorkedMs = employeeEntries.reduce((acc, entry) => acc + calculateDurationInMs(entry), 0);
      const workedHours = totalWorkedMs / (1000 * 60 * 60);
      const overtimeHours = totalOvertimeMs / (1000 * 60 * 60);

      const employeeShifts = schedules.flatMap(s => s.shifts).filter(sh => sh.employee_id === employee.id && !sh.is_day_off);
      const scheduledHours = employeeShifts.reduce((acc, shift) => {
          if (!shift.end_time) return acc;
          const start = new Date(shift.start_time).getTime();
          const end = new Date(shift.end_time).getTime();
          return acc + (end > start ? (end - start) / (1000 * 60 * 60) : 0);
      }, 0);

      let basePay = 0, overtimePay = 0;
      const { salary_type, salary_rate, overtime_rate_multiplier } = employee;

      if (salary_type && salary_rate) {
          const regularHours = workedHours - overtimeHours;
          if (salary_type === 'mensal') {
              const effectiveHourlyRate = salary_rate / 220; 
              basePay = salary_rate; // Fixed monthly salary
              overtimePay = overtimeHours * effectiveHourlyRate * (overtime_rate_multiplier || 1.5);
          } else { 
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
          adjustmentsTotal,
          totalPay: basePay + overtimePay + adjustmentsTotal
      };
    }).filter(p => p.workedHours > 0 || p.scheduledHours > 0 || p.adjustmentsTotal !== 0);
  });
  
  // Totals
  totalScheduledHours = computed(() => this.payrollData().reduce((acc, p) => acc + p.scheduledHours, 0));
  totalWorkedHours = computed(() => this.payrollData().reduce((acc, p) => acc + p.workedHours, 0));
  totalOvertimeHours = computed(() => this.payrollData().reduce((acc, p) => acc + p.overtimeHours, 0));
  totalBasePay = computed(() => this.payrollData().reduce((acc, p) => acc + p.basePay, 0));
  totalOvertimePay = computed(() => this.payrollData().reduce((acc, p) => acc + p.overtimePay, 0));
  totalAdjustments = computed(() => this.payrollData().reduce((acc, p) => acc + p.adjustmentsTotal, 0));
  grandTotalPay = computed(() => this.payrollData().reduce((acc, p) => acc + p.totalPay, 0));
  
  // Payslip Computeds
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

  payslipAdjustments = computed(() => {
      const data = this.employeeForPayslip();
      if (!data) return [];
      return this.adjustmentsForPeriod().filter(a => a.employee_id === data.employee.id);
  });

  payslipINSS = computed(() => (this.employeeForPayslip()?.basePay ?? 0) * 0.09); 
  payslipVT = computed(() => (this.employeeForPayslip()?.basePay ?? 0) * 0.06); 
  
  // Update total proventos/descontos to consider adjustments
  payslipTotalProventos = computed(() => {
      const data = this.employeeForPayslip();
      if (!data) return 0;
      const bonusTotal = this.payslipAdjustments().filter(a => a.type === 'BONUS').reduce((sum, a) => sum + a.amount, 0);
      return data.basePay + data.overtimePay + bonusTotal;
  });

  payslipTotalDescontos = computed(() => {
      const deductionTotal = this.payslipAdjustments().filter(a => a.type === 'DEDUCTION').reduce((sum, a) => sum + a.amount, 0);
      return this.payslipINSS() + this.payslipVT() + deductionTotal;
  });

  payslipLiquido = computed(() => this.payslipTotalProventos() - this.payslipTotalDescontos());
  payslipBaseFGTS = computed(() => this.payslipTotalProventos());
  payslipFGTSMes = computed(() => this.payslipBaseFGTS() * 0.08);

  openPayslip(data: PayrollData) { this.employeeForPayslip.set(data); }
  closePayslip() { this.employeeForPayslip.set(null); }

  printPayslip() {
    const payslipElement = document.querySelector('.payslip-printable-area');
    if (payslipElement) {
      const payslipData = this.employeeForPayslip();
      const employeeName = payslipData?.employee.name || 'Funcionário';
      this.printingService.printPayslip(payslipElement.outerHTML, employeeName);
    }
  }

  printReport() { window.print(); }
  
  // Adjustment Modal
  openAdjustmentModal() {
      this.adjustmentForm.set({ employeeId: this.payrollData()[0]?.employee.id || '', type: 'BONUS', description: '', amount: 0 });
      this.isAdjustmentModalOpen.set(true);
  }

  closeAdjustmentModal() { this.isAdjustmentModalOpen.set(false); }

  updateAdjustmentForm(field: string, value: any) {
      this.adjustmentForm.update(f => ({ ...f, [field]: value }));
  }

  async saveAdjustment() {
      const form = this.adjustmentForm();
      if (!form.employeeId || !form.description || form.amount <= 0) {
          this.notificationService.show('Preencha todos os campos corretamente.', 'warning');
          return;
      }
      
      const { success, error } = await this.payrollService.addAdjustment({
          employee_id: form.employeeId,
          type: form.type,
          description: form.description,
          amount: form.amount,
          period: this.periodString()
      });

      if (success) {
          this.notificationService.show('Ajuste salvo!', 'success');
          this.closeAdjustmentModal();
          this.loadDataForPeriod();
      } else {
          this.notificationService.show(`Erro: ${error?.message}`, 'error');
      }
  }
}
