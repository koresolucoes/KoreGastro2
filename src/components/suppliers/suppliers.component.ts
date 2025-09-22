import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Supplier } from '../../models/db.models';
import { InventoryStateService } from '../../services/inventory-state.service';
import { InventoryDataService } from '../../services/inventory-data.service';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-suppliers',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './suppliers.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuppliersComponent {
  inventoryState = inject(InventoryStateService);
  inventoryDataService = inject(InventoryDataService);
  notificationService = inject(NotificationService);

  suppliers = this.inventoryState.suppliers;
  searchTerm = signal('');

  isModalOpen = signal(false);
  editingSupplier = signal<Partial<Supplier> | null>(null);
  supplierForm = signal<Partial<Supplier>>({});
  supplierPendingDeletion = signal<Supplier | null>(null);

  // New state for details modal
  isDetailsModalOpen = signal(false);
  selectedSupplierForDetails = signal<Supplier | null>(null);

  filteredSuppliers = computed(() => {
    const term = this.searchTerm().toLowerCase();
    if (!term) return this.suppliers();
    return this.suppliers().filter(s =>
      s.name.toLowerCase().includes(term) ||
      s.contact_person?.toLowerCase().includes(term) ||
      s.phone?.toLowerCase().includes(term) ||
      s.email?.toLowerCase().includes(term)
    );
  });

  ingredientsForSelectedSupplier = computed(() => {
    const supplier = this.selectedSupplierForDetails();
    if (!supplier) return [];
    return this.inventoryState.ingredients().filter(i => i.supplier_id === supplier.id);
  });

  openDetailsModal(supplier: Supplier) {
    this.selectedSupplierForDetails.set(supplier);
    this.isDetailsModalOpen.set(true);
  }

  closeDetailsModal() {
    this.isDetailsModalOpen.set(false);
    this.selectedSupplierForDetails.set(null);
  }

  openAddModal() {
    this.supplierForm.set({});
    this.editingSupplier.set(null);
    this.isModalOpen.set(true);
  }
  
  openEditModal(s: Supplier) {
    this.editingSupplier.set(s);
    this.supplierForm.set({ ...s });
    this.isModalOpen.set(true);
  }
  
  closeModal() {
    this.isModalOpen.set(false);
  }

  updateFormField(field: keyof Omit<Supplier, 'id' | 'created_at'>, value: string) {
    this.supplierForm.update(form => ({ ...form, [field]: value }));
  }

  async saveSupplier() {
    const form = this.supplierForm();
    if (!form.name?.trim()) {
      await this.notificationService.alert('Nome é obrigatório');
      return;
    }
    let res;
    if (this.editingSupplier()) {
      res = await this.inventoryDataService.updateSupplier({ ...form, id: this.editingSupplier()!.id });
    } else {
      res = await this.inventoryDataService.addSupplier(form as any);
    }
    if (res.success) {
      this.closeModal();
    } else {
      await this.notificationService.alert(`Falha: ${res.error?.message}`);
    }
  }

  requestDelete(s: Supplier) {
    this.supplierPendingDeletion.set(s);
  }
  
  cancelDelete() {
    this.supplierPendingDeletion.set(null);
  }
  
  async confirmDelete() {
    const supplier = this.supplierPendingDeletion();
    if (!supplier) return;
    const { success, error } = await this.inventoryDataService.deleteSupplier(supplier.id);
    if (!success) {
      await this.notificationService.alert(`Falha: ${error?.message}`);
    }
    this.supplierPendingDeletion.set(null);
  }
}