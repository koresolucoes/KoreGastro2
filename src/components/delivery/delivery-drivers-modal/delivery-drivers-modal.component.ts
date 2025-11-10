import { Component, ChangeDetectionStrategy, inject, signal, output, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DeliveryDriver } from '../../../models/db.models';
import { DeliveryStateService } from '../../../services/delivery-state.service';
import { DeliveryDataService } from '../../../services/delivery-data.service';
import { NotificationService } from '../../../services/notification.service';

const EMPTY_FORM: Partial<DeliveryDriver> = {
  name: '',
  phone: '',
  vehicle_type: 'Moto',
  is_active: true,
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

  closeModal: OutputEmitterRef<void> = output<void>();
  drivers = this.deliveryState.deliveryDrivers;
  
  editingDriver = signal<DeliveryDriver | null>(null);
  driverForm = signal<Partial<DeliveryDriver>>(EMPTY_FORM);
  driverPendingDeletion = signal<DeliveryDriver | null>(null);

  startEditing(driver: DeliveryDriver) {
    this.driverPendingDeletion.set(null);
    this.editingDriver.set(driver);
    this.driverForm.set({ ...driver });
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
    let result;
    if (editing) {
      result = await this.deliveryDataService.updateDriver(editing.id, form);
    } else {
      result = await this.deliveryDataService.addDriver(form);
    }

    if (result.success) {
      this.notificationService.show('Entregador salvo com sucesso!', 'success');
      this.cancelEditing();
    } else {
      this.notificationService.show(`Erro ao salvar: ${result.error?.message}`, 'error');
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
      this.notificationService.show('Entregador removido com sucesso!', 'success');
    } else {
      this.notificationService.show(`Erro ao remover: ${error?.message}`, 'error');
    }
    this.driverPendingDeletion.set(null);
  }
}