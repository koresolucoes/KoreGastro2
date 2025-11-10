import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Station, IngredientCategory, Category, ReservationSettings, CompanyProfile, Role, LoyaltySettings, LoyaltyReward, Recipe, LoyaltyRewardType, OperatingHours, Supplier, Webhook, WebhookEvent } from '../../models/db.models';
import { SettingsDataService } from '../../services/settings-data.service';
import { InventoryDataService } from '../../services/inventory-data.service';
import { RecipeDataService } from '../../services/recipe-data.service';
import { NotificationService } from '../../services/notification.service';
import { AuthService } from '../../services/auth.service';
import { ReservationDataService } from '../../services/reservation-data.service';
import { ALL_PERMISSION_KEYS } from '../../config/permissions';
import { OperationalAuthService } from '../../services/operational-auth.service';

// Import new state services
import { PosStateService } from '../../services/pos-state.service';
import { InventoryStateService } from '../../services/inventory-state.service';
import { RecipeStateService } from '../../services/recipe-state.service';
import { SettingsStateService } from '../../services/settings-state.service';
import { HrStateService } from '../../services/hr-state.service';
import { SubscriptionStateService } from '../../services/subscription-state.service';
import { DemoService } from '../../services/demo.service';

declare var L: any; // Declare Leaflet

type SettingsTab = 'empresa' | 'operacao' | 'funcionalidades' | 'seguranca';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  // Data services
  private settingsDataService = inject(SettingsDataService);
  private inventoryDataService = inject(InventoryDataService);
  private recipeDataService = inject(RecipeDataService);
  private reservationDataService = inject(ReservationDataService);
  
  // Auth & Notification services
  private notificationService = inject(NotificationService);
  authService = inject(AuthService);
  private operationalAuthService = inject(OperationalAuthService);

  // New state services
  private posState = inject(PosStateService);
  private inventoryState = inject(InventoryStateService);
  private recipeState = inject(RecipeStateService);
  private settingsState = inject(SettingsStateService);
  private hrState = inject(HrStateService);
  private subscriptionState = inject(SubscriptionStateService);
  private demoService = inject(DemoService);

  // Map related properties
  @ViewChild('mapContainer') mapContainer!: ElementRef;
  private map: any;
  private marker: any;
  private circle: any;
  private mapInitialized = false;

  // Data Signals from new services
  stations = this.posState.stations;
  categories = this.inventoryState.ingredientCategories;
  suppliers = this.inventoryState.suppliers;
  recipeCategories = this.recipeState.categories;
  recipes = this.recipeState.recipes;
  reservationSettings = this.settingsState.reservationSettings;
  companyProfile = this.settingsState.companyProfile;
  roles = this.hrState.roles;
  rolePermissions = this.hrState.rolePermissions;
  loyaltySettings = this.settingsState.loyaltySettings;
  loyaltyRewards = this.settingsState.loyaltyRewards;
  subscription = this.subscriptionState.subscription;
  currentPlan = this.subscriptionState.currentPlan;
  trialDaysRemaining = this.subscriptionState.trialDaysRemaining;

  // For template display
  daysOfWeek = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  webhookUrl = 'https://gastro.koresolucoes.com.br/api/ifood-webhook';

  // Tab state
  activeTab = signal<SettingsTab>('empresa');

  // Reservation Form
  reservationForm = signal<Partial<ReservationSettings>>({});
  
  // Company Profile Form
  companyProfileForm = signal<Partial<CompanyProfile>>({});
  logoFile = signal<File | null>(null);
  logoPreviewUrl = signal<string | null>(null);
  coverFile = signal<File | null>(null);
  coverPreviewUrl = signal<string | null>(null);
  headerFile = signal<File | null>(null);
  headerPreviewUrl = signal<string | null>(null);

  // Search terms
  stationSearchTerm = signal('');
  categorySearchTerm = signal('');
  recipeCategorySearchTerm = signal('');
  supplierSearchTerm = signal('');

  // Role Management State
  allPermissions = ALL_PERMISSION_KEYS;
  
  private allPermissionGroups = [
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
      name: 'Delivery',
      permissions: [
        { key: '/delivery', label: 'Painel de Delivery' }
      ]
    },
    {
      name: 'iFood',
      permissions: [
        { key: '/ifood-kds', label: 'KDS Delivery' },
        { key: '/ifood-menu', label: 'Cardápio iFood' },
        { key: '/ifood-store-manager', label: 'Gestor de Loja' },
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
        { key: '/suppliers', label: 'Fornecedores' },
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
        { key: '/my-profile', label: 'Meu Perfil' },
        { key: '/tutorials', label: 'Tutoriais' },
        { key: '/settings', label: 'Configurações' }
      ]
    }
  ];

  userAvailablePermissions = computed(() => {
    const activeEmployee = this.operationalAuthService.activeEmployee();
    if (!activeEmployee || !activeEmployee.role_id) return new Set<string>();

    return new Set(
        this.rolePermissions()
            .filter(p => p.role_id === activeEmployee.role_id)
            .map(p => p.permission_key)
    );
  });

  permissionGroups = computed(() => {
    const isGerente = this.operationalAuthService.activeEmployee()?.role === 'Gerente';
    
    if (isGerente) {
      return this.allPermissionGroups;
    }

    const available = this.userAvailablePermissions();
    return this.allPermissionGroups.map(group => ({
        ...group,
        permissions: group.permissions.filter(p => available.has(p.key))
    })).filter(group => group.permissions.length > 0);
  });

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

  // Webhook State
  webhooks = this.settingsState.webhooks;
  isWebhookModalOpen = signal(false);
  editingWebhook = signal<Webhook | null>(null);
  webhookForm = signal<{ url: string; events: WebhookEvent[] }>({ url: '', events: [] });
  availableWebhookEvents: { key: WebhookEvent, label: string }[] = [
    { key: 'order.created', label: 'Pedido Criado' },
    { key: 'order.updated', label: 'Pedido Atualizado' },
    { key: 'stock.updated', label: 'Estoque Atualizado' },
    { key: 'customer.created', label: 'Cliente Criado' },
    { key: 'delivery.created', label: 'Pedido de Entrega Criado' },
    { key: 'delivery.status_updated', label: 'Status de Entrega Atualizado' },
  ];
  webhookToDelete = signal<Webhook | null>(null);
  newWebhookSecret = signal<string | null>(null); // To show secret only once after creation

  qrCodeUrl = computed(() => {
    const userId = this.demoService.isDemoMode() ? 'demo-user' : this.authService.currentUser()?.id;
    if (!userId) return '';
    const menuUrl = `https://gastro.koresolucoes.com.br/#/menu/${userId}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(menuUrl)}`;
  });

  publicMenuUrl = computed(() => {
    const userId = this.demoService.isDemoMode() ? 'demo-user' : this.authService.currentUser()?.id;
    if (!userId) return '';
    return `https://gastro.koresolucoes.com.br/#/menu/${userId}`;
  });

  publicBookingUrl = computed(() => {
    const userId = this.demoService.isDemoMode() ? 'demo-user' : this.authService.currentUser()?.id;
    if (!userId) return '';
    return `https://gastro.koresolucoes.com.br/#/book/${userId}`;
  });

  apiAccessQrCodeData = computed(() => {
    const userId = this.authService.currentUser()?.id;
    const apiKey = this.companyProfileForm().external_api_key;
    if (!userId || !apiKey) {
      return null;
    }
    const data = {
      restaurantId: userId,
      apiKey: apiKey,
    };
    return JSON.stringify(data);
  });

  apiAccessQrCodeUrl = computed(() => {
    const data = this.apiAccessQrCodeData();
    if (!data) {
      return '';
    }
    return `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(data)}`;
  });

  constructor() {
    effect(() => {
        const settings = this.reservationSettings();
        if (settings) {
            const weeklyHours = settings.weekly_hours || [];
            const fullWeeklyHours: OperatingHours[] = Array.from({ length: 7 }, (_, i) => {
                const existing = weeklyHours.find(h => h.day_of_week === i);
                return existing || {
                    day_of_week: i,
                    opening_time: '18:00',
                    closing_time: '23:00',
                    is_closed: true,
                };
            });
            this.reservationForm.set({ ...settings, weekly_hours: fullWeeklyHours });
        } else {
            const defaultWeeklyHours: OperatingHours[] = Array.from({ length: 7 }, (_, i) => ({
                day_of_week: i,
                opening_time: '18:00',
                closing_time: '23:00',
                is_closed: i === 1,
            }));
            this.reservationForm.set({
                is_enabled: false,
                weekly_hours: defaultWeeklyHours,
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
            this.logoPreviewUrl.set(profile.logo_url);
            this.coverPreviewUrl.set(profile.menu_cover_url);
            this.headerPreviewUrl.set(profile.menu_header_url);
        } else {
            this.companyProfileForm.set({ company_name: '', cnpj: '', address: '', phone: '', ifood_merchant_id: null});
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

    // Effect for map initialization and updates
    effect(() => {
        const tab = this.activeTab();
        
        // Initialize map only when the tab is visible and it's not already initialized
        if (tab === 'empresa' && !this.mapInitialized) {
            // Defer to make sure ViewChild is available.
            setTimeout(() => {
                if (this.mapContainer?.nativeElement) {
                    this.initMap();
                }
            }, 0);
        }
        
        // Sync form changes to map (marker, circle, and view)
        const profile = this.companyProfileForm();
        if (this.mapInitialized && this.map) {
            const lat = profile.latitude ?? -15.793889;
            const lon = profile.longitude ?? -47.882778;
            const radius = profile.time_clock_radius ?? 100;
            const latLng = L.latLng(lat, lon);

            if (this.marker) this.marker.setLatLng(latLng);
            if (this.circle) {
                this.circle.setLatLng(latLng);
                this.circle.setRadius(radius);
            }
            
            const currentCenter = this.map.getCenter();
            if (currentCenter.distanceTo(latLng) > 1) { // Only re-center if distance is more than 1 meter
                this.map.flyTo(latLng, this.map.getZoom());
            }
        }
    });
  }

  private initMap(): void {
    if (this.map || !this.mapContainer?.nativeElement) {
        return; // Already initialized or container not ready
    }

    const profile = this.companyProfileForm();
    const lat = profile.latitude ?? -15.793889;
    const lon = profile.longitude ?? -47.882778;
    const radius = profile.time_clock_radius ?? 100;

    this.map = L.map(this.mapContainer.nativeElement).setView([lat, lon], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);

    this.marker = L.marker([lat, lon]).addTo(this.map);

    this.circle = L.circle([lat, lon], {
        color: 'blue',
        fillColor: '#3b82f6',
        fillOpacity: 0.3,
        radius: radius
    }).addTo(this.map);

    this.map.on('click', (e: any) => {
        const newLat = e.latlng.lat;
        const newLng = e.latlng.lng;
        
        // Update form state directly, the effect will sync the map
        this.companyProfileForm.update(form => ({
            ...form,
            latitude: newLat,
            longitude: newLng,
        }));
    });

    this.mapInitialized = true;
  }

  setActiveTab(tab: SettingsTab) {
    this.activeTab.set(tab);
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
  
  // --- Supplier Management (Removed as per user request) ---
  isSupplierModalOpen = signal(false);
  editingSupplier = signal<Partial<Supplier> | null>(null);
  supplierForm = signal<Partial<Supplier>>({});
  supplierPendingDeletion = signal<Supplier | null>(null);
  
  filteredSuppliers = computed(() => {
    const term = this.supplierSearchTerm().toLowerCase();
    if (!term) return this.suppliers();
    return this.suppliers().filter(s => s.name.toLowerCase().includes(term));
  });

  openAddSupplierModal() {
    this.supplierForm.set({});
    this.editingSupplier.set(null);
    this.isSupplierModalOpen.set(true);
  }
  
  openEditSupplierModal(s: Supplier) {
    this.editingSupplier.set(s);
    this.supplierForm.set({ ...s });
    this.isSupplierModalOpen.set(true);
  }
  
  closeSupplierModal() { this.isSupplierModalOpen.set(false); }

  updateSupplierFormField(field: keyof Omit<Supplier, 'id' | 'created_at' | 'user_id'>, value: string) {
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
      this.closeSupplierModal();
    } else {
      await this.notificationService.alert(`Falha: ${res.error?.message}`);
    }
  }

  requestDeleteSupplier(s: Supplier) { this.supplierPendingDeletion.set(s); }
  cancelDeleteSupplier() { this.supplierPendingDeletion.set(null); }
  async confirmDeleteSupplier() {
    const supplier = this.supplierPendingDeletion();
    if (!supplier) return;
    const { success, error } = await this.inventoryDataService.deleteSupplier(supplier.id);
    if (!success) {
      await this.notificationService.alert(`Falha: ${error?.message}`);
    }
    this.supplierPendingDeletion.set(null);
  }


  // --- Recipe Category Management ---
  isRecipeCategoryModalOpen = signal(false);
  newRecipeCategoryName = signal('');
  editingRecipeCategory = signal<Category | null>(null);
  recipeCategoryPendingDeletion = signal<Category | null>(null);
  recipeCategoryImageFile = signal<File | null>(null);
  recipeCategoryImagePreviewUrl = signal<string | null>(null);

  openAddRecipeCategoryModal() {
    this.editingRecipeCategory.set(null);
    this.newRecipeCategoryName.set('');
    this.recipeCategoryImageFile.set(null);
    this.recipeCategoryImagePreviewUrl.set(null);
    this.isRecipeCategoryModalOpen.set(true);
  }

  openEditRecipeCategoryModal(c: Category) {
    this.editingRecipeCategory.set({ ...c });
    this.newRecipeCategoryName.set(c.name);
    this.recipeCategoryImageFile.set(null);
    this.recipeCategoryImagePreviewUrl.set(c.image_url);
    this.isRecipeCategoryModalOpen.set(true);
  }

  closeRecipeCategoryModal() {
    this.isRecipeCategoryModalOpen.set(false);
  }
  
  handleRecipeCategoryImageChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.recipeCategoryImageFile.set(file);
      const reader = new FileReader();
      reader.onload = (e) => this.recipeCategoryImagePreviewUrl.set(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  }

  async saveRecipeCategory() {
    const name = this.newRecipeCategoryName().trim();
    if (!name) {
      await this.notificationService.alert('O nome da categoria é obrigatório.');
      return;
    }
    const imageFile = this.recipeCategoryImageFile();
    const editingCategory = this.editingRecipeCategory();
    
    let result;
    if (editingCategory) {
      result = await this.recipeDataService.updateRecipeCategory(editingCategory.id, name, imageFile);
    } else {
      result = await this.recipeDataService.addRecipeCategory(name, imageFile);
    }

    if (result.success) {
      this.closeRecipeCategoryModal();
    } else {
      await this.notificationService.alert(`Falha: ${result.error?.message}`);
    }
  }

  requestDeleteRecipeCategory(c: Category) { this.recipeCategoryPendingDeletion.set(c); }
  cancelDeleteRecipeCategory() { this.recipeCategoryPendingDeletion.set(null); }
  async confirmDeleteRecipeCategory() {
    const category = this.recipeCategoryPendingDeletion(); if (!category) return;
    const { success, error } = await this.recipeDataService.deleteRecipeCategory(category.id);
    if (!success) { await this.notificationService.alert(`Falha ao deletar. Erro: ${error?.message}`); }
    this.recipeCategoryPendingDeletion.set(null);
  }

  // --- Reservation Settings ---
  updateReservationFormField(field: keyof Omit<ReservationSettings, 'id' | 'created_at' | 'user_id' | 'weekly_hours'>, value: any) {
    if (field === 'is_enabled') {
        this.reservationForm.update(form => ({ ...form, [field]: !!value }));
    } else {
        this.reservationForm.update(form => ({ ...form, [field]: value }));
    }
  }

  updateWeeklyHours(dayIndex: number, field: 'opening_time' | 'closing_time' | 'is_closed', value: string | boolean) {
    this.reservationForm.update(form => {
      const newHours = form.weekly_hours ? [...form.weekly_hours] : [];
      if (newHours[dayIndex]) {
        const updatedDay = { ...newHours[dayIndex], [field]: value };
        newHours[dayIndex] = updatedDay;
        return { ...form, weekly_hours: newHours };
      }
      return form;
    });
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
  updateCompanyProfileField(field: keyof Omit<CompanyProfile, 'user_id' | 'created_at' | 'logo_url' | 'menu_cover_url' | 'menu_header_url'>, value: string) {
      this.companyProfileForm.update(form => ({ ...form, [field]: value }));
  }
  
  handleLogoFileChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.logoFile.set(file);
      const reader = new FileReader();
      reader.onload = (e) => this.logoPreviewUrl.set(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  }

  handleCoverFileChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.coverFile.set(file);
      const reader = new FileReader();
      reader.onload = (e) => this.coverPreviewUrl.set(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  }

  handleHeaderFileChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.headerFile.set(file);
      const reader = new FileReader();
      reader.onload = (e) => this.headerPreviewUrl.set(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  }
  
  async saveCompanyProfile() {
      const profileForm = this.companyProfileForm();
      if (!profileForm.company_name || !profileForm.cnpj) {
          await this.notificationService.alert('Nome da Empresa e CNPJ são obrigatórios.');
          return;
      }
      
      const { success, error } = await this.settingsDataService.updateCompanyProfile(profileForm, this.logoFile(), this.coverFile(), this.headerFile());

      if (success) {
          await this.notificationService.alert('Dados da empresa salvos com sucesso!', 'Sucesso');
          this.logoFile.set(null);
          this.coverFile.set(null);
          this.headerFile.set(null);
      } else {
          await this.notificationService.alert(`Falha ao salvar. Erro: ${error?.message}`);
      }
  }

  async copyToClipboard(text: string | null | undefined) {
    if (!text) {
      this.notificationService.show('Nenhum texto para copiar.', 'warning');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      this.notificationService.show('Copiado para a área de transferência!', 'success');
    } catch (err) {
      await this.notificationService.alert('Falha ao copiar.');
    }
  }

  async regenerateApiKey() {
    const confirmed = await this.notificationService.confirm(
      'Gerar uma nova chave de API irá invalidar permanentemente a chave atual. Qualquer sistema usando a chave antiga deixará de funcionar. Deseja continuar?',
      'Gerar Nova Chave de API?'
    );
    if (confirmed) {
      const { success, error, data } = await this.settingsDataService.regenerateExternalApiKey();
      if (success && data) {
        this.companyProfileForm.update(form => ({ ...form, external_api_key: data.external_api_key }));
        await this.notificationService.alert('Nova chave de API gerada com sucesso! Não se esqueça de atualizar seus sistemas integrados.', 'Sucesso');
      } else {
        await this.notificationService.alert(`Erro ao gerar nova chave: ${error?.message}`);
      }
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
    this.rolePermissionsForm.update(form => ({ ...form, [key]: isChecked }));
  }

  async savePermissions() {
    const role = this.editingRole();
    const activeEmployee = this.operationalAuthService.activeEmployee();
    if (!role || !activeEmployee?.role_id) return;
    
    const permissions = Object.entries(this.rolePermissionsForm())
      .filter(([, isEnabled]) => isEnabled)
      .map(([key]) => key);

    const { success, error } = await this.settingsDataService.updateRolePermissions(role.id, permissions, activeEmployee.role_id);
    if (success) {
      this.closePermissionsModal();
    } else {
      await this.notificationService.alert(`Erro ao salvar permissões: ${error?.message}`);
    }
  }

  async handleAddRole() {
    const { confirmed, value: roleName } = await this.notificationService.prompt('Qual o nome do novo cargo?', 'Novo Cargo', { placeholder: 'Ex: Cozinha' });
    if (confirmed && roleName) {
      const { success, error } = await this.settingsDataService.addRole(roleName);
      if (!success) {
        await this.notificationService.alert(`Erro ao criar cargo: ${error?.message}`);
      }
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
    if (role) {
      const { success, error } = await this.settingsDataService.deleteRole(role.id);
      if (!success) {
        await this.notificationService.alert(`Erro ao deletar cargo: ${error?.message}`);
      }
      this.rolePendingDeletion.set(null);
    }
  }
  
  // --- Loyalty Program ---
  getRewardValueLabel(reward: LoyaltyReward): string {
    const recipesMap = new Map(this.recipes().map(r => [r.id, r.name]));
    switch (reward.reward_type) {
      case 'free_item':
        return `Item Grátis: ${recipesMap.get(reward.reward_value) || 'Item especial'}`;
      case 'discount_percentage':
        return `${reward.reward_value}% de desconto`;
      case 'discount_fixed':
        return `R$ ${reward.reward_value} de desconto`;
    }
  }
  getRewardTypeLabel(type: LoyaltyRewardType): string {
    switch (type) {
        case 'discount_fixed': return 'Desconto (R$)';
        case 'discount_percentage': return 'Desconto (%)';
        case 'free_item': return 'Item Grátis';
    }
  }
  
  updateLoyaltySettingsField(field: keyof Omit<LoyaltySettings, 'user_id' | 'created_at'>, value: any) {
    this.loyaltySettingsForm.update(form => {
        if (field === 'is_enabled') return { ...form, [field]: !!value };
        if (field === 'points_per_real') return { ...form, [field]: Number(value) };
        return form;
    });
  }

  async saveLoyaltySettings() {
    const form = this.loyaltySettingsForm();
    const { success, error } = await this.settingsDataService.upsertLoyaltySettings(form);
    if (success) {
      this.notificationService.show('Configurações salvas!', 'success');
    } else {
      await this.notificationService.alert(`Erro: ${error?.message}`);
    }
  }

  openAddRewardModal() {
    this.editingReward.set(null);
    this.rewardForm.set({
      name: '',
      description: '',
      points_cost: 100,
      reward_type: 'discount_fixed',
      reward_value: '10', // 10 reais
      is_active: true
    });
    this.isRewardModalOpen.set(true);
  }
  
  openEditRewardModal(reward: LoyaltyReward) {
    this.editingReward.set(reward);
    this.rewardForm.set({ ...reward });
    this.isRewardModalOpen.set(true);
  }

  closeRewardModal() { this.isRewardModalOpen.set(false); }

  updateRewardFormField(field: keyof Omit<LoyaltyReward, 'id' | 'user_id' | 'created_at'>, value: any) {
    this.rewardForm.update(form => {
        if(field === 'is_active') return { ...form, [field]: !!value };
        if(field === 'points_cost') return { ...form, [field]: Number(value) };
        if(field === 'reward_type') {
            const newForm = { ...form, [field]: value };
            // Reset reward_value when type changes
            newForm.reward_value = value === 'free_item' ? '' : '10';
            return newForm;
        }
        return { ...form, [field]: value };
    });
  }

  async saveReward() {
    const form = this.rewardForm();
    if (!form.name?.trim() || !form.reward_value?.trim()) {
        await this.notificationService.alert('Nome e valor da recompensa são obrigatórios.');
        return;
    }
    const result = this.editingReward()
      ? await this.settingsDataService.updateLoyaltyReward({ ...form, id: this.editingReward()!.id })
      : await this.settingsDataService.addLoyaltyReward(form);
    
    if (result.success) {
        this.closeRewardModal();
    } else {
        await this.notificationService.alert(`Erro: ${result.error?.message}`);
    }
  }

  requestDeleteReward(reward: LoyaltyReward) { this.rewardPendingDeletion.set(reward); }
  cancelDeleteReward() { this.rewardPendingDeletion.set(null); }
  async confirmDeleteReward() {
    const reward = this.rewardPendingDeletion();
    if(reward) {
        const { success, error } = await this.settingsDataService.deleteLoyaltyReward(reward.id);
        if(!success) await this.notificationService.alert(`Erro: ${error?.message}`);
        this.rewardPendingDeletion.set(null);
    }
  }

  // --- Webhook Methods ---
  openAddWebhookModal() {
    this.editingWebhook.set(null);
    this.webhookForm.set({ url: '', events: [] });
    this.newWebhookSecret.set(null);
    this.isWebhookModalOpen.set(true);
  }

  openEditWebhookModal(webhook: Webhook) {
    this.editingWebhook.set(webhook);
    this.webhookForm.set({ url: webhook.url, events: [...webhook.events] });
    this.newWebhookSecret.set(null);
    this.isWebhookModalOpen.set(true);
  }

  closeWebhookModal() {
    this.isWebhookModalOpen.set(false);
    this.newWebhookSecret.set(null);
  }

  updateWebhookFormField(field: 'url' | 'events', value: any) {
    this.webhookForm.update(form => ({ ...form, [field]: value }));
  }

  toggleWebhookEvent(event: WebhookEvent) {
    this.webhookForm.update(form => {
      const newEvents = new Set(form.events);
      if (newEvents.has(event)) {
        newEvents.delete(event);
      } else {
        newEvents.add(event);
      }
      return { ...form, events: Array.from(newEvents) };
    });
  }

  async saveWebhook() {
    const form = this.webhookForm();
    if (!form.url.trim() || !form.url.startsWith('https://')) {
      this.notificationService.show('Por favor, insira uma URL válida começando com https://', 'warning');
      return;
    }
    if (form.events.length === 0) {
      this.notificationService.show('Selecione pelo menos um evento para o webhook.', 'warning');
      return;
    }

    if (this.editingWebhook()) {
      // Update
      const { success, error } = await this.settingsDataService.updateWebhook(this.editingWebhook()!.id, { ...form });
      if (success) {
        this.notificationService.show('Webhook atualizado!', 'success');
        this.closeWebhookModal();
      } else {
        this.notificationService.show(`Erro: ${error?.message}`, 'error');
      }
    } else {
      // Create
      const { data, error } = await this.settingsDataService.addWebhook(form.url, form.events);
      if (data) {
        this.newWebhookSecret.set(data.secret); // Show the secret to the user
      } else {
        this.notificationService.show(`Erro ao criar webhook: ${error?.message}`, 'error');
        this.closeWebhookModal();
      }
    }
  }
  
  requestDeleteWebhook(webhook: Webhook) {
    this.webhookToDelete.set(webhook);
  }

  cancelDeleteWebhook() {
    this.webhookToDelete.set(null);
  }

  async confirmDeleteWebhook() {
    const webhook = this.webhookToDelete();
    if (webhook) {
      const { success, error } = await this.settingsDataService.deleteWebhook(webhook.id);
      if (!success) {
        this.notificationService.show(`Erro ao deletar: ${error?.message}`, 'error');
      }
      this.webhookToDelete.set(null);
    }
  }
}