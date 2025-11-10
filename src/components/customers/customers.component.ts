import { Component, ChangeDetectionStrategy, signal, computed, inject, effect, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Customer } from '../../models/db.models';
import { PosStateService } from '../../services/pos-state.service';
import { SettingsDataService } from '../../services/settings-data.service';
import { NotificationService } from '../../services/notification.service';
import { CustomerDetailsModalComponent } from './customer-details-modal/customer-details-modal.component';
import { SettingsStateService } from '../../services/settings-state.service';

declare var L: any;

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
  private settingsState = inject(SettingsStateService);

  customers = this.posState.customers;
  searchTerm = signal('');

  isModalOpen = signal(false);
  editingCustomer = signal<Partial<Customer> | null>(null);
  customerForm = signal<Partial<Customer>>({});
  customerPendingDeletion = signal<Customer | null>(null);

  isDetailsModalOpen = signal(false);
  selectedCustomerForDetails = signal<Customer | null>(null);

  // Map related state
  @ViewChild('addEditMapContainer') mapContainer: ElementRef | undefined;
  private map: any;
  private marker: any;
  private mapInitialized = false;

  constructor() {
    effect(() => {
        if (this.isModalOpen()) {
            // Defer map initialization to ensure view is ready
            setTimeout(() => this.initMap(), 100);
        } else {
            this.destroyMap();
        }
    });
  }

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
    this.customerForm.update(form => {
        const newForm: Partial<Customer> = { ...form };
        if (field === 'latitude' || field === 'longitude') {
            (newForm as any)[field] = parseFloat(value) || null;
            if (this.marker && newForm.latitude && newForm.longitude) {
                this.marker.setLatLng([newForm.latitude, newForm.longitude]);
            }
        } else {
            (newForm as any)[field] = value || null;
        }
        return newForm;
    });
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
  
  private initMap(): void {
    if (this.mapInitialized || !this.mapContainer?.nativeElement) {
      return;
    }
    
    const form = this.customerForm();
    const profile = this.settingsState.companyProfile();
    
    const initialLat = form.latitude ?? profile?.latitude ?? -15.793889; // Default to Brasília
    const initialLon = form.longitude ?? profile?.longitude ?? -47.882778;
    const initialZoom = (form.latitude && form.longitude) ? 17 : 13;
    
    this.map = L.map(this.mapContainer.nativeElement).setView([initialLat, initialLon], initialZoom);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);
    
    this.marker = L.marker([initialLat, initialLon]).addTo(this.map);
    
    this.map.on('click', (e: any) => {
      const { lat, lng } = e.latlng;
      this.marker.setLatLng([lat, lng]);
      this.customerForm.update(f => ({ ...f, latitude: lat, longitude: lng }));
    });
    
    this.mapInitialized = true;
  }
  
  private destroyMap(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
      this.mapInitialized = false;
    }
  }
}
