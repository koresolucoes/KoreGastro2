import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Station, IngredientCategory, Supplier, Employee, Category, ReservationSettings } from '../../models/db.models';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { SettingsDataService } from '../../services/settings-data.service';
import { InventoryDataService } from '../../services/inventory-data.service';
import { RecipeDataService } from '../../services/recipe-data.service';
import { NotificationService } from '../../services/notification.service';
import { AuthService } from '../../services/auth.service';
import { ReservationDataService } from '../../services/reservation-data.service';

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
  private recipeDataService = inject(RecipeDataService);
  private notificationService = inject(NotificationService);
  private authService = inject(AuthService);
  private reservationDataService = inject(ReservationDataService);

  // Data Signals from Service
  stations = this.stateService.stations;
  categories = this.stateService.ingredientCategories;
  recipeCategories = this.stateService.categories;
  suppliers = this.stateService.suppliers;
  employees = this.stateService.employees;
  reservationSettings = this.stateService.reservationSettings;

  // Reservation Form
  reservationForm = signal<Partial<ReservationSettings>>({});

  // Search terms
  stationSearchTerm = signal('');
  categorySearchTerm = signal('');
  recipeCategorySearchTerm = signal('');
  supplierSearchTerm = signal('');
  employeeSearchTerm = signal('');

  qrCodeUrl = computed(() => {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return '';
    // Construct the full URL including the hash for the router
    const menuUrl = `${window.location.origin}${window.location.pathname}#/menu/${userId}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(menuUrl)}`;
  });

  publicBookingUrl = computed(() => {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return '';
    return `${window.location.origin}${window.location.pathname}#/book/${userId}`;
  });

  constructor() {
    effect(() => {
        const settings = this.reservationSettings();
        if (settings) {
            this.reservationForm.set({ ...settings });
        } else {
            // Set default values if no settings exist
            this.reservationForm.set({
                is_enabled: false,
                opening_time: '18:00',
                closing_time: '23:00',
                booking_duration_minutes: 90,
                max_party_size: 8,
                min_party_size: 1,
                booking_notice_days: 30,
            });
        }
    });
  }

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
  
  filteredRecipeCategories = computed(() => {
    const term = this.recipeCategorySearchTerm().toLowerCase();
    if (!term) return this.recipeCategories();
    return this.recipeCategories().filter(c => c.name.toLowerCase().includes(term));
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
    if (success) { this.newStationName.set(''); } else { await this.notificationService.alert(`Falha: ${error?.message}`); }
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
    if (success) { this.cancelEditingStation(); } else { await this.notificationService.alert(`Falha: ${error?.message}`); }
  }
  requestDeleteStation(s: Station) { this.stationPendingDeletion.set(s); this.editingStation.set(null); }
  cancelDeleteStation() { this.stationPendingDeletion.set(null); }
  async confirmDeleteStation() {
    const station = this.stationPendingDeletion(); if (!station) return;
    const { success, error } = await this.settingsDataService.deleteStation(station.id);
    if (!success) { await this.notificationService.alert(`Falha: ${error?.message}`); }
    this.stationPendingDeletion.set(null);
  }

  // --- Ingredient Category Management ---
  newCategoryName = signal('');
  editingCategory = signal<IngredientCategory | null>(null);
  categoryPendingDeletion = signal<IngredientCategory | null>(null);

  async handleAddCategory() {
    const name = this.newCategoryName().trim(); if (!name) return;
    const { success, error } = await this.inventoryDataService.addIngredientCategory(name);
    if (success) { this.newCategoryName.set(''); } else { await this.notificationService.alert(`Falha: ${error?.message}`); }
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
    if (success) { this.cancelEditingCategory(); } else { await this.notificationService.alert(`Falha: ${error?.message}`); }
  }
  requestDeleteCategory(c: IngredientCategory) { this.categoryPendingDeletion.set(c); this.editingCategory.set(null); }
  cancelDeleteCategory() { this.categoryPendingDeletion.set(null); }
  async confirmDeleteCategory() {
    const category = this.categoryPendingDeletion(); if (!category) return;
    const { success, error } = await this.inventoryDataService.deleteIngredientCategory(category.id);
    if (!success) { await this.notificationService.alert(`Falha: ${error?.message}`); }
    this.categoryPendingDeletion.set(null);
  }

  // --- Recipe Category Management ---
  newRecipeCategoryName = signal('');
  editingRecipeCategory = signal<Category | null>(null);
  recipeCategoryPendingDeletion = signal<Category | null>(null);

  async handleAddRecipeCategory() {
    const name = this.newRecipeCategoryName().trim(); if (!name) return;
    const { success, error } = await this.recipeDataService.addRecipeCategory(name);
    if (success) { this.newRecipeCategoryName.set(''); } else { await this.notificationService.alert(`Falha: ${error?.message}`); }
  }
  startEditingRecipeCategory(c: Category) { this.editingRecipeCategory.set({ ...c }); this.recipeCategoryPendingDeletion.set(null); }
  cancelEditingRecipeCategory() { this.editingRecipeCategory.set(null); }
  updateEditingRecipeCategoryName(event: Event) {
    const name = (event.target as HTMLInputElement).value;
    this.editingRecipeCategory.update(c => c ? { ...c, name } : c);
  }
  async saveRecipeCategory() {
    const category = this.editingRecipeCategory(); if (!category?.name.trim()) return;
    const { success, error } = await this.recipeDataService.updateRecipeCategory(category.id, category.name.trim());
    if (success) { this.cancelEditingRecipeCategory(); } else { await this.notificationService.alert(`Falha: ${error?.message}`); }
  }
  requestDeleteRecipeCategory(c: Category) { this.recipeCategoryPendingDeletion.set(c); this.editingRecipeCategory.set(null); }
  cancelDeleteRecipeCategory() { this.recipeCategoryPendingDeletion.set(null); }
  async confirmDeleteRecipeCategory() {
    const category = this.recipeCategoryPendingDeletion(); if (!category) return;
    const { success, error } = await this.recipeDataService.deleteRecipeCategory(category.id);
    if (!success) { await this.notificationService.alert(`Falha ao deletar. Erro: ${error?.message}`); }
    this.recipeCategoryPendingDeletion.set(null);
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
    const form = this.supplierForm(); if (!form.name?.trim()) {
      await this.notificationService.alert('Nome é obrigatório');
      return;
    }
    let res;
    if (this.editingSupplier()) {
      res = await this.inventoryDataService.updateSupplier({ ...form, id: this.editingSupplier()!.id });
    } else {
      res = await this.inventoryDataService.addSupplier(form as any);
    }
    if (res.success) { this.closeSupplierModal(); } else { await this.notificationService.alert(`Falha: ${res.error?.message}`); }
  }
  requestDeleteSupplier(s: Supplier) { this.supplierPendingDeletion.set(s); }
  cancelDeleteSupplier() { this.supplierPendingDeletion.set(null); }
  async confirmDeleteSupplier() {
    const supplier = this.supplierPendingDeletion(); if (!supplier) return;
    const { success, error } = await this.inventoryDataService.deleteSupplier(supplier.id);
    if (!success) { await this.notificationService.alert(`Falha: ${error?.message}`); }
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
    this.employeeForm.update(form => {
        const newForm = {...form};
        if (field === 'pin' && value.length > 4) return form;
        
        if (field === 'salary_rate' || field === 'overtime_rate_multiplier') {
            const numValue = parseFloat(value);
            (newForm as any)[field] = isNaN(numValue) ? null : numValue;
        } else {
            (newForm as any)[field] = value;
        }
        return newForm;
    });
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
    if (res.success) { this.closeEmployeeModal(); } else { await this.notificationService.alert(`Falha ao salvar funcionário: ${res.error?.message}`); }
  }
  requestDeleteEmployee(e: Employee) { this.employeePendingDeletion.set(e); }
  cancelDeleteEmployee() { this.employeePendingDeletion.set(null); }
  async confirmDeleteEmployee() {
    const employee = this.employeePendingDeletion(); if (!employee) return;
    const { success, error } = await this.settingsDataService.deleteEmployee(employee.id);
    if (!success) { await this.notificationService.alert(`Falha ao deletar funcionário: ${error?.message}`); }
    this.employeePendingDeletion.set(null);
  }

  // --- Reservation Settings ---
  updateReservationFormField(field: keyof Omit<ReservationSettings, 'id' | 'created_at' | 'user_id'>, value: any) {
    if (field === 'is_enabled') {
        this.reservationForm.update(form => ({ ...form, [field]: !!value }));
    } else {
        this.reservationForm.update(form => ({ ...form, [field]: value }));
    }
  }

  async saveReservationSettings() {
    const form = this.reservationForm();
    const { success, error } = await this.reservationDataService.updateReservationSettings(form);
    if (success) {
      await this.notificationService.alert('Configurações de reserva salvas!', 'Sucesso');
    } else {
      await this.notificationService.alert(`Erro ao salvar: ${error?.message}`);
    }
  }

  async copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      await this.notificationService.alert('Link copiado para a área de transferência!');
    } catch (err) {
      await this.notificationService.alert('Falha ao copiar o link.');
    }
  }
}