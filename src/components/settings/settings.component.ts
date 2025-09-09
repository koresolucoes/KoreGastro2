import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Station, IngredientCategory, Supplier, Category, ReservationSettings, CompanyProfile, Role, LoyaltySettings, LoyaltyReward, Recipe, LoyaltyRewardType } from '../../models/db.models';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { SettingsDataService } from '../../services/settings-data.service';
import { InventoryDataService } from '../../services/inventory-data.service';
import { RecipeDataService } from '../../services/recipe-data.service';
import { NotificationService } from '../../services/notification.service';
import { AuthService } from '../../services/auth.service';
import { ReservationDataService } from '../../services/reservation-data.service';
import { ALL_PERMISSION_KEYS } from '../../config/permissions';

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
  recipes = this.stateService.recipes;
  suppliers = this.stateService.suppliers;
  reservationSettings = this.stateService.reservationSettings;
  companyProfile = this.stateService.companyProfile;
  roles = this.stateService.roles;
  rolePermissions = this.stateService.rolePermissions;
  loyaltySettings = this.stateService.loyaltySettings;
  loyaltyRewards = this.stateService.loyaltyRewards;

  // Reservation Form
  reservationForm = signal<Partial<ReservationSettings>>({});
  
  // Company Profile Form
  companyProfileForm = signal<Partial<CompanyProfile>>({});

  // Search terms
  stationSearchTerm = signal('');
  categorySearchTerm = signal('');
  recipeCategorySearchTerm = signal('');
  supplierSearchTerm = signal('');

  // Role Management State
  allPermissions = ALL_PERMISSION_KEYS;
  
  permissionGroups = [
    {
      name: 'Vendas',
      permissions: [
        { key: '/pos', label: 'PDV' },
        { key: '/cashier', label: 'Caixa' },
        { key: '/reservations', label: 'Reservas' },
        { key: '/customers', label: 'Clientes' }
      ]
    },
    {
      name: 'Produção',
      permissions: [
        { key: '/kds', label: 'Cozinha (KDS)' },
        { key: '/mise-en-place', label: 'Mise en Place' },
        { key: '/technical-sheets', label: 'Fichas Técnicas' }
      ]
    },
    {
      name: 'Gestão',
      permissions: [
        { key: '/dashboard', label: 'Dashboard' },
        { key: '/inventory', label: 'Estoque' },
        { key: '/purchasing', label: 'Compras' },
        { key: '/performance', label: 'Desempenho' },
        { key: '/reports', label: 'Relatórios' }
      ]
    },
    {
      name: 'RH',
      permissions: [
        { key: '/employees', label: 'Funcionários' },
        { key: '/schedules', label: 'Escalas' },
        { key: '/my-leave', label: 'Minhas Ausências' },
        { key: '/leave-management', label: 'Gestão de Ausências' },
        { key: '/time-clock', label: 'Controle de Ponto' },
        { key: '/payroll', label: 'Folha de Pagamento' }
      ]
    },
    {
      name: 'Outros',
      permissions: [
        { key: '/menu', label: 'Cardápio Online' },
        { key: '/tutorials', label: 'Tutoriais' },
        { key: '/settings', label: 'Configurações' }
      ]
    }
  ];

  isPermissionsModalOpen = signal(false);
  editingRole = signal<Role | null>(null);
  rolePermissionsForm = signal<Record<string, boolean>>({});
  newRoleName = signal('');
  rolePendingDeletion = signal<Role | null>(null);

  // Loyalty Program State
  loyaltySettingsForm = signal<Partial<LoyaltySettings>>({});
  isRewardModalOpen = signal(false);
  editingReward = signal<Partial<LoyaltyReward> | null>(null);
  rewardForm = signal<Partial<LoyaltyReward>>({});
  rewardPendingDeletion = signal<LoyaltyReward | null>(null);
  availableRewardTypes: LoyaltyRewardType[] = ['discount_fixed', 'discount_percentage', 'free_item'];
  sellableRecipes = computed(() => this.recipes().filter(r => !r.is_sub_recipe));

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
    
    effect(() => {
        const profile = this.companyProfile();
        if (profile) {
            this.companyProfileForm.set({ ...profile });
        } else {
            this.companyProfileForm.set({ company_name: '', cnpj: '', address: ''});
        }
    });

    effect(() => {
        const settings = this.loyaltySettings();
        if (settings) {
            this.loyaltySettingsForm.set({ ...settings });
        } else {
            this.loyaltySettingsForm.set({ is_enabled: false, points_per_real: 1 });
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

  // --- Company Profile ---
  updateCompanyProfileField(field: keyof Omit<CompanyProfile, 'user_id' | 'created_at'>, value: string) {
      this.companyProfileForm.update(form => ({ ...form, [field]: value }));
  }
  
  async saveCompanyProfile() {
      const form = this.companyProfileForm();
      if (!form.company_name || !form.cnpj) {
          await this.notificationService.alert('Nome da Empresa e CNPJ são obrigatórios.');
          return;
      }
      const { success, error } = await this.settingsDataService.updateCompanyProfile(form);
      if (success) {
          await this.notificationService.alert('Dados da empresa salvos!', 'Sucesso');
      } else {
          await this.notificationService.alert(`Erro ao salvar dados da empresa: ${error?.message}`);
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

  // --- Role Methods ---
  openPermissionsModal(role: Role) {
    this.editingRole.set(role);
    const currentPermissions = new Set(
      this.rolePermissions()
        .filter(p => p.role_id === role.id)
        .map(p => p.permission_key)
    );
    const formState: Record<string, boolean> = {};
    for (const key of this.allPermissions) {
      formState[key] = currentPermissions.has(key);
    }
    this.rolePermissionsForm.set(formState);
    this.isPermissionsModalOpen.set(true);
  }

  closePermissionsModal() {
    this.isPermissionsModalOpen.set(false);
    this.editingRole.set(null);
  }

  updatePermission(key: string, isChecked: boolean) {
    this.rolePermissionsForm.update(form => ({
      ...form,
      [key]: isChecked
    }));
  }

  async savePermissions() {
    const role = this.editingRole();
    if (!role) return;

    const selectedPermissions = Object.entries(this.rolePermissionsForm())
      .filter(([, isSelected]) => isSelected)
      .map(([key]) => key);

    const { success, error } = await this.settingsDataService.updateRolePermissions(role.id, selectedPermissions);

    if (success) {
      this.notificationService.show('Permissões atualizadas com sucesso!', 'success');
      this.closePermissionsModal();
    } else {
      await this.notificationService.alert(`Erro ao salvar permissões: ${error?.message}`);
    }
  }

  async handleAddRole() {
    const name = this.newRoleName().trim();
    if (!name) return;
    const { success, error } = await this.settingsDataService.addRole(name);
    if (success) {
      this.newRoleName.set('');
      this.notificationService.show(`Cargo "${name}" criado com sucesso.`, 'success');
    } else {
      await this.notificationService.alert(`Falha ao criar cargo: ${error?.message}`);
    }
  }

  requestDeleteRole(role: Role) {
    this.rolePendingDeletion.set(role);
  }

  cancelDeleteRole() {
    this.rolePendingDeletion.set(null);
  }

  async confirmDeleteRole() {
    const role = this.rolePendingDeletion();
    if (!role) return;
    const { success, error } = await this.settingsDataService.deleteRole(role.id);
    if (!success) {
      await this.notificationService.alert(`Falha ao deletar: ${error?.message}`);
    }
    this.rolePendingDeletion.set(null);
  }

  // --- Loyalty Methods ---
  updateLoyaltySettingsField(field: keyof LoyaltySettings, value: any) {
    this.loyaltySettingsForm.update(form => ({ ...form, [field]: value }));
  }

  async saveLoyaltySettings() {
    const form = this.loyaltySettingsForm();
    const { success, error } = await this.settingsDataService.upsertLoyaltySettings(form);
    if (success) {
      this.notificationService.show('Configurações de fidelidade salvas!', 'success');
    } else {
      await this.notificationService.alert(`Erro ao salvar: ${error?.message}`);
    }
  }

  openAddRewardModal() {
    this.editingReward.set(null);
    this.rewardForm.set({
      name: '',
      description: '',
      points_cost: 100,
      reward_type: 'discount_fixed',
      reward_value: '10', // Default value
      is_active: true
    });
    this.isRewardModalOpen.set(true);
  }

  openEditRewardModal(reward: LoyaltyReward) {
    this.editingReward.set(reward);
    this.rewardForm.set({ ...reward });
    this.isRewardModalOpen.set(true);
  }

  closeRewardModal() {
    this.isRewardModalOpen.set(false);
  }
  
  updateRewardFormField(field: keyof Omit<LoyaltyReward, 'id' | 'created_at' | 'user_id'>, value: string | boolean | number) {
    this.rewardForm.update(form => {
        const newForm = { ...form, [field]: value };
        if (field === 'reward_type') {
            newForm.reward_value = ''; // Reset value when type changes
        }
        return newForm;
    });
  }

  async saveReward() {
    const form = this.rewardForm();
    if (!form.name || !form.points_cost || !form.reward_type || !form.reward_value) {
        await this.notificationService.alert('Preencha todos os campos do prêmio.');
        return;
    }

    let result;
    if (this.editingReward()?.id) {
        result = await this.settingsDataService.updateLoyaltyReward({ ...form, id: this.editingReward()!.id });
    } else {
        result = await this.settingsDataService.addLoyaltyReward(form);
    }
    if (result.success) {
        this.closeRewardModal();
    } else {
        await this.notificationService.alert(`Erro ao salvar prêmio: ${result.error?.message}`);
    }
  }
  
  requestDeleteReward(reward: LoyaltyReward) { this.rewardPendingDeletion.set(reward); }
  cancelDeleteReward() { this.rewardPendingDeletion.set(null); }
  
  async confirmDeleteReward() {
    const reward = this.rewardPendingDeletion();
    if (!reward) return;
    const { success, error } = await this.settingsDataService.deleteLoyaltyReward(reward.id);
    if (!success) {
      await this.notificationService.alert(`Erro ao excluir prêmio: ${error?.message}`);
    }
    this.rewardPendingDeletion.set(null);
  }

  getRewardTypeLabel(type: LoyaltyRewardType): string {
    switch(type) {
      case 'discount_fixed': return 'Desconto (R$)';
      case 'discount_percentage': return 'Desconto (%)';
      case 'free_item': return 'Item Grátis';
      default: return 'Desconhecido';
    }
  }

  getRewardValueLabel(reward: LoyaltyReward): string {
    if (reward.reward_type === 'free_item') {
      return this.sellableRecipes().find(r => r.id === reward.reward_value)?.name || 'Item não encontrado';
    }
    if (reward.reward_type === 'discount_percentage') {
        return `${reward.reward_value}%`;
    }
    return `R$ ${reward.reward_value}`;
  }
}