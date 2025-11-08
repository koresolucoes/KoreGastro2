
import { Component, ChangeDetectionStrategy, signal, computed, inject, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  CompanyProfile, Station, Role, IngredientCategory, Supplier, Category as RecipeCategory, Promotion,
  PromotionRecipe, DiscountType, Recipe, ReservationSettings, OperatingHours,
  LoyaltySettings, LoyaltyReward, LoyaltyRewardType, Webhook, WebhookEvent
} from '../../models/db.models';
import { SettingsDataService } from '../../services/settings-data.service';
import { InventoryDataService } from '../../services/inventory-data.service';
import { RecipeDataService } from '../../services/recipe-data.service';
import { ReservationDataService } from '../../services/reservation-data.service';
import { NotificationService } from '../../services/notification.service';
import { SettingsStateService } from '../../services/settings-state.service';
import { InventoryStateService } from '../../services/inventory-state.service';
import { RecipeStateService } from '../../services/recipe-state.service';
import { PosStateService } from '../../services/pos-state.service';
import { HrStateService } from '../../services/hr-state.service';
import { ALL_PERMISSION_KEYS } from '../../config/permissions';

type SettingsTab = 'company' | 'stations' | 'roles' | 'categories' | 'suppliers' | 'promotions' | 'reservations' | 'loyalty' | 'integrations' | 'webhooks';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="h-full flex flex-col p-4 md:p-6 bg-gray-900 text-gray-200">
      <header class="mb-6">
        <h1 class="text-3xl font-bold text-white">Configurações</h1>
        <p class="text-gray-400">Gerencie todos os aspectos do seu restaurante.</p>
      </header>

      <div class="flex-grow flex flex-col md:flex-row gap-6 overflow-y-auto">
        <!-- Sidebar Navigation -->
        <aside class="w-full md:w-64 flex-shrink-0 bg-gray-800 rounded-lg p-2 md:p-4 self-start">
          <nav class="flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0">
            @for (tab of tabs; track tab.id) {
              <button 
                (click)="activeTab.set(tab.id)"
                [class.bg-blue-600]="activeTab() === tab.id"
                [class.text-white]="activeTab() === tab.id"
                class="flex items-center gap-3 px-4 py-2.5 rounded-md text-sm font-medium hover:bg-gray-700 transition-colors flex-shrink-0">
                <span class="material-symbols-outlined">{{ tab.icon }}</span>
                <span class="hidden md:inline">{{ tab.name }}</span>
              </button>
            }
          </nav>
        </aside>

        <!-- Main Content -->
        <main class="flex-grow bg-gray-800 rounded-lg p-6 overflow-y-auto">
          @switch (activeTab()) {
            @case ('company') {
              <!-- Company Profile Section -->
              <section>
                <h2 class="text-2xl font-semibold mb-4 text-white">Perfil da Empresa</h2>
                <div class="space-y-4">
                   <div>
                    <label for="company_name" class="block text-sm font-medium text-gray-300">Nome do Restaurante</label>
                    <input type="text" id="company_name" [ngModel]="companyProfileForm().company_name" (ngModelChange)="updateCompanyProfileField('company_name', $event)" class="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-white">
                  </div>
                   <div>
                    <label for="cnpj" class="block text-sm font-medium text-gray-300">CNPJ</label>
                    <input type="text" id="cnpj" [ngModel]="companyProfileForm().cnpj" (ngModelChange)="updateCompanyProfileField('cnpj', $event)" class="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-white">
                  </div>
                   <div>
                    <label for="address" class="block text-sm font-medium text-gray-300">Endereço</label>
                    <input type="text" id="address" [ngModel]="companyProfileForm().address" (ngModelChange)="updateCompanyProfileField('address', $event)" class="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-white">
                  </div>
                   <div>
                    <label for="phone" class="block text-sm font-medium text-gray-300">Telefone</label>
                    <input type="text" id="phone" [ngModel]="companyProfileForm().phone" (ngModelChange)="updateCompanyProfileField('phone', $event)" class="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-white">
                  </div>
                  <div class="flex justify-end mt-6">
                    <button (click)="saveCompanyProfile()" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md shadow-md transition-colors">Salvar Perfil</button>
                  </div>
                </div>
              </section>
            }
            @case ('stations') {
              <!-- Stations Section -->
              <section>
                 <div class="flex justify-between items-center mb-4">
                  <h2 class="text-2xl font-semibold text-white">Estações de Produção</h2>
                  <button (click)="openStationModal(null)" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md shadow-md transition-colors">Adicionar Estação</button>
                </div>
                 <div class="space-y-2">
                  @for (station of stations(); track station.id) {
                    <div class="flex justify-between items-center p-3 bg-gray-700 rounded-md">
                      <span class="font-medium">{{ station.name }}</span>
                      <div>
                        <button (click)="openStationModal(station)" class="text-blue-400 hover:text-blue-300 mr-4">Editar</button>
                        <button (click)="deleteStation(station)" class="text-red-400 hover:text-red-300">Excluir</button>
                      </div>
                    </div>
                  }
                </div>
              </section>
            }
             @case ('roles') {
              <section>
                 <div class="flex justify-between items-center mb-4">
                  <h2 class="text-2xl font-semibold text-white">Cargos e Permissões</h2>
                  <button (click)="openRoleModal(null)" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md shadow-md transition-colors">Adicionar Cargo</button>
                </div>
                 <div class="space-y-2">
                  @for (role of roles(); track role.id) {
                    <div class="flex justify-between items-center p-3 bg-gray-700 rounded-md">
                      <span class="font-medium">{{ role.name }}</span>
                      <div>
                        <button (click)="openPermissionsModal(role)" class="text-yellow-400 hover:text-yellow-300 mr-4">Permissões</button>
                        <button (click)="openRoleModal(role)" class="text-blue-400 hover:text-blue-300 mr-4">Editar</button>
                        <button (click)="deleteRole(role)" class="text-red-400 hover:text-red-300">Excluir</button>
                      </div>
                    </div>
                  }
                </div>
              </section>
            }
            @case('integrations') {
               <section>
                <h2 class="text-2xl font-semibold mb-4 text-white">Integrações</h2>
                <div class="space-y-6">
                  <!-- iFood Integration -->
                  <div class="p-4 bg-gray-700 rounded-lg">
                    <h3 class="text-xl font-semibold mb-2 text-white">iFood</h3>
                    <div>
                      <label for="ifood_merchant_id" class="block text-sm font-medium text-gray-300">Merchant ID</label>
                      <input type="text" id="ifood_merchant_id" [ngModel]="companyProfileForm().ifood_merchant_id" (ngModelChange)="updateCompanyProfileField('ifood_merchant_id', $event)" class="mt-1 block w-full bg-gray-600 border-gray-500 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-white" placeholder="ID da sua loja no iFood">
                    </div>
                    <div class="flex justify-end mt-4">
                       <button (click)="saveCompanyProfile()" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md shadow-md transition-colors">Salvar iFood ID</button>
                    </div>
                  </div>

                  <!-- External API -->
                  <div class="p-4 bg-gray-700 rounded-lg">
                    <h3 class="text-xl font-semibold mb-2 text-white">API Externa</h3>
                    <p class="text-gray-400 mb-4">Use esta chave para integrar com sistemas externos, como totens de autoatendimento ou aplicativos de delivery próprios.</p>
                    <div>
                      <label for="api_key" class="block text-sm font-medium text-gray-300">Sua Chave de API</label>
                      <div class="flex items-center mt-1">
                        <input type="text" id="api_key" readonly [value]="companyProfile()?.external_api_key || 'Nenhuma chave gerada'" class="block w-full bg-gray-600 border-gray-500 rounded-md shadow-sm text-gray-300">
                        <button (click)="copyApiKey()" class="ml-2 p-2 bg-gray-600 hover:bg-gray-500 rounded-md"><span class="material-symbols-outlined">content_copy</span></button>
                      </div>
                    </div>
                     <div class="flex justify-end mt-4">
                       <button (click)="regenerateApiKey()" class="px-6 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold rounded-md shadow-md transition-colors">Gerar Nova Chave</button>
                    </div>
                  </div>
                </div>
              </section>
            }
             @case ('webhooks') {
              <section>
                 <div class="flex justify-between items-center mb-4">
                  <h2 class="text-2xl font-semibold text-white">Webhooks</h2>
                  <button (click)="openWebhookModal(null)" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md shadow-md transition-colors">Adicionar Webhook</button>
                </div>
                <p class="text-gray-400 mb-4">Seus endpoints serão notificados em tempo real quando os eventos selecionados ocorrerem.</p>
                 <div class="space-y-2">
                  @if (webhooks().length === 0) {
                    <p class="text-gray-500">Nenhum webhook configurado.</p>
                  }
                  @for (webhook of webhooks(); track webhook.id) {
                    <div class="p-3 bg-gray-700 rounded-md">
                        <div class="flex justify-between items-center">
                            <div class="flex-grow">
                                <p class="font-mono text-sm break-all">{{ webhook.url }}</p>
                                <div class="flex items-center gap-2 mt-2">
                                    <span [class.bg-green-500]="webhook.is_active" [class.bg-red-500]="!webhook.is_active" class="w-3 h-3 rounded-full"></span>
                                    <span class="text-xs text-gray-400">{{ webhook.is_active ? 'Ativo' : 'Inativo' }}</span>
                                </div>
                            </div>
                            <div class="flex-shrink-0 ml-4">
                                <button (click)="openWebhookModal(webhook)" class="text-blue-400 hover:text-blue-300 mr-4">Editar</button>
                                <button (click)="deleteWebhook(webhook)" class="text-red-400 hover:text-red-300">Excluir</button>
                            </div>
                        </div>
                    </div>
                  }
                </div>
              </section>
            }
            @default {
              <p>Selecione uma categoria de configuração.</p>
            }
          }
        </main>
      </div>
    </div>
    
    <!-- Modals -->
    @if (isStationModalOpen()) {
      <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" (click)="closeStationModal()">
        <div class="bg-gray-800 rounded-lg p-6 w-full max-w-md" (click)="$event.stopPropagation()">
          <h3 class="text-xl font-semibold mb-4">{{ editingStation() ? 'Editar' : 'Adicionar' }} Estação</h3>
          <input type="text" [(ngModel)]="stationName" class="w-full bg-gray-700 border-gray-600 rounded-md text-white" placeholder="Nome da Estação">
          <div class="flex justify-end mt-4 gap-4">
            <button (click)="closeStationModal()" class="px-4 py-2 rounded-md hover:bg-gray-700">Cancelar</button>
            <button (click)="saveStation()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md">Salvar</button>
          </div>
        </div>
      </div>
    }

    @if (isRoleModalOpen()) {
       <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" (click)="closeRoleModal()">
        <div class="bg-gray-800 rounded-lg p-6 w-full max-w-md" (click)="$event.stopPropagation()">
          <h3 class="text-xl font-semibold mb-4">{{ editingRole() ? 'Editar' : 'Adicionar' }} Cargo</h3>
          <input type="text" [(ngModel)]="roleName" class="w-full bg-gray-700 border-gray-600 rounded-md text-white" placeholder="Nome do Cargo">
          <div class="flex justify-end mt-4 gap-4">
            <button (click)="closeRoleModal()" class="px-4 py-2 rounded-md hover:bg-gray-700">Cancelar</button>
            <button (click)="saveRole()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md">Salvar</button>
          </div>
        </div>
      </div>
    }

    @if (isPermissionsModalOpen()) {
      <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" (click)="closePermissionsModal()">
        <div class="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] flex flex-col" (click)="$event.stopPropagation()">
          <h3 class="text-xl font-semibold mb-4">Permissões para: {{ editingRole()?.name }}</h3>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-4 overflow-y-auto pr-2">
            @for (permission of ALL_PERMISSION_KEYS; track permission) {
              <label class="flex items-center p-2 bg-gray-700 rounded-md cursor-pointer hover:bg-gray-600">
                <input type="checkbox" class="h-4 w-4 rounded bg-gray-600 border-gray-500 text-blue-500 focus:ring-blue-600"
                  [checked]="rolePermissions().has(permission)"
                  (change)="togglePermission(permission)">
                <span class="ml-3 text-sm text-gray-300">{{ permission.replace('/', '').replace('-', ' ') | titlecase }}</span>
              </label>
            }
          </div>
          <div class="flex justify-end mt-6 gap-4 border-t border-gray-700 pt-4">
            <button (click)="closePermissionsModal()" class="px-4 py-2 rounded-md hover:bg-gray-700">Cancelar</button>
            <button (click)="savePermissions()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md">Salvar Permissões</button>
          </div>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent implements OnInit {
  // --- Injections ---
  private settingsDataService = inject(SettingsDataService);
  private inventoryDataService = inject(InventoryDataService);
  private recipeDataService = inject(RecipeDataService);
  private reservationDataService = inject(ReservationDataService);
  private notificationService = inject(NotificationService);
  private settingsState = inject(SettingsStateService);
  private inventoryState = inject(InventoryStateService);
  private recipeState = inject(RecipeStateService);
  private posState = inject(PosStateService);
  private hrState = inject(HrStateService);

  // --- State Signals ---
  activeTab = signal<SettingsTab>('company');
  readonly ALL_PERMISSION_KEYS = ALL_PERMISSION_KEYS;
  
  tabs: { id: SettingsTab; name: string; icon: string }[] = [
    { id: 'company', name: 'Perfil da Empresa', icon: 'storefront' },
    { id: 'stations', name: 'Estações de Produção', icon: 'soup_kitchen' },
    { id: 'roles', name: 'Cargos e Permissões', icon: 'shield_person' },
    // { id: 'categories', name: 'Categorias', icon: 'category' },
    // { id: 'suppliers', name: 'Fornecedores', icon: 'local_shipping' },
    // { id: 'promotions', name: 'Promoções', icon: 'sell' },
    // { id: 'reservations', name: 'Reservas', icon: 'event_seat' },
    // { id: 'loyalty', name: 'Fidelidade', icon: 'loyalty' },
    { id: 'integrations', name: 'Integrações', icon: 'integration_instructions' },
    { id: 'webhooks', name: 'Webhooks', icon: 'webhook' },
  ];

  // --- Data Signals from State Services ---
  companyProfile = this.settingsState.companyProfile;
  stations = this.posState.stations;
  roles = this.hrState.roles;
  webhooks = this.settingsState.webhooks;

  // --- Form & Modal State ---
  companyProfileForm = signal<Partial<CompanyProfile>>({});
  
  isStationModalOpen = signal(false);
  editingStation = signal<Station | null>(null);
  stationName = signal('');
  
  isRoleModalOpen = signal(false);
  editingRole = signal<Role | null>(null);
  roleName = signal('');
  
  isPermissionsModalOpen = signal(false);
  rolePermissions = signal<Set<string>>(new Set());
  
  isWebhookModalOpen = signal(false);
  editingWebhook = signal<Partial<Webhook> | null>(null);
  webhookForm = signal<Partial<Webhook>>({ is_active: true, events: [] });
  availableWebhookEvents: WebhookEvent[] = ['order.created', 'order.updated', 'stock.updated', 'customer.created'];

  ngOnInit() {
    // Initialize forms when data is available
    effect(() => {
      const profile = this.companyProfile();
      if (profile) {
        this.companyProfileForm.set({ ...profile });
      }
    });
  }
  
  // --- Company Profile Methods ---
  updateCompanyProfileField(field: keyof Omit<CompanyProfile, 'user_id' | 'created_at'>, value: any) {
    this.companyProfileForm.update(form => ({ ...form, [field]: value }));
  }
  
  async saveCompanyProfile() {
    const { success, error } = await this.settingsDataService.updateCompanyProfile(this.companyProfileForm());
    if (success) {
      this.notificationService.show('Perfil da empresa salvo com sucesso!', 'success');
    } else {
      this.notificationService.show(`Erro ao salvar perfil: ${error?.message}`, 'error');
    }
  }

  // --- Station Methods ---
  openStationModal(station: Station | null) {
    this.editingStation.set(station);
    this.stationName.set(station?.name || '');
    this.isStationModalOpen.set(true);
  }

  closeStationModal() {
    this.isStationModalOpen.set(false);
  }

  async saveStation() {
    const name = this.stationName().trim();
    if (!name) return;

    const editing = this.editingStation();
    const { success, error } = editing
      ? await this.settingsDataService.updateStation(editing.id, name)
      : await this.settingsDataService.addStation(name);

    if (success) {
      this.closeStationModal();
    } else {
      this.notificationService.show(`Erro: ${error?.message}`, 'error');
    }
  }

  async deleteStation(station: Station) {
    const confirmed = await this.notificationService.confirm(`Tem certeza que deseja excluir a estação "${station.name}"?`);
    if (confirmed) {
      await this.settingsDataService.deleteStation(station.id);
    }
  }

  // --- Role Methods ---
  openRoleModal(role: Role | null) {
    this.editingRole.set(role);
    this.roleName.set(role?.name || '');
    this.isRoleModalOpen.set(true);
  }
  
  closeRoleModal() {
    this.isRoleModalOpen.set(false);
  }

  async saveRole() {
    const name = this.roleName().trim();
    if (!name) return;
    const editing = this.editingRole();
    const { success, error } = editing
      ? await this.settingsDataService.updateRole(editing.id, name)
      : await this.settingsDataService.addRole(name);
    if (success) this.closeRoleModal();
    else this.notificationService.show(`Erro: ${error?.message}`, 'error');
  }

  async deleteRole(role: Role) {
    if (role.name === 'Gerente') {
      this.notificationService.show('O cargo de Gerente não pode ser excluído.', 'warning');
      return;
    }
    const confirmed = await this.notificationService.confirm(`Tem certeza que deseja excluir o cargo "${role.name}"?`);
    if (confirmed) {
      await this.settingsDataService.deleteRole(role.id);
    }
  }

  // --- Permissions Methods ---
  openPermissionsModal(role: Role) {
    const currentPermissions = new Set(
      this.hrState.rolePermissions().filter(p => p.role_id === role.id).map(p => p.permission_key)
    );
    this.rolePermissions.set(currentPermissions);
    this.editingRole.set(role);
    this.isPermissionsModalOpen.set(true);
  }
  
  closePermissionsModal() { this.isPermissionsModalOpen.set(false); }
  
  togglePermission(key: string) {
    this.rolePermissions.update(current => {
      const newSet = new Set(current);
      if (newSet.has(key)) newSet.delete(key);
      else newSet.add(key);
      return newSet;
    });
  }

  async savePermissions() {
    const role = this.editingRole();
    if (!role) return;

    const { success, error } = await this.settingsDataService.updateRolePermissions(role.id, Array.from(this.rolePermissions()));
    if (success) {
      this.notificationService.show('Permissões salvas!', 'success');
      this.closePermissionsModal();
    } else {
      this.notificationService.show(`Erro: ${error?.message}`, 'error');
    }
  }
  
  // --- Integrations ---
  async regenerateApiKey() {
      const confirmed = await this.notificationService.confirm(
        'Gerar uma nova chave de API invalidará a chave atual. Deseja continuar?',
        'Atenção'
      );
      if (confirmed) {
        const { success, error } = await this.settingsDataService.regenerateExternalApiKey();
        if (success) {
          this.notificationService.show('Nova chave de API gerada com sucesso!', 'success');
        } else {
          this.notificationService.show(`Erro: ${error?.message}`, 'error');
        }
      }
  }
  
  copyApiKey() {
    const key = this.companyProfile()?.external_api_key;
    if (key) {
        navigator.clipboard.writeText(key);
        this.notificationService.show('Chave de API copiada!', 'success');
    }
  }
  
  // --- Webhook Methods ---
  openWebhookModal(webhook: Webhook | null) {
    this.editingWebhook.set(webhook);
    this.webhookForm.set(webhook ? { ...webhook } : { url: '', events: [], is_active: true });
    this.isWebhookModalOpen.set(true);
  }

  closeWebhookModal() {
    this.isWebhookModalOpen.set(false);
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
    if (!form.url?.trim()) {
      this.notificationService.show('A URL é obrigatória.', 'warning');
      return;
    }

    const { success, error } = form.id
      ? await this.settingsDataService.updateWebhook(form)
      : await this.settingsDataService.addWebhook(form);
    
    if (success) {
      this.notificationService.show('Webhook salvo com sucesso!', 'success');
      this.closeWebhookModal();
    } else {
      this.notificationService.show(`Erro: ${error?.message}`, 'error');
    }
  }

  async deleteWebhook(webhook: Webhook) {
    const confirmed = await this.notificationService.confirm('Tem certeza que deseja excluir este webhook?');
    if (confirmed) {
      await this.settingsDataService.deleteWebhook(webhook.id);
    }
  }
}
