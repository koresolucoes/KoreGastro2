import { Component, ChangeDetectionStrategy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Employee } from '../../models/db.models';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { SettingsDataService } from '../../services/settings-data.service';
import { NotificationService } from '../../services/notification.service';
import { FormsModule } from '@angular/forms';
import { EmployeeDetailsModalComponent } from './employee-details-modal/employee-details-modal.component';

@Component({
  selector: 'app-employees',
  standalone: true,
  imports: [CommonModule, FormsModule, EmployeeDetailsModalComponent],
  templateUrl: './employees.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmployeesComponent {
  private stateService = inject(SupabaseStateService);
  private settingsDataService = inject(SettingsDataService);
  private notificationService = inject(NotificationService);

  employees = this.stateService.employees;
  employeeSearchTerm = signal('');

  isModalOpen = signal(false);
  editingEmployee = signal<Partial<Employee> | null>(null);
  employeeForm = signal<Partial<Employee>>({});
  employeePendingDeletion = signal<Employee | null>(null);
  availableEmployeeRoles: string[] = ['Gerente', 'Caixa', 'Garçom', 'Cozinha'];
  
  // State for details modal
  isDetailsModalOpen = signal(false);
  selectedEmployeeForDetails = signal<Employee | null>(null);

  filteredEmployees = computed(() => {
    const term = this.employeeSearchTerm().toLowerCase();
    if (!term) return this.employees();
    return this.employees().filter(e => e.name.toLowerCase().includes(term) || e.role?.toLowerCase().includes(term));
  });
  
  openDetailsModal(employee: Employee) {
    this.selectedEmployeeForDetails.set(employee);
    this.isDetailsModalOpen.set(true);
  }

  openAddModal() {
    this.employeeForm.set({ role: 'Garçom', pin: '', bank_details: {} });
    this.editingEmployee.set(null);
    this.isModalOpen.set(true);
  }

  openEditModal(e: Employee) {
    this.editingEmployee.set(e);
    // Ensure bank_details is an object to avoid errors on the template
    this.employeeForm.set({ ...e, bank_details: e.bank_details || {} });
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
  }

  updateEmployeeFormField(field: keyof Omit<Employee, 'id' | 'created_at' | 'bank_details'>, value: string) {
    this.employeeForm.update(form => {
      const newForm = { ...form };
      if (field === 'pin' && value.length > 4) return form;

      if (field === 'salary_rate' || field === 'overtime_rate_multiplier') {
        const numValue = parseFloat(value);
        (newForm as any)[field] = isNaN(numValue) ? null : numValue;
      } else {
        (newForm as any)[field] = value === '' ? null : value;
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
    if (form.pin && form.pin.length !== 4) {
      await this.notificationService.alert('O PIN deve ter exatamente 4 dígitos.');
      return;
    }

    let res;
    if (this.editingEmployee()) {
      res = await this.settingsDataService.updateEmployee({ ...form, id: this.editingEmployee()!.id });
    } else {
      res = await this.settingsDataService.addEmployee(form as any);
    }
    if (res.success) {
      this.closeModal();
    } else {
      await this.notificationService.alert(`Falha ao salvar funcionário: ${res.error?.message}`);
    }
  }

  requestDeleteEmployee(e: Employee) {
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
}