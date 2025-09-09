import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { LeaveRequest, LeaveRequestStatus, LeaveRequestType } from '../../models/db.models';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { LeaveDataService } from '../../services/leave-data.service';
import { NotificationService } from '../../services/notification.service';
import { OperationalAuthService } from '../../services/operational-auth.service';

type LeaveForm = Partial<Omit<LeaveRequest, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'status' | 'manager_notes' | 'employees'>>;

@Component({
  selector: 'app-my-leave',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './my-leave.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DatePipe]
})
export class MyLeaveComponent {
  stateService = inject(SupabaseStateService);
  leaveDataService = inject(LeaveDataService);
  notificationService = inject(NotificationService);
  operationalAuthService = inject(OperationalAuthService);
  datePipe = inject(DatePipe);

  // Data
  activeEmployee = this.operationalAuthService.activeEmployee;

  // Modal State
  isModalOpen = signal(false);
  requestForm = signal<LeaveForm>({});
  
  availableRequestTypes: LeaveRequestType[] = ['Férias', 'Folga', 'Falta Justificada', 'Atestado'];

  myLeaveRequests = computed(() => {
    const employeeId = this.activeEmployee()?.id;
    if (!employeeId) return [];
    return this.stateService.leaveRequests()
      .filter(r => r.employee_id === employeeId)
      .sort((a,b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
  });

  openRequestModal() {
    this.requestForm.set({
      employee_id: this.activeEmployee()?.id,
      request_type: 'Folga',
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date().toISOString().split('T')[0],
      reason: ''
    });
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
  }

  updateFormField(field: keyof LeaveForm, value: string) {
    this.requestForm.update(form => ({ ...form, [field]: value }));
  }

  async submitRequest() {
    const form = this.requestForm();
    if (!form.employee_id || !form.start_date || !form.end_date || !form.request_type) {
      await this.notificationService.alert('Preencha todos os campos obrigatórios.');
      return;
    }

    const requestData: Partial<LeaveRequest> = {
      ...form,
      status: 'Pendente' // All employee requests start as pending
    };

    const { success, error } = await this.leaveDataService.addLeaveRequest(requestData);
    
    if (success) {
      this.closeModal();
      await this.notificationService.alert('Solicitação enviada com sucesso!', 'Sucesso');
    } else {
      await this.notificationService.alert(`Erro ao enviar solicitação: ${error.message}`);
    }
  }

  getStatusClass(status: LeaveRequestStatus): string {
    switch (status) {
      case 'Pendente': return 'bg-yellow-500/20 text-yellow-300';
      case 'Aprovada': return 'bg-green-500/20 text-green-300';
      case 'Rejeitada': return 'bg-red-500/20 text-red-300';
      default: return 'bg-gray-500/20 text-gray-300';
    }
  }
  
  formatDateRange(start: string, end: string): string {
    const startDate = new Date(start + 'T00:00:00'); // Treat as local
    const endDate = new Date(end + 'T00:00:00');   // Treat as local
    
    if (start === end) {
      return this.datePipe.transform(startDate, 'dd/MM/yyyy') || '';
    }
    return `${this.datePipe.transform(startDate, 'dd/MM/yyyy')} - ${this.datePipe.transform(endDate, 'dd/MM/yyyy')}`;
  }
}
