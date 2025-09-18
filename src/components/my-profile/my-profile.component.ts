import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { TimeClockEntry, Transaction, Schedule, Shift, LeaveRequest, CompanyProfile } from '../../models/db.models';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { OperationalAuthService } from '../../services/operational-auth.service';
import { supabase } from '../../services/supabase-client';
import { NotificationService } from '../../services/notification.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-my-profile',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe],
  templateUrl: './my-profile.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyProfileComponent implements OnInit {
  private operationalAuthService = inject(OperationalAuthService);
  private stateService = inject(SupabaseStateService);
  private notificationService = inject(NotificationService);
  
  isLoading = signal(true);
  
  // Static data from state
  activeEmployee = this.operationalAuthService.activeEmployee;
  companyProfile = this.stateService.companyProfile;
  
  // Dynamic data fetched for this page
  timeEntriesThisMonth = signal<TimeClockEntry[]>([]);
  transactionsThisMonth = signal<Transaction[]>([]);
  scheduleThisWeek = signal<Schedule | null>(null);

  // Subscription data
  currentPlan = this.stateService.currentPlan;
  subscription = this.stateService.subscription;
  trialDaysRemaining = this.stateService.trialDaysRemaining;
  isPlanModalOpen = signal(false);
  
  myLeaveRequests = computed(() => {
    const empId = this.activeEmployee()?.id;
    if (!empId) return [];
    return this.stateService.leaveRequests()
      .filter(r => r.employee_id === empId)
      .sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5); // Show last 5 requests
  });

  ngOnInit() {
    this.loadProfileData();
  }

  private getStartOfWeek(date: Date): string {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    return new Date(d.setDate(diff)).toISOString().split('T')[0];
  }

  async loadProfileData() {
    this.isLoading.set(true);
    const employee = this.activeEmployee();
    if (!employee) {
      this.isLoading.set(false);
      return;
    }

    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
    const weekStart = this.getStartOfWeek(today);

    try {
      const [entriesRes, transactionsRes, scheduleRes] = await Promise.all([
        supabase.from('time_clock_entries').select('*')
          .eq('employee_id', employee.id)
          .gte('clock_in_time', monthStart.toISOString())
          .lte('clock_in_time', monthEnd.toISOString()),
        supabase.from('transactions').select('*')
          .eq('employee_id', employee.id)
          .gte('date', monthStart.toISOString())
          .lte('date', monthEnd.toISOString()),
        supabase.from('schedules').select('*, shifts(*)')
          .eq('week_start_date', weekStart)
          .maybeSingle()
      ]);
      
      if (entriesRes.error) throw entriesRes.error;
      this.timeEntriesThisMonth.set(entriesRes.data || []);
      
      if (transactionsRes.error) throw transactionsRes.error;
      this.transactionsThisMonth.set(transactionsRes.data || []);

      if (scheduleRes.error && scheduleRes.error.code !== 'PGRST116') throw scheduleRes.error;
      this.scheduleThisWeek.set(scheduleRes.data || null);

    } catch (error: any) {
        this.notificationService.show(`Erro ao carregar dados do perfil: ${error.message}`, 'error');
    } finally {
        this.isLoading.set(false);
    }
  }
  
  private calculateDurationInMs(entry: TimeClockEntry): number {
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

  workedHoursSummary = computed(() => {
    const entries = this.timeEntriesThisMonth();
    const totalMs = entries.reduce((sum, entry) => sum + this.calculateDurationInMs(entry), 0);
    const totalHours = totalMs / (1000 * 60 * 60);
    // Simplified overtime calculation for summary
    const overtimeHours = 0; 
    return {
      workedHours: totalHours,
      overtimeHours: overtimeHours
    };
  });

  paymentSummary = computed(() => {
    const transactions = this.transactionsThisMonth();
    const totalTips = transactions.filter(t => t.type === 'Gorjeta').reduce((sum, t) => sum + t.amount, 0);
    return { totalTips };
  });

  shiftsThisWeek = computed(() => {
    const schedule = this.scheduleThisWeek();
    const employeeId = this.activeEmployee()?.id;
    if (!schedule || !employeeId) return [];
    
    return schedule.shifts
      .filter(shift => shift.employee_id === employeeId)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  });

  getLeaveStatusClass(status: string): string {
    switch (status) {
      case 'Pendente': return 'bg-yellow-500/20 text-yellow-300';
      case 'Aprovada': return 'bg-green-500/20 text-green-300';
      case 'Rejeitada': return 'bg-red-500/20 text-red-300';
      default: return 'bg-gray-500/20 text-gray-300';
    }
  }
}