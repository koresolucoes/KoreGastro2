import { Component, ChangeDetectionStrategy, inject, signal, computed, WritableSignal, effect, AfterViewInit } from '@angular/core';
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
import { AuthService } from '../../services/auth.service';
import { ALL_PERMISSION_KEYS } from '../../config/permissions';

import { SettingsListViewComponent } from './settings-list-view/settings-list-view.component';

declare var L: any; // Declare Leaflet global to avoid TypeScript errors

type SettingsView = 'profile' | 'stations' | 'recipe_categories' | 'ingredient_categories' | 'suppliers' | 'roles' | 'promotions' | 'reservations' | 'loyalty' | 'integrations' | 'webhooks';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, SettingsListViewComponent],
  templateUrl: './settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent implements AfterViewInit {
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
  private authService = inject(AuthService);

  // --- View State ---
  activeView = signal<SettingsView>('profile');
  isSaving = signal(false);

  // --- Map State ---
  private map: any;
  private marker: any;
  private radiusCircle: any;

  // --- Data from State Services ---
  companyProfile = this.settingsState.companyProfile;
  stations = this.posState.stations;
  recipeCategories = this.recipeState.categories;
  ingredientCategories = this.inventoryState.ingredientCategories;
  suppliers = this.inventoryState.suppliers;
  roles = this.hrState.roles;
  rolePermissions = this.hrState.rolePermissions;
  webhooks = this.settingsState.webhooks;
  
  // --- Form & Modal State ---
  profileForm = signal<Partial<CompanyProfile>>({});
  logoFile = signal<File | null>(null);
  coverFile = signal<File | null>(null);
  headerFile = signal<File | null>(null);
  logoPreview = signal<string | null>(null);
  coverPreview = signal<string | null>(null);
  headerPreview = signal<string | null>(null);

  isModalOpen = signal(false);
  modalTitle = signal('');
  editingItem = signal<{ id: string, name: string } | null>(null);
  formName = signal('');
  modalContext: WritableSignal<'station' | 'recipe_category' | 'ingredient_category' | 'supplier' | 'role' | null> = signal(null);

  isPermissionsModalOpen = signal(false);
  editingRolePermissions = signal<Role | null>(null);
  permissionsForm = signal<Set<string>>(new Set());
  allPermissions = ALL_PERMISSION_KEYS;

  isLoyaltyRewardModalOpen = signal(false);
  editingLoyaltyReward = signal<Partial<LoyaltyReward> | null>(null);
  
  isWebhookModalOpen = signal(false);
  editingWebhook = signal<Partial<Webhook> | null>(null);

  publicMenuUrl = computed(() => {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return '';
    return `${window.location.origin}/#/menu/${userId}`;
  });

  qrCodeUrl = computed(() => {
      const url = this.publicMenuUrl();
      if (!url) return '';
      return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(url)}`;
  });

  constructor() {
    this.setupFormEffects();
  }
  
  ngAfterViewInit(): void {
    if (this.activeView() === 'profile') {
      setTimeout(() => this.initMap(), 100);
    }
  }

  private setupFormEffects() {
    effect(() => {
      const profile = this.companyProfile();
      this.profileForm.set(profile ? { ...profile } : {});
      this.logoPreview.set(profile?.logo_url || null);
      this.coverPreview.set(profile?.menu_cover_url || null);
      this.headerPreview.set(profile?.menu_header_url || null);
    });

    effect(() => {
      if (this.activeView() === 'profile') {
        setTimeout(() => this.initMap(), 0);
      } else {
        if (this.map) {
          this.map.remove();
          this.map = null;
        }
      }
    });
  }
  
  private initMap() {
    if (this.map || !document.getElementById('map')) return;

    const profile = this.profileForm();
    const lat = profile?.latitude ?? -23.55052; // Default São Paulo
    const lon = profile?.longitude ?? -46.633308;
    const radius = profile?.time_clock_radius ?? 200;

    this.map = L.map('map').setView([lat, lon], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);

    this.marker = L.marker([lat, lon], { draggable: true }).addTo(this.map);
    this.radiusCircle = L.circle([lat, lon], { radius }).addTo(this.map);
    
    this.marker.on('dragend', (event: any) => {
      const position = event.target.getLatLng();
      this.radiusCircle.setLatLng(position);
      this.profileForm.update(p => ({ ...p, latitude: position.lat, longitude: position.lng }));
    });
  }

  updateRadius(radius: number) {
    if (this.radiusCircle) {
      this.radiusCircle.setRadius(radius);
    }
    this.profileForm.update(p => ({ ...p, time_clock_radius: radius }));
  }

  setView(view: SettingsView) {
    this.activeView.set(view);
  }

  updateProfileField(field: keyof CompanyProfile, value: string) {
    this.profileForm.update(p => ({...p, [field]: value}));
  }

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
      this.logoFile.set(null); this.coverFile.set(null); this.headerFile.set(null);
    } else {
      this.notificationService.show(`Erro ao salvar perfil: ${error.message}`, 'error');
    }
    this.isSaving.set(false);
  }

  // --- Generic Modal Logic ---
  openModal(context: 'station' | 'recipe_category' | 'ingredient_category' | 'supplier' | 'role', item: { id: string, name: string } | null) {
    this.modalContext.set(context);
    this.editingItem.set(item);
    this.formName.set(item?.name || '');
    this.modalTitle.set(`${item ? 'Editar' : 'Adicionar'} ${this.getContextTitle(context)}`);
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
  }

  async saveItem() {
    const context = this.modalContext();
    const name = this.formName().trim();
    if (!context || !name) return;

    this.isSaving.set(true);
    let result: { success: boolean; error: any; data?: any };
    const id = this.editingItem()?.id;

    switch (context) {
      case 'station': result = id ? await this.settingsDataService.updateStation(id, name) : await this.settingsDataService.addStation(name); break;
      case 'recipe_category': result = id ? await this.recipeDataService.updateRecipeCategory(id, name) : await this.recipeDataService.addRecipeCategory(name); break;
      case 'ingredient_category': result = id ? await this.inventoryDataService.updateIngredientCategory(id, name) : await this.inventoryDataService.addIngredientCategory(name); break;
      case 'supplier': result = id ? await this.inventoryDataService.updateSupplier({ id, name }) : await this.inventoryDataService.addSupplier({ name }); break;
      case 'role': result = id ? await this.settingsDataService.updateRole(id, name) : await this.settingsDataService.addRole(name); break;
      default: result = { success: false, error: { message: 'Contexto inválido' } };
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
      case 'station': result = await this.settingsDataService.deleteStation(item.id); break;
      case 'recipe_category': result = await this.recipeDataService.deleteRecipeCategory(item.id); break;
      case 'ingredient_category': result = await this.inventoryDataService.deleteIngredientCategory(item.id); break;
      case 'supplier': result = await this.inventoryDataService.deleteSupplier(item.id); break;
      case 'role': result = await this.settingsDataService.deleteRole(item.id); break;
      default: result = { success: false, error: { message: 'Contexto inválido' } };
    }
    if (!result.success) this.notificationService.show(`Erro: ${result.error.message}`, 'error');
    this.isSaving.set(false);
  }

  private getContextTitle(context: any): string {
    const titles = {
      station: 'Estação',
      recipe_category: 'Categoria de Prato',
      ingredient_category: 'Categoria de Ingrediente',
      supplier: 'Fornecedor',
      role: 'Cargo',
    };
    return titles[context] || '';
  }

  // --- Permissions Logic ---
  openPermissionsModal(role: Role) {
    this.editingRolePermissions.set(role);
    const currentPermissions = this.rolePermissions().filter(p => p.role_id === role.id).map(p => p.permission_key);
    this.permissionsForm.set(new Set(currentPermissions));
    this.isPermissionsModalOpen.set(true);
  }

  closePermissionsModal() {
    this.isPermissionsModalOpen.set(false);
  }

  togglePermission(key: string) {
    this.permissionsForm.update(currentSet => {
      const newSet = new Set(currentSet);
      newSet.has(key) ? newSet.delete(key) : newSet.add(key);
      return newSet;
    });
  }

  async savePermissions() {
    const role = this.editingRolePermissions();
    if (!role) return;
    this.isSaving.set(true);
    const { success, error } = await this.settingsDataService.updateRolePermissions(role.id, Array.from(this.permissionsForm()), this.authService.currentUser()!.id);
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
      'Isso irá invalidar sua chave de API externa atual. Deseja continuar?'
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
}
