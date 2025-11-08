
import { Component, ChangeDetectionStrategy, inject, signal, computed, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  Station, 
  IngredientCategory, 
  Supplier, 
  Category as RecipeCategory, 
  CompanyProfile, 
  Role, 
  RolePermission, 
  Promotion, 
  PromotionRecipe, 
  Recipe, 
  ReservationSettings,
  OperatingHours,
  LoyaltySettings,
  LoyaltyReward,
  Webhook,
  WebhookEvent,
  Employee
} from '../../models/db.models';

// State Services
import { SettingsStateService } from '../../services/settings-state.service';
import { PosStateService } from '../../services/pos-state.service';
import { InventoryStateService } from '../../services/inventory-state.service';
import { RecipeStateService } from '../../services/recipe-state.service';
import { HrStateService } from '../../services/hr-state.service';

// Data Services
import { SettingsDataService } from '../../services/settings-data.service';
import { PosDataService } from '../../services/pos-data.service';
import { InventoryDataService } from '../../services/inventory-data.service';
import { RecipeDataService } from '../../services/recipe-data.service';
import { ReservationDataService } from '../../services/reservation-data.service';
import { NotificationService } from '../../services/notification.service';
import { ALL_PERMISSION_KEYS } from '../../config/permissions';

type SettingsView = 'profile' | 'stations' | 'recipe_categories' | 'ingredient_categories' | 'suppliers' | 'roles' | 'promotions' | 'reservations' | 'loyalty' | 'integrations' | 'webhooks';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  // --- Injected Services ---
  private settingsState = inject(SettingsStateService);
  private posState = inject(PosStateService);
  private inventoryState = inject(InventoryStateService);
  private recipeState = inject(RecipeStateService);
  private hrState = inject(HrStateService);
  private settingsDataService = inject(SettingsDataService);
  private posDataService = inject(PosDataService);
  private inventoryDataService = inject(InventoryDataService);
  private recipeDataService = inject(RecipeDataService);
  private reservationDataService = inject(ReservationDataService);
  private notificationService = inject(NotificationService);

  // --- View State ---
  activeView = signal<SettingsView>('profile');
  isSaving = signal(false);

  // --- Data from State Services ---
  companyProfile = this.settingsState.companyProfile;
  stations = this.posState.stations;
  recipeCategories = this.recipeState.categories;
  ingredientCategories = this.inventoryState.ingredientCategories;
  suppliers = this.inventoryState.suppliers;
  roles = this.hrState.roles;
  rolePermissions = this.hrState.rolePermissions;
  recipes = this.recipeState.recipes;
  promotions = this.recipeState.promotions;
  reservationSettings = this.settingsState.reservationSettings;
  loyaltySettings = this.settingsState.loyaltySettings;
  loyaltyRewards = this.settingsState.loyaltyRewards;
  webhooks = this.settingsState.webhooks;
  allWebhookEvents: WebhookEvent[] = ['order.created', 'order.updated', 'stock.updated', 'customer.created'];

  // --- Form & Modal State ---

  // Profile
  profileForm = signal<Partial<CompanyProfile>>({});
  logoFile = signal<File | null>(null);
  coverFile = signal<File | null>(null);
  headerFile = signal<File | null>(null);
  logoPreview = signal<string | null>(null);
  coverPreview = signal<string | null>(null);
  headerPreview = signal<string | null>(null);

  // Generic add/edit for simple lists
  isModalOpen = signal(false);
  modalTitle = signal('');
  editingItem = signal<{ id: string, name: string } | null>(null);
  formName = signal('');
  modalContext: WritableSignal<'station' | 'recipe_category' | 'ingredient_category' | 'supplier' | 'role' | null> = signal(null);

  // Role permissions modal
  isPermissionsModalOpen = signal(false);
  editingRolePermissions = signal<Role | null>(null);
  permissionsForm = signal<Set<string>>(new Set());
  allPermissions = ALL_PERMISSION_KEYS;

  // Reservation settings
  reservationSettingsForm = signal<Partial<ReservationSettings>>({});

  // Loyalty
  loyaltySettingsForm = signal<Partial<LoyaltySettings>>({});
  isLoyaltyRewardModalOpen = signal(false);
  editingLoyaltyReward = signal<Partial<LoyaltyReward> | null>(null);
  
  // Webhooks
  isWebhookModalOpen = signal(false);
  editingWebhook = signal<Partial<Webhook> | null>(null);

  constructor() {
    this.setupFormEffects();
  }

  private setupFormEffects() {
    // Effect to reset and populate forms when data loads or view changes
    const profile = this.companyProfile();
    this.profileForm.set(profile ? { ...profile } : {});
    this.logoPreview.set(profile?.logo_url || null);
    this.coverPreview.set(profile?.menu_cover_url || null);
    this.headerPreview.set(profile?.menu_header_url || null);

    const resSettings = this.reservationSettings();
    this.reservationSettingsForm.set(resSettings ? { ...resSettings } : { is_enabled: false, booking_duration_minutes: 90, max_party_size: 10, min_party_size: 1, booking_notice_days: 30, weekly_hours: [] });

    const loySettings = this.loyaltySettings();
    this.loyaltySettingsForm.set(loySettings ? { ...loySettings } : { is_enabled: false, points_per_real: 1 });
  }

  // --- View Management ---
  setView(view: SettingsView) {
    this.activeView.set(view);
  }

  // --- Generic Modal Handlers ---
  openModal(context: 'station' | 'recipe_category' | 'ingredient_category' | 'supplier' | 'role', item: { id: string, name: string } | null) {
    this.modalContext.set(context);
    this.editingItem.set(item);
    this.formName.set(item?.name || '');
    this.modalTitle.set(`${item ? 'Editar' : 'Adicionar'} ${this.getContextTitle(context)}`);
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
    this.modalContext.set(null);
    this.editingItem.set(null);
    this.formName.set('');
  }

  private getContextTitle(context: 'station' | 'recipe_category' | 'ingredient_category' | 'supplier' | 'role' | null): string {
    switch (context) {
      case 'station': return 'Estação';
      case 'recipe_category': return 'Categoria de Prato';
      case 'ingredient_category': return 'Categoria de Ingrediente';
      case 'supplier': return 'Fornecedor';
      case 'role': return 'Cargo';
      default: return '';
    }
  }

  async saveItem() {
    const context = this.modalContext();
    const name = this.formName().trim();
    if (!context || !name) return;

    this.isSaving.set(true);
    let result: { success: boolean; error: any };
    const id = this.editingItem()?.id;

    switch (context) {
      case 'station':
        result = id ? await this.posDataService.updateStation(id, name) : await this.posDataService.addStation(name);
        break;
      case 'recipe_category':
        result = id ? await this.recipeDataService.updateRecipeCategory(id, name) : await this.recipeDataService.addRecipeCategory(name);
        break;
      case 'ingredient_category':
        result = id ? await this.inventoryDataService.updateIngredientCategory(id, name) : await this.inventoryDataService.addIngredientCategory(name);
        break;
      case 'supplier':
        result = id ? await this.inventoryDataService.updateSupplier({ id, name }) : await this.inventoryDataService.addSupplier({ name });
        break;
      case 'role':
        result = id ? await this.settingsDataService.updateRole(id, name) : await this.settingsDataService.addRole(name);
        break;
    }

    if (result.success) {
      this.closeModal();
    } else {
      this.notificationService.show(`Erro: ${result.error.message}`, 'error');
    }
    this.isSaving.set(false);
  }

  async deleteItem(context: 'station' | 'recipe_category' | 'ingredient_category' | 'supplier' | 'role', item: { id: string, name: string }) {
    const confirmed = await this.notificationService.confirm(`Tem certeza que deseja excluir "${item.name}"?`);
    if (!confirmed) return;

    this.isSaving.set(true);
    let result: { success: boolean; error: any };

    switch (context) {
      case 'station': result = await this.posDataService.deleteStation(item.id); break;
      case 'recipe_category': result = await this.recipeDataService.deleteRecipeCategory(item.id); break;
      case 'ingredient_category': result = await this.inventoryDataService.deleteIngredientCategory(item.id); break;
      case 'supplier': result = await this.inventoryDataService.deleteSupplier(item.id); break;
      case 'role': result = await this.settingsDataService.deleteRole(item.id); break;
    }

    if (!result.success) {
      this.notificationService.show(`Erro: ${result.error.message}`, 'error');
    }
    this.isSaving.set(false);
  }

  // --- Profile Handlers ---
  handleFileChange(event: Event, type: 'logo' | 'cover' | 'header') {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (type === 'logo') { this.logoFile.set(file); this.logoPreview.set(result); }
        if (type === 'cover') { this.coverFile.set(file); this.coverPreview.set(result); }
        if (type === 'header') { this.headerFile.set(file); this.headerPreview.set(result); }
      };
      reader.readAsDataURL(file);
    }
  }

  async saveProfile() {
    this.isSaving.set(true);
    const { success, error } = await this.settingsDataService.updateCompanyProfile(this.profileForm(), this.logoFile(), this.coverFile(), this.headerFile());
    if (success) {
      this.notificationService.show('Perfil da empresa salvo com sucesso!', 'success');
      this.logoFile.set(null); // Clear file signals after upload
      this.coverFile.set(null);
      this.headerFile.set(null);
    } else {
      this.notificationService.show(`Erro ao salvar perfil: ${error.message}`, 'error');
    }
    this.isSaving.set(false);
  }

  // --- Roles & Permissions Handlers ---
  openPermissionsModal(role: Role) {
    this.editingRolePermissions.set(role);
    const currentPermissions = this.rolePermissions().filter(p => p.role_id === role.id).map(p => p.permission_key);
    this.permissionsForm.set(new Set(currentPermissions));
    this.isPermissionsModalOpen.set(true);
  }

  closePermissionsModal() {
    this.isPermissionsModalOpen.set(false);
    this.editingRolePermissions.set(null);
  }

  togglePermission(key: string) {
    this.permissionsForm.update(currentSet => {
      const newSet = new Set(currentSet);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  }

  async savePermissions() {
    const role = this.editingRolePermissions();
    if (!role) return;

    this.isSaving.set(true);
    const { success, error } = await this.settingsDataService.updateRolePermissions(role.id, Array.from(this.permissionsForm()), '');
    if (success) {
      this.notificationService.show(`Permissões para "${role.name}" salvas!`, 'success');
      this.closePermissionsModal();
    } else {
      this.notificationService.show(`Erro: ${error.message}`, 'error');
    }
    this.isSaving.set(false);
  }

  // --- Integrations ---
  async regenerateApiKey() {
    const confirmed = await this.notificationService.confirm(
      'Isso irá invalidar sua chave de API externa atual. Qualquer integração que a utilize precisará ser atualizada. Deseja continuar?'
    );
    if (!confirmed) return;
    
    this.isSaving.set(true);
    const { success, error, data } = await this.settingsDataService.regenerateExternalApiKey();
    if (success && data) {
      this.profileForm.update(p => ({ ...p, external_api_key: data.external_api_key }));
      this.notificationService.show('Nova chave de API gerada com sucesso!', 'success');
    } else {
      this.notificationService.show(`Erro: ${error.message}`, 'error');
    }
    this.isSaving.set(false);
  }

  // --- Reservations ---
  async saveReservationSettings() {
    this.isSaving.set(true);
    const { success, error } = await this.reservationDataService.updateReservationSettings(this.reservationSettingsForm());
     if (success) {
      this.notificationService.show('Configurações de reserva salvas!', 'success');
    } else {
      this.notificationService.show(`Erro: ${error.message}`, 'error');
    }
    this.isSaving.set(false);
  }

  // --- Loyalty ---
  async saveLoyaltySettings() {
    this.isSaving.set(true);
    const { success, error } = await this.settingsDataService.upsertLoyaltySettings(this.loyaltySettingsForm());
    if (success) {
      this.notificationService.show('Configurações de fidelidade salvas!', 'success');
    } else {
      this.notificationService.show(`Erro: ${error.message}`, 'error');
    }
    this.isSaving.set(false);
  }

  openLoyaltyRewardModal(reward: Partial<LoyaltyReward> | null) {
    this.editingLoyaltyReward.set(reward);
    this.isLoyaltyRewardModalOpen.set(true);
  }

  closeLoyaltyRewardModal() {
    this.isLoyaltyRewardModalOpen.set(false);
    this.editingLoyaltyReward.set(null);
  }

  async saveLoyaltyReward(reward: Partial<LoyaltyReward>) {
    this.isSaving.set(true);
    const result = reward.id
      ? await this.settingsDataService.updateLoyaltyReward(reward)
      : await this.settingsDataService.addLoyaltyReward(reward);
    
    if (result.success) {
      this.closeLoyaltyRewardModal();
    } else {
      this.notificationService.show(`Erro: ${result.error.message}`, 'error');
    }
    this.isSaving.set(false);
  }

  async deleteLoyaltyReward(reward: LoyaltyReward) {
    const confirmed = await this.notificationService.confirm(`Excluir a recompensa "${reward.name}"?`);
    if (!confirmed) return;

    const { success, error } = await this.settingsDataService.deleteLoyaltyReward(reward.id);
    if (!success) {
      this.notificationService.show(`Erro: ${error.message}`, 'error');
    }
  }

  // --- Webhooks ---
  openWebhookModal(webhook: Partial<Webhook> | null) {
    this.editingWebhook.set(webhook);
    this.isWebhookModalOpen.set(true);
  }

  closeWebhookModal() {
    this.isWebhookModalOpen.set(false);
    this.editingWebhook.set(null);
  }
  
  // Omitted save/delete webhook methods as they require new data service methods
  // which are outside the scope of fixing the current error.
  // Will provide stubs for now.

  async saveWebhook(webhook: Partial<Webhook>) {
      this.notificationService.show('Funcionalidade de salvar webhook ainda não implementada.', 'info');
      this.closeWebhookModal();
  }

  async deleteWebhook(webhook: Webhook) {
      this.notificationService.show('Funcionalidade de deletar webhook ainda não implementada.', 'info');
  }

}
