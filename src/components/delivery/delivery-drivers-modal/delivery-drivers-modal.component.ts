import { Component, ChangeDetectionStrategy, inject, signal, output, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DeliveryDriver, Employee } from '../../../models/db.models';
import { DeliveryStateService } from '../../../services/delivery-state.service';
import { DeliveryDataService } from '../../../services/delivery-data.service';
import { NotificationService } from '../../../services/notification.service';
import { HrStateService } from '../../../services/hr-state.service';
import { SettingsDataService } from '../../../services/settings-data.service';

const EMPTY_FORM: Partial<DeliveryDriver> & { pin?: string } = {
  name: '',
  phone: '',
  pin: '',
  vehicle_type: 'Moto',
  is_active: true,
  base_rate: 0,
  rate_per_km: 0,
  employee_id: null
};

@Component({
  selector: 'app-delivery-drivers-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './delivery-drivers-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeliveryDriversModalComponent {
  private deliveryState = inject(DeliveryStateService);
  private deliveryDataService = inject(DeliveryDataService);
  private notificationService = inject(NotificationService);
  private hrState = inject(HrStateService);
  private settingsDataService = inject(SettingsDataService);

  closeModal: OutputEmitterRef<void> = output<void>();
  drivers = this.deliveryState.deliveryDrivers;
  employees = this.hrState.employees;
  
  editingDriver = signal<DeliveryDriver | null>(null);
  driverForm = signal<Partial<DeliveryDriver> & { pin?: string }>(EMPTY_FORM);
  driverPendingDeletion = signal<DeliveryDriver | null>(null);

  startEditing(driver: DeliveryDriver) {
    this.driverPendingDeletion.set(null);
    this.editingDriver.set(driver);
    // When editing, we don't handle the PIN. Name and phone are directly on the driver for simplicity here.
    this.driverForm.set({ ...driver, pin: '' });
  }

  cancelEditing() {
    this.editingDriver.set(null);
    this.driverForm.set(EMPTY_FORM);
  }

  async saveDriver() {
    const form = this.driverForm();
    if (!form.name?.trim()) {
      this.notificationService.show('O nome do entregador é obrigatório.', 'warning');
      return;
    }

    const editing = this.editingDriver();
    
    if (editing) {
      // Logic for updating an existing driver
      const { success, error } = await this.deliveryDataService.updateDriver(editing.id, form);
      if (success) {
        this.notificationService.show('Entregador atualizado!', 'success');
        this.cancelEditing();
      } else {
        this.notificationService.show(`Erro ao salvar: ${error?.message}`, 'error');
      }
    } else {
      // Logic for creating a new driver AND a new employee
      if (!form.pin || form.pin.length !== 4) {
        this.notificationService.show('O PIN de 4 dígitos é obrigatório.', 'warning');
        return;
      }

      // 1. Find or create "Entregador" role
      let driverRole = this.hrState.roles().find(r => r.name === 'Entregador');
      if (!driverRole) {
        const { data: newRole } = await this.settingsDataService.addRole('Entregador');
        if (newRole) driverRole = newRole;
      }
      if (!driverRole) {
        this.notificationService.show('Não foi possível encontrar ou criar o cargo de "Entregador".', 'error');
        return;
      }

      // 2. Create the Employee record
      const { data: newEmployee, success: empSuccess, error: empError } = await this.settingsDataService.addEmployee({
        name: form.name,
        phone: form.phone,
        pin: form.pin,
        role_id: driverRole.id
      });
      if (!empSuccess || !newEmployee) {
        this.notificationService.show(`Erro ao criar o funcionário: ${empError?.message}`, 'error');
        return;
      }

      // 3. Create the Delivery Driver record, linking the new employee
      const driverData = {
        name: form.name,
        phone: form.phone,
        vehicle_type: form.vehicle_type,
        is_active: form.is_active,
        base_rate: form.base_rate,
        rate_per_km: form.rate_per_km,
        employee_id: newEmployee.id
      };

      const { success: driverSuccess, error: driverError } = await this.deliveryDataService.addDriver(driverData);
      
      if (driverSuccess) {
        this.notificationService.show('Entregador e funcionário criados com sucesso!', 'success');
        this.cancelEditing();
      } else {
        this.notificationService.show(`Erro ao criar o entregador: ${driverError?.message}. O funcionário foi criado, por favor, verifique a lista de funcionários.`, 'error');
        // Optional: attempt to delete the created employee for cleanup
        await this.settingsDataService.deleteEmployee(newEmployee.id);
      }
    }
  }


  requestDelete(driver: DeliveryDriver) {
    this.editingDriver.set(null);
    this.driverPendingDeletion.set(driver);
  }

  cancelDelete() {
    this.driverPendingDeletion.set(null);
  }

  async confirmDelete() {
    const driverToDelete = this.driverPendingDeletion();
    if (!driverToDelete) return;

    const { success, error } = await this.deliveryDataService.deleteDriver(driverToDelete.id);
    if (success) {
      // Also delete the associated employee record
      if (driverToDelete.employee_id) {
        await this.settingsDataService.deleteEmployee(driverToDelete.employee_id);
      }
      this.notificationService.show('Entregador removido com sucesso!', 'success');
    } else {
      this.notificationService.show(`Erro ao remover: ${error?.message}`, 'error');
    }
    this.driverPendingDeletion.set(null);
  }
}