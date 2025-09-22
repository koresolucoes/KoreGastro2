import { Component, ChangeDetectionStrategy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Customer } from '../../models/db.models';
import { PosStateService } from '../../services/pos-state.service';
import { SettingsDataService } from '../../services/settings-data.service';
import { NotificationService } from '../../services/notification.service';
import { CustomerDetailsModalComponent } from './customer-details-modal/customer-details-modal.component';

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [CommonModule, FormsModule, CustomerDetailsModalComponent],
  templateUrl: './customers.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomersComponent {
  private posState = inject(PosStateService);
  private settingsDataService = inject(SettingsDataService);
  private notificationService = inject(NotificationService);

  customers = this.posState.customers;
  searchTerm = signal('');

  isModalOpen = signal(false);
  editingCustomer = signal<Partial<Customer> | null>(null);
  customerForm = signal<Partial<Customer>>({});
  customerPendingDeletion = signal<Customer | null>(null);

  isDetailsModalOpen = signal(false);
  selectedCustomerForDetails = signal<Customer | null>(null);

  filteredCustomers = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const allCustomers = this.customers();
    if (!term) return allCustomers;
    return allCustomers.filter(c =>
      c.name.toLowerCase().includes(term) ||
      c.phone?.toLowerCase().includes(term) ||
      c.email?.toLowerCase().includes(term) ||
      c.cpf?.toLowerCase().includes(term)
    );
  });
  
  openDetailsModal(customer: Customer) {
    this.selectedCustomerForDetails.set(customer);
    this.isDetailsModalOpen.set(true);
  }

  openAddModal() {
    this.customerForm.set({});
    this.editingCustomer.set(null);
    this.isModalOpen.set(true);
  }

  openEditModal(customer: Customer) {
    this.editingCustomer.set(customer);
    this.customerForm.set({ ...customer });
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
  }

  updateCustomerFormField(field: keyof Omit<Customer, 'id' | 'created_at' | 'user_id'>, value: string) {
    this.customerForm.update(form => ({ ...form, [field]: value || null }));
  }

  async saveCustomer() {
    const form = this.customerForm();
    if (!form.name?.trim()) {
      await this.notificationService.alert('O nome do cliente é obrigatório.');
      return;
    }

    let res;
    if (this.editingCustomer()) {
      res = await this.settingsDataService.updateCustomer({ ...form, id: this.editingCustomer()!.id });
    } else {
      res = await this.settingsDataService.addCustomer(form);
    }

    if (res.success) {
      this.closeModal();
    } else {
      await this.notificationService.alert(`Falha ao salvar cliente: ${res.error?.message}`);
    }
  }

  requestDeleteCustomer(customer: Customer) {
    this.customerPendingDeletion.set(customer);
  }

  cancelDeleteCustomer() {
    this.customerPendingDeletion.set(null);
  }

  async confirmDeleteCustomer() {
    const customer = this.customerPendingDeletion();
    if (!customer) return;
    const { success, error } = await this.settingsDataService.deleteCustomer(customer.id);
    if (!success) {
      await this.notificationService.alert(`Falha ao excluir cliente: ${error?.message}`);
    }
    this.customerPendingDeletion.set(null);
  }
}