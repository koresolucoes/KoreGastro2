import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { LeaveRequest, LeaveRequestStatus, LeaveRequestType } from '../../models/db.models';
// FIX: Import HrStateService to access HR-related data
import { HrStateService } from '../../services/hr-state.service';
import { LeaveDataService } from '../../services/leave-data.service';
import { NotificationService } from '../../services/notification.service';
import { OperationalAuthService } from '../../services/operational-auth.service';

type LeaveForm = Partial<Omit<LeaveRequest, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'status' | 'manager_notes' | 'employees' | 'attachment_url'>>;

@Component({
  selector: 'app-my-leave',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './my-leave.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DatePipe]
})
export class MyLeaveComponent {
  // FIX: Inject HrStateService
  hrState = inject(HrStateService);
  leaveDataService = inject(LeaveDataService);
  notificationService = inject(NotificationService);
  operationalAuthService = inject(OperationalAuthService);
  // FIX: Add explicit type to injected pipe to resolve type inference issues.
  datePipe: DatePipe = inject(DatePipe);

  // Data
  activeEmployee = this.operationalAuthService.activeEmployee;

  // Modal State
  isModalOpen = signal(false);
  requestForm = signal<LeaveForm>({});
  selectedFile = signal<File | null>(null);
  selectedFileName = computed(() => this.selectedFile()?.name);
  
  availableRequestTypes: LeaveRequestType[] = ['Férias', 'Folga', 'Falta Justificada', 'Atestado'];

  myLeaveRequests = computed(() => {
    const employeeId = this.activeEmployee()?.id;
    if (!employeeId) return [];
    // FIX: Access leaveRequests from the correct state service
    return this.hrState.leaveRequests()
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
    this.selectedFile.set(null);
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
  }
  
  handleFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
        this.selectedFile.set(input.files[0]);
    } else {
        this.selectedFile.set(null);
    }
  }

  updateFormField(field: keyof LeaveForm, value: string) {
    this.requestForm.update(form => ({ ...form, [field]: value }));
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]); // Get only base64 part
        reader.onerror = error => reject(error);
    });
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

    let attachmentPayload;
    if (this.selectedFile()) {
        const fileBase64 = await this.fileToBase64(this.selectedFile()!);
        attachmentPayload = {
            file: fileBase64,
            filename: this.selectedFile()!.name,
        };
    }

    const { success, error } = await this.leaveDataService.addLeaveRequest(requestData, attachmentPayload);
    
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
