import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Station, IngredientCategory, Supplier, Employee } from '../../models/db.models';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { SettingsDataService } from '../../services/settings-data.service';
import { InventoryDataService } from '../../services/inventory-data.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  private stateService = inject(SupabaseStateService);
  private settingsDataService = inject(SettingsDataService);
  private inventoryDataService = inject(InventoryDataService);

  // Data Signals from Service
  stations = this.stateService.stations;
  categories = this.stateService.ingredientCategories;
  suppliers = this.stateService.suppliers;
  employees = this.stateService.employees;

  // Search terms
  stationSearchTerm = signal('');
  categorySearchTerm = signal('');
  supplierSearchTerm = signal('');
  employeeSearchTerm = signal('');

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
  
  filteredEmployees = computed(() => {
    const term = this.employeeSearchTerm().toLowerCase();
    if (!term) return this.employees();
    return this.employees().filter(e => e.name.toLowerCase().includes(term) || e.role?.toLowerCase().includes(term));
  });
  
  // --- Station Management ---
  newStationName = signal('');
  editingStation = signal<Station | null>(null);
  stationPendingDeletion = signal<Station | null>(null);

  async handleAddStation() {
    const name = this.newStationName().trim(); if (!name) return;
    const { success, error } = await this.settingsDataService.addStation(name);
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
    const { success, error } = await this.settingsDataService.updateStation(station.id, station.name.trim());
    if (success) { this.cancelEditingStation(); } else { alert(`Falha: ${error?.message}`); }
  }
  requestDeleteStation(s: Station) { this.stationPendingDeletion.set(s); this.editingStation.set(null); }
  cancelDeleteStation() { this.stationPendingDeletion.set(null); }
  async confirmDeleteStation() {
    const station = this.stationPendingDeletion(); if (!station) return;
    const { success, error } = await this.settingsDataService.deleteStation(station.id);
    if (!success) { alert(`Falha: ${error?.message}`); }
    this.stationPendingDeletion.set(null);
  }

  // --- Ingredient Category Management ---
  newCategoryName = signal('');
  editingCategory = signal<IngredientCategory | null>(null);
  categoryPendingDeletion = signal<IngredientCategory | null>(null);

  async handleAddCategory() {
    const name = this.newCategoryName().trim(); if (!name) return;
    const { success, error } = await this.inventoryDataService.addIngredientCategory(name);
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
    const { success, error } = await this.inventoryDataService.updateIngredientCategory(category.id, category.name.trim());
    if (success) { this.cancelEditingCategory(); } else { alert(`Falha: ${error?.message}`); }
  }
  requestDeleteCategory(c: IngredientCategory) { this.categoryPendingDeletion.set(c); this.editingCategory.set(null); }
  cancelDeleteCategory() { this.categoryPendingDeletion.set(null); }
  async confirmDeleteCategory() {
    const category = this.categoryPendingDeletion(); if (!category) return;
    const { success, error } = await this.inventoryDataService.deleteIngredientCategory(category.id);
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
      res = await this.inventoryDataService.updateSupplier({ ...form, id: this.editingSupplier()!.id });
    } else {
      res = await this.inventoryDataService.addSupplier(form as any);
    }
    if (res.success) { this.closeSupplierModal(); } else { alert(`Falha: ${res.error?.message}`); }
  }
  requestDeleteSupplier(s: Supplier) { this.supplierPendingDeletion.set(s); }
  cancelDeleteSupplier() { this.supplierPendingDeletion.set(null); }
  async confirmDeleteSupplier() {
    const supplier = this.supplierPendingDeletion(); if (!supplier) return;
    const { success, error } = await this.inventoryDataService.deleteSupplier(supplier.id);
    if (!success) { alert(`Falha: ${error?.message}`); }
    this.supplierPendingDeletion.set(null);
  }
  
  // --- Employee Management ---
  isEmployeeModalOpen = signal(false);
  editingEmployee = signal<Partial<Employee> | null>(null);
  employeeForm = signal<Partial<Employee>>({});
  employeePendingDeletion = signal<Employee | null>(null);
  availableEmployeeRoles: string[] = ['Gerente', 'Caixa', 'Garçom', 'Cozinha'];

  openAddEmployeeModal() { this.employeeForm.set({ role: 'Garçom', pin: '' }); this.editingEmployee.set(null); this.isEmployeeModalOpen.set(true); }
  openEditEmployeeModal(e: Employee) { this.editingEmployee.set(e); this.employeeForm.set({ ...e }); this.isEmployeeModalOpen.set(true); }
  closeEmployeeModal() { this.isEmployeeModalOpen.set(false); }
  updateEmployeeFormField(field: keyof Omit<Employee, 'id' | 'created_at'>, value: string) {
    if (field === 'pin' && value.length > 4) return;
    this.employeeForm.update(form => ({ ...form, [field]: value }));
  }
  async saveEmployee() {
    const form = this.employeeForm(); 
    if (!form.name?.trim()) { alert('O nome do funcionário é obrigatório.'); return; }
    if (form.pin && form.pin.length !== 4) { alert('O PIN deve ter exatamente 4 dígitos.'); return; }
    
    let res;
    if (this.editingEmployee()) {
      res = await this.settingsDataService.updateEmployee({ ...form, id: this.editingEmployee()!.id });
    } else {
      res = await this.settingsDataService.addEmployee(form as any);
    }
    if (res.success) { this.closeEmployeeModal(); } else { alert(`Falha ao salvar funcionário: ${res.error?.message}`); }
  }
  requestDeleteEmployee(e: Employee) { this.employeePendingDeletion.set(e); }
  cancelDeleteEmployee() { this.employeePendingDeletion.set(null); }
  async confirmDeleteEmployee() {
    const employee = this.employeePendingDeletion(); if (!employee) return;
    const { success, error } = await this.settingsDataService.deleteEmployee(employee.id);
    if (!success) { alert(`Falha ao deletar funcionário: ${error?.message}`); }
    this.employeePendingDeletion.set(null);
  }
}