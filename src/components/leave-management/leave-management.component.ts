import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Employee, LeaveRequest, LeaveRequestStatus, LeaveRequestType } from '../../models/db.models';
// FIX: Import HrStateService to access HR-related data
import { HrStateService } from '../../services/hr-state.service';
import { LeaveDataService } from '../../services/leave-data.service';
import { NotificationService } from '../../services/notification.service';
import { LeaveRequestDetailsModalComponent } from './leave-request-details-modal/leave-request-details-modal.component';

type LeaveForm = Partial<Omit<LeaveRequest, 'id' | 'created_at' | 'updated_at' | 'user_id'>>;

@Component({
  selector: 'app-leave-management',
  standalone: true,
  imports: [CommonModule, LeaveRequestDetailsModalComponent],
  templateUrl: './leave-management.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DatePipe]
})
export class LeaveManagementComponent {
  // FIX: Inject HrStateService
  hrState = inject(HrStateService);
  leaveDataService = inject(LeaveDataService);
  notificationService = inject(NotificationService);
  // FIX: Add explicit type to injected pipe to resolve type inference issues.
  datePipe: DatePipe = inject(DatePipe);

  // Data
  // FIX: Access state from the correct feature-specific service
  leaveRequests = this.hrState.leaveRequests;
  employees = this.hrState.employees;

  // View State
  activeTab = signal<LeaveRequestStatus>('Pendente');
  
  // Modal State
  isModalOpen = signal(false);
  editingRequest = signal<LeaveRequest | null>(null);
  requestForm = signal<LeaveForm>({});

  // Modal State for details
  isDetailsModalOpen = signal(false);
  selectedRequestForDetails = signal<LeaveRequest | null>(null);

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

  openDetailsModal(request: LeaveRequest) {
    this.selectedRequestForDetails.set(request);
    this.isDetailsModalOpen.set(true);
  }

  closeDetailsModal() {
    this.isDetailsModalOpen.set(false);
    this.selectedRequestForDetails.set(null);
  }

  async handleRequest(request: LeaveRequest, action: 'Aprovada' | 'Rejeitada', notes: string | null) {
    const { success, error } = await this.leaveDataService.updateLeaveRequest(request.id, {
      status: action,
      manager_notes: notes || null
    });

    if (success) {
      this.notificationService.show(`Solicitação ${action === 'Aprovada' ? 'aprovada' : 'rejeitada'} com sucesso.`, 'success');
      this.closeDetailsModal();
    } else {
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
