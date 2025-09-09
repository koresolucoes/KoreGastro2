import { Component, ChangeDetectionStrategy, signal, computed, inject, output, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Customer } from '../../../models/db.models';
import { SupabaseStateService } from '../../../services/supabase-state.service';
import { SettingsDataService } from '../../../services/settings-data.service';
import { NotificationService } from '../../../services/notification.service';

@Component({
  selector: 'app-customer-select-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './customer-select-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerSelectModalComponent {
  private stateService = inject(SupabaseStateService);
  private settingsDataService = inject(SettingsDataService);
  private notificationService = inject(NotificationService);

  closeModal: OutputEmitterRef<void> = output<void>();
  customerSelected: OutputEmitterRef<Customer> = output<Customer>();

  searchTerm = signal('');
  isCreatingNew = signal(false);
  newCustomerForm = signal({ name: '', phone: '', email: '' });
  isSaving = signal(false);

  filteredCustomers = computed(() => {
    const term = this.searchTerm().toLowerCase();
    if (!term) return this.stateService.customers();
    return this.stateService.customers().filter(c => 
      c.name.toLowerCase().includes(term) ||
      c.phone?.includes(term) ||
      c.email?.toLowerCase().includes(term)
    );
  });

  selectCustomer(customer: Customer) {
    this.customerSelected.emit(customer);
  }

  async createAndSelectCustomer() {
    const form = this.newCustomerForm();
    if (!form.name.trim()) {
      await this.notificationService.alert('O nome é obrigatório para cadastrar um novo cliente.');
      return;
    }

    this.isSaving.set(true);
    const { success, error, data: newCustomer } = await this.settingsDataService.addCustomer({
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
    });
    this.isSaving.set(false);

    if (success && newCustomer) {
      this.notificationService.show('Cliente cadastrado com sucesso!', 'success');
      this.customerSelected.emit(newCustomer);
    } else {
      await this.notificationService.alert(`Erro ao cadastrar cliente: ${error?.message}`);
    }
  }

  startCreateNew() {
    this.isCreatingNew.set(true);
    this.newCustomerForm.set({ name: '', phone: '', email: '' });
  }

  cancelCreateNew() {
    this.isCreatingNew.set(false);
  }
}
