
import { Component, ChangeDetectionStrategy, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Employee, TimeClockEntry } from '../../models/db.models';
import { HrStateService } from '../../services/hr-state.service';
import { SettingsDataService } from '../../services/settings-data.service';
import { NotificationService } from '../../services/notification.service';
import { FormsModule } from '@angular/forms';
import { EmployeeDetailsModalComponent } from './employee-details-modal/employee-details-modal.component';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { TimeClockService } from '../../services/time-clock.service';

@Component({
  selector: 'app-employees',
  standalone: true,
  imports: [CommonModule, FormsModule, EmployeeDetailsModalComponent],
  templateUrl: './employees.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmployeesComponent implements OnInit {
  private hrState = inject(HrStateService);
  private settingsDataService = inject(SettingsDataService);
  private notificationService = inject(NotificationService);
  private supabaseStateService = inject(SupabaseStateService);
  private timeClockService = inject(TimeClockService);

  employees = computed(() => {
    const rolesMap = new Map(this.hrState.roles().map(r => [r.id, r.name]));
    return this.hrState.employees().map(e => ({
      ...e,
      role: e.role_id ? rolesMap.get(e.role_id) || 'Cargo Excluído' : 'Sem Cargo'
    }));
  });
  
  roles = this.hrState.roles;
  leaveRequests = this.hrState.leaveRequests;
  
  // Dashboard Signals
  activeTimeEntries = signal<TimeClockEntry[]>([]);
  isLoadingDashboard = signal(true);

  employeeSearchTerm = signal('');
  isModalOpen = signal(false);
  editingEmployee = signal<Partial<Employee> | null>(null);
  employeeForm = signal<Partial<Employee>>({});
  employeePendingDeletion = signal<(Employee & { role: string }) | null>(null);
  photoFile = signal<File | null>(null);
  photoPreviewUrl = signal<string | null>(null);
  isDetailsModalOpen = signal(false);
  selectedEmployeeForDetails = signal<(Employee & { role: string }) | null>(null);

  // DASHBOARD COMPUTEDS
  workingNowCount = computed(() => this.activeTimeEntries().filter(e => !e.clock_out_time).length);
  pendingLeavesCount = computed(() => this.leaveRequests().filter(r => r.status === 'Pendente').length);
  
  alerts = computed(() => {
      const emps = this.employees();
      const alertsList: string[] = [];
      const today = new Date();
      const currentMonth = today.getMonth();
      const currentDay = today.getDate();

      emps.forEach(emp => {
          // Birthday check
          if (emp.birth_date) {
              const bday = new Date(emp.birth_date);
              if (bday.getMonth() === currentMonth) {
                  alertsList.push(`🎂 Aniversário de ${emp.name} em ${bday.getDate()}/${currentMonth + 1}`);
              }
          }
          // Probation check (e.g., 90 days from hire)
          if (emp.hire_date) {
             const hire = new Date(emp.hire_date);
             const diffTime = Math.abs(today.getTime() - hire.getTime());
             const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
             if (diffDays >= 80 && diffDays <= 90) {
                 alertsList.push(`📄 Contrato de experiência de ${emp.name} vencendo (${diffDays} dias)`);
             }
          }
      });
      return alertsList;
  });

  filteredEmployees = computed(() => {
    const term = this.employeeSearchTerm().toLowerCase();
    if (!term) return this.employees();
    return this.employees().filter(e => e.name.toLowerCase().includes(term) || e.role.toLowerCase().includes(term));
  });

  ngOnInit() {
    this.supabaseStateService.loadBackOfficeData();
    this.loadDashboardData();
  }

  async loadDashboardData() {
      this.isLoadingDashboard.set(true);
      const today = new Date().toISOString().split('T')[0];
      // Get entries for today to see who is clocked in
      const { data } = await this.timeClockService.getEntriesForPeriod(today, today, 'all');
      if (data) {
          // Filter only those without clock out time
          this.activeTimeEntries.set(data.filter(e => !e.clock_out_time));
      }
      this.isLoadingDashboard.set(false);
  }
  
  openDetailsModal(employee: Employee & { role: string }) {
    this.selectedEmployeeForDetails.set(employee);
    this.isDetailsModalOpen.set(true);
  }

  openAddModal() {
    this.employeeForm.set({ role_id: this.roles()[0]?.id || null, pin: '', bank_details: {} });
    this.editingEmployee.set(null);
    this.photoFile.set(null);
    this.photoPreviewUrl.set(null);
    this.isModalOpen.set(true);
  }

  openEditModal(e: Employee) {
    this.editingEmployee.set(e);
    this.employeeForm.set({ ...e, bank_details: e.bank_details || {} });
    this.photoFile.set(null);
    this.photoPreviewUrl.set(e.photo_url || null);
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
    this.photoFile.set(null);
    this.photoPreviewUrl.set(null);
  }

  handlePhotoFileChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.photoFile.set(file);
      const reader = new FileReader();
      reader.onload = (e) => this.photoPreviewUrl.set(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  }

  updateEmployeeFormField(field: keyof Omit<Employee, 'id' | 'created_at' | 'bank_details' | 'roles'>, value: string) {
    this.employeeForm.update(form => {
      const newForm = { ...form };
      if (field === 'pin' && value.length > 4) return form;

      if (field === 'salary_rate' || field === 'overtime_rate_multiplier') {
        const numValue = parseFloat(value);
        (newForm as any)[field] = isNaN(numValue) ? null : numValue;
      } else {
        (newForm as any)[field] = value === '' || value === 'null' ? null : value;
      }
      return newForm;
    });
  }
  
  updateBankDetailsField(field: keyof NonNullable<Employee['bank_details']>, value: string) {
    this.employeeForm.update(form => ({
        ...form,
        bank_details: {
            ...(form.bank_details || {}),
            [field]: value
        }
    }));
  }

  async saveEmployee() {
    const form = this.employeeForm();
    if (!form.name?.trim()) {
      await this.notificationService.alert('O nome do funcionário é obrigatório.');
      return;
    }
     if (!form.role_id) {
      await this.notificationService.alert('O cargo é obrigatório.');
      return;
    }
    if (form.pin && form.pin.length !== 4) {
      await this.notificationService.alert('O PIN deve ter exatamente 4 dígitos.');
      return;
    }

    let res;
    if (this.editingEmployee()) {
      res = await this.settingsDataService.updateEmployee({ ...form, id: this.editingEmployee()!.id }, this.photoFile());
    } else {
      res = await this.settingsDataService.addEmployee(form as any, this.photoFile());
    }
    if (res.success) {
      this.closeModal();
    } else {
      await this.notificationService.alert(`Falha ao salvar funcionário: ${res.error?.message}`);
    }
  }

  requestDeleteEmployee(e: Employee & { role: string }) {
    this.employeePendingDeletion.set(e);
  }

  cancelDeleteEmployee() {
    this.employeePendingDeletion.set(null);
  }

  async confirmDeleteEmployee() {
    const employee = this.employeePendingDeletion();
    if (!employee) return;
    const { success, error } = await this.settingsDataService.deleteEmployee(employee.id);
    if (!success) {
      await this.notificationService.alert(`Falha ao deletar funcionário: ${error?.message}`);
    }
    this.employeePendingDeletion.set(null);
  }
  
  async createNewRole() {
    const { confirmed, value: roleName } = await this.notificationService.prompt(
      'Qual o nome do novo cargo?',
      'Criar Novo Cargo',
      { placeholder: 'Ex: Garçom Chefe' }
    );

    if (confirmed && roleName) {
      const { success, error, data: newRole } = await this.settingsDataService.addRole(roleName);
      if (success && newRole) {
        this.notificationService.show('Cargo criado! Acesse as Configurações para definir as permissões.', 'success');
        this.updateEmployeeFormField('role_id', newRole.id);
      } else {
        this.notificationService.show(`Erro ao criar cargo: ${error?.message}`, 'error');
      }
    }
  }
}
