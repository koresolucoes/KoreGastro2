import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Employee, LeaveRequest, LeaveRequestStatus, LeaveRequestType } from '../../models/db.models';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { LeaveDataService } from '../../services/leave-data.service';
import { NotificationService } from '../../services/notification.service';

type LeaveForm = Partial<Omit<LeaveRequest, 'id' | 'created_at' | 'updated_at' | 'user_id'>>;

@Component({
  selector: 'app-leave-management',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './leave-management.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DatePipe]
})
export class LeaveManagementComponent {
  stateService = inject(SupabaseStateService);
  leaveDataService = inject(LeaveDataService);
  notificationService = inject(NotificationService);
  datePipe = inject(DatePipe);

  // Data
  leaveRequests = this.stateService.leaveRequests;
  employees = this.stateService.employees;

  // View State
  activeTab = signal<LeaveRequestStatus>('Pendente');
  
  // Modal State
  isModalOpen = signal(false);
  editingRequest = signal<LeaveRequest | null>(null);
  requestForm = signal<LeaveForm>({});

  availableRequestTypes: LeaveRequestType[] = ['Férias', 'Folga', 'Falta Justificada', 'Atestado'];

  pendingRequests = computed(() => this.leaveRequests().filter(r => r.status === 'Pendente'));
  approvedRequests = computed(() => this.leaveRequests().filter(r => r.status === 'Aprovada'));
  rejectedRequests = computed(() => this.leaveRequests().filter(r => r.status === 'Rejeitada'));

  currentList = computed(() => {
    switch(this.activeTab()) {
      case 'Pendente': return this.pendingRequests();
      case 'Aprovada': return this.approvedRequests();
      case 'Rejeitada': return this.rejectedRequests();
    }
  });

  openAddModal() {
    this.editingRequest.set(null);
    this.requestForm.set({
      employee_id: this.employees()[0]?.id,
      request_type: 'Falta Justificada',
      status: 'Aprovada',
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date().toISOString().split('T')[0],
      reason: ''
    });
    this.isModalOpen.set(true);
  }

  openEditModal(request: LeaveRequest) {
    this.editingRequest.set(request);
    this.requestForm.set({
      employee_id: request.employee_id,
      request_type: request.request_type,
      status: request.status,
      start_date: request.start_date,
      end_date: request.end_date,
      reason: request.reason,
      manager_notes: request.manager_notes
    });
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
  }

  updateFormField(field: keyof LeaveForm, value: string) {
    this.requestForm.update(form => ({ ...form, [field]: value }));
  }

  async saveRequest() {
    const form = this.requestForm();
    if (!form.employee_id || !form.start_date || !form.end_date || !form.request_type) {
      await this.notificationService.alert('Preencha todos os campos obrigatórios.');
      return;
    }
    
    let result;
    if (this.editingRequest()) {
      result = await this.leaveDataService.updateLeaveRequest(this.editingRequest()!.id, form);
    } else {
      result = await this.leaveDataService.addLeaveRequest(form);
    }
    
    if (result.success) {
      this.closeModal();
    } else {
      await this.notificationService.alert(`Erro ao salvar: ${result.error.message}`);
    }
  }

  async handleRequest(request: LeaveRequest, action: 'Aprovada' | 'Rejeitada') {
    const title = `${action === 'Aprovada' ? 'Aprovar' : 'Rejeitar'} Solicitação`;
    const message = `Adicione uma observação (opcional) para ${request.employees?.name}.`;
    const confirmText = action === 'Aprovada' ? 'Aprovar' : 'Rejeitar';
    
    const { confirmed, value: notes } = await this.notificationService.prompt(
      message,
      title,
      {
        inputType: 'textarea',
        placeholder: 'Escreva sua observação aqui...',
        initialValue: request.manager_notes || '',
        confirmText: confirmText,
      }
    );

    if (!confirmed) return;

    const { success, error } = await this.leaveDataService.updateLeaveRequest(request.id, {
      status: action,
      manager_notes: notes || null
    });

    if (!success) {
      await this.notificationService.alert(`Erro ao ${action === 'Aprovada' ? 'aprovar' : 'rejeitar'}: ${error.message}`);
    }
  }
  
  formatDateRange(start: string, end: string): string {
    if (start === end) {
      return this.datePipe.transform(start, 'dd/MM/yyyy') || '';
    }
    return `${this.datePipe.transform(start, 'dd/MM/yyyy')} - ${this.datePipe.transform(end, 'dd/MM/yyyy')}`;
  }
}
