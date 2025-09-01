import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';
import { Station, IngredientCategory, Supplier } from '../../models/db.models';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  private dataService = inject(SupabaseService);

  // Data Signals from Service
  stations = this.dataService.stations;
  categories = this.dataService.ingredientCategories;
  suppliers = this.dataService.suppliers;

  // Search terms
  stationSearchTerm = signal('');
  categorySearchTerm = signal('');
  supplierSearchTerm = signal('');

  // Filtered lists
  filteredStations = computed(() => {
    const term = this.stationSearchTerm().toLowerCase();
    if (!term) return this.stations();
    return this.stations().filter(s => s.name.toLowerCase().includes(term));
  });

  filteredCategories = computed(() => {
    const term = this.categorySearchTerm().toLowerCase();
    if (!term) return this.categories();
    return this.categories().filter(c => c.name.toLowerCase().includes(term));
  });

  filteredSuppliers = computed(() => {
    const term = this.supplierSearchTerm().toLowerCase();
    if (!term) return this.suppliers();
    return this.suppliers().filter(s =>
      s.name.toLowerCase().includes(term) ||
      s.contact_person?.toLowerCase().includes(term)
    );
  });
  
  // --- Station Management ---
  newStationName = signal('');
  editingStation = signal<Station | null>(null);
  stationPendingDeletion = signal<Station | null>(null);

  async handleAddStation() {
    const name = this.newStationName().trim(); if (!name) return;
    const { success, error } = await this.dataService.addStation(name);
    if (success) { this.newStationName.set(''); } else { alert(`Falha: ${error?.message}`); }
  }
  startEditingStation(s: Station) { this.editingStation.set({ ...s }); this.stationPendingDeletion.set(null); }
  cancelEditingStation() { this.editingStation.set(null); }
  updateEditingStationName(event: Event) {
    const name = (event.target as HTMLInputElement).value;
    this.editingStation.update(s => s ? { ...s, name } : s);
  }
  async saveStation() {
    const station = this.editingStation(); if (!station?.name.trim()) return;
    const { success, error } = await this.dataService.updateStation(station.id, station.name.trim());
    if (success) { this.cancelEditingStation(); } else { alert(`Falha: ${error?.message}`); }
  }
  requestDeleteStation(s: Station) { this.stationPendingDeletion.set(s); this.editingStation.set(null); }
  cancelDeleteStation() { this.stationPendingDeletion.set(null); }
  async confirmDeleteStation() {
    const station = this.stationPendingDeletion(); if (!station) return;
    const { success, error } = await this.dataService.deleteStation(station.id);
    if (!success) { alert(`Falha: ${error?.message}`); }
    this.stationPendingDeletion.set(null);
  }

  // --- Printing Management ---
  editingPrinterForStation = signal<string | null>(null);

  async toggleAutoPrint(station: Station) {
    const { success, error } = await this.dataService.updateStationAutoPrint(station.id, !station.auto_print_orders);
    if (!success) {
      alert(`Falha ao atualizar a configuração de impressão. Erro: ${error?.message}`);
      // The UI will be correct because it's bound to the service signal which hasn't changed
    }
  }

  startEditingPrinter(station: Station) {
    this.editingPrinterForStation.set(station.id);
  }
  
  cancelEditingPrinter() {
    this.editingPrinterForStation.set(null);
  }

  async savePrinterName(station: Station, newName: string | null) {
    const trimmedName = newName?.trim() || null;
    if (trimmedName === (station.printer_name || null)) {
        this.editingPrinterForStation.set(null);
        return;
    }
    const { success, error } = await this.dataService.updateStationPrinter(station.id, trimmedName);
    if (!success) {
      alert(`Falha ao salvar o nome da impressora. Erro: ${error?.message}`);
    }
    this.editingPrinterForStation.set(null);
  }


  // --- Ingredient Category Management ---
  newCategoryName = signal('');
  editingCategory = signal<IngredientCategory | null>(null);
  categoryPendingDeletion = signal<IngredientCategory | null>(null);

  async handleAddCategory() {
    const name = this.newCategoryName().trim(); if (!name) return;
    const { success, error } = await this.dataService.addIngredientCategory(name);
    if (success) { this.newCategoryName.set(''); } else { alert(`Falha: ${error?.message}`); }
  }
  startEditingCategory(c: IngredientCategory) { this.editingCategory.set({ ...c }); this.categoryPendingDeletion.set(null); }
  cancelEditingCategory() { this.editingCategory.set(null); }
  updateEditingCategoryName(event: Event) {
    const name = (event.target as HTMLInputElement).value;
    this.editingCategory.update(c => c ? { ...c, name } : c);
  }
  async saveCategory() {
    const category = this.editingCategory(); if (!category?.name.trim()) return;
    const { success, error } = await this.dataService.updateIngredientCategory(category.id, category.name.trim());
    if (success) { this.cancelEditingCategory(); } else { alert(`Falha: ${error?.message}`); }
  }
  requestDeleteCategory(c: IngredientCategory) { this.categoryPendingDeletion.set(c); this.editingCategory.set(null); }
  cancelDeleteCategory() { this.categoryPendingDeletion.set(null); }
  async confirmDeleteCategory() {
    const category = this.categoryPendingDeletion(); if (!category) return;
    const { success, error } = await this.dataService.deleteIngredientCategory(category.id);
    if (!success) { alert(`Falha: ${error?.message}`); }
    this.categoryPendingDeletion.set(null);
  }

  // --- Supplier Management ---
  isSupplierModalOpen = signal(false);
  editingSupplier = signal<Partial<Supplier> | null>(null);
  supplierForm = signal<Partial<Supplier>>({});
  supplierPendingDeletion = signal<Supplier | null>(null);

  openAddSupplierModal() { this.supplierForm.set({}); this.editingSupplier.set(null); this.isSupplierModalOpen.set(true); }
  openEditSupplierModal(s: Supplier) { this.editingSupplier.set(s); this.supplierForm.set({ ...s }); this.isSupplierModalOpen.set(true); }
  closeSupplierModal() { this.isSupplierModalOpen.set(false); }
  updateSupplierFormField(field: keyof Omit<Supplier, 'id' | 'created_at'>, value: string) {
    this.supplierForm.update(form => ({ ...form, [field]: value }));
  }
  async saveSupplier() {
    const form = this.supplierForm(); if (!form.name?.trim()) { alert('Nome é obrigatório'); return; }
    let res;
    if (this.editingSupplier()) {
      res = await this.dataService.updateSupplier({ ...form, id: this.editingSupplier()!.id });
    } else {
      res = await this.dataService.addSupplier(form as any);
    }
    if (res.success) { this.closeSupplierModal(); } else { alert(`Falha: ${res.error?.message}`); }
  }
  requestDeleteSupplier(s: Supplier) { this.supplierPendingDeletion.set(s); }
  cancelDeleteSupplier() { this.supplierPendingDeletion.set(null); }
  async confirmDeleteSupplier() {
    const supplier = this.supplierPendingDeletion(); if (!supplier) return;
    const { success, error } = await this.dataService.deleteSupplier(supplier.id);
    if (!success) { alert(`Falha: ${error?.message}`); }
    this.supplierPendingDeletion.set(null);
  }
}