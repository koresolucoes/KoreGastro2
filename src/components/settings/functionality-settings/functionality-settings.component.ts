import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReservationSettings, CompanyProfile, LoyaltySettings, LoyaltyReward, Recipe, LoyaltyRewardType, OperatingHours, Webhook, WebhookEvent } from '../../../models/db.models';
import { SettingsDataService } from '../../../services/settings-data.service';
import { NotificationService } from '../../../services/notification.service';
import { AuthService } from '../../../services/auth.service';
import { ReservationDataService } from '../../../services/reservation-data.service';
import { RecipeStateService } from '../../../services/recipe-state.service';
import { SettingsStateService } from '../../../services/settings-state.service';
import { DemoService } from '../../../services/demo.service';
import { FocusNFeService } from '../../../services/focus-nfe.service';

@Component({
  selector: 'app-functionality-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './functionality-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FunctionalitySettingsComponent {
  private settingsDataService = inject(SettingsDataService);
  private reservationDataService = inject(ReservationDataService);
  private notificationService = inject(NotificationService);
  authService = inject(AuthService);
  private recipeState = inject(RecipeStateService);
  private settingsState = inject(SettingsStateService);
  private demoService = inject(DemoService);
  private focusNFeService = inject(FocusNFeService);

  // Data Signals
  reservationSettings = this.settingsState.reservationSettings;
  companyProfile = this.settingsState.companyProfile;
  loyaltySettings = this.settingsState.loyaltySettings;
  loyaltyRewards = this.settingsState.loyaltyRewards;
  webhooks = this.settingsState.webhooks;
  recipes = this.recipeState.recipes;

  // For template display
  daysOfWeek = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  webhookUrl = 'https://app.chefos.online/api/ifood-webhook';

  // Modal State Signals
  isIFoodModalOpen = signal(false);
  isApiModalOpen = signal(false);
  isLoyaltyModalOpen = signal(false);
  isReservationModalOpen = signal(false);
  isFocusNFeModalOpen = signal(false);

  // Reservation Form
  reservationForm = signal<Partial<ReservationSettings>>({});
  
  // Company Profile Form (for iFood and API keys)
  companyProfileForm = signal<Partial<CompanyProfile>>({});

  // Loyalty Program State
  loyaltySettingsForm = signal<Partial<LoyaltySettings>>({});
  isRewardModalOpen = signal(false);
  editingReward = signal<Partial<LoyaltyReward> | null>(null);
  rewardForm = signal<Partial<LoyaltyReward>>({});
  rewardPendingDeletion = signal<LoyaltyReward | null>(null);
  availableRewardTypes: LoyaltyRewardType[] = ['discount_fixed', 'discount_percentage', 'free_item'];
  sellableRecipes = computed(() => this.recipes().filter(r => !r.is_sub_recipe));

  // Webhook State
  isWebhookModalOpen = signal(false);
  editingWebhook = signal<Webhook | null>(null);
  webhookForm = signal<{ url: string; events: WebhookEvent[], is_active?: boolean }>({ url: '', events: [], is_active: true });
  availableWebhookEvents: { key: WebhookEvent, label: string }[] = [
    { key: 'order.created', label: 'Pedido Criado' },
    { key: 'order.updated', label: 'Pedido Atualizado' },
    { key: 'stock.updated', label: 'Estoque Atualizado' },
    { key: 'customer.created', label: 'Cliente Criado' },
    { key: 'delivery.created', label: 'Pedido de Entrega Criado' },
    { key: 'delivery.status_updated', label: 'Status de Entrega Atualizado' },
  ];
  webhookToDelete = signal<Webhook | null>(null);
  newWebhookSecret = signal<string | null>(null);

  // FocusNFe Modal State
  isSavingFocusNFe = signal(false);
  focusNFeToken = signal('');
  focusNFeCertFile = signal<File | null>(null);
  focusNFeCertPassword = signal('');
  focusNFeCertFileName = computed(() => this.focusNFeCertFile()?.name);

  publicMenuUrl = computed(() => {
    const userId = this.demoService.isDemoMode() ? 'demo-user' : this.authService.currentUser()?.id;
    if (!userId) return '';
    return `https://app.chefos.online/#/menu/${userId}`;
  });

  qrCodeUrl = computed(() => {
    const menuUrl = this.publicMenuUrl();
    if (!menuUrl) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(menuUrl)}`;
  });

  apiAccessQrCodeData = computed(() => {
    const userId = this.authService.currentUser()?.id;
    const apiKey = this.companyProfileForm().external_api_key;
    if (!userId || !apiKey) return null;
    return JSON.stringify({ restaurantId: userId, apiKey });
  });

  apiAccessQrCodeUrl = computed(() => {
    const data = this.apiAccessQrCodeData();
    if (!data) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(data)}`;
  });

  constructor() {
    effect(() => {
        const settings = this.reservationSettings();
        if (settings) {
            const weeklyHours = settings.weekly_hours || [];
            const fullWeeklyHours: OperatingHours[] = Array.from({ length: 7 }, (_, i) => {
                return weeklyHours.find(h => h.day_of_week === i) || { day_of_week: i, opening_time: '18:00', closing_time: '23:00', is_closed: true };
            });
            this.reservationForm.set({ ...settings, weekly_hours: fullWeeklyHours });
        } else {
            this.reservationForm.set({
                is_enabled: false,
                weekly_hours: Array.from({ length: 7 }, (_, i) => ({ day_of_week: i, opening_time: '18:00', closing_time: '23:00', is_closed: i === 1 })),
                booking_duration_minutes: 90, max_party_size: 8, min_party_size: 1, booking_notice_days: 30,
            });
        }
    });
    
    effect(() => {
        const profile = this.companyProfile();
        if (profile) {
            this.companyProfileForm.set({ ...profile });
            this.focusNFeToken.set(profile.focusnfe_token || '');
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

  updateCompanyProfileField(field: 'ifood_merchant_id', value: string) {
      this.companyProfileForm.update(form => ({ ...form, [field]: value }));
  }

  async saveIFoodSettings() {
    const { success, error } = await this.settingsDataService.updateCompanyProfile({ 
        ifood_merchant_id: this.companyProfileForm().ifood_merchant_id 
    });
    if (success) {
      await this.notificationService.alert('Configurações do iFood salvas!', 'Sucesso');
    } else {
      await this.notificationService.alert(`Falha ao salvar: ${error?.message}`);
    }
  }

  async copyToClipboard(text: string | null | undefined) {
    if (!text) return this.notificationService.show('Nenhum texto para copiar.', 'warning');
    try {
      await navigator.clipboard.writeText(text);
      this.notificationService.show('Copiado para a área de transferência!', 'success');
    } catch (err) {
      await this.notificationService.alert('Falha ao copiar.');
    }
  }

  async regenerateApiKey() {
    const confirmed = await this.notificationService.confirm(
      'Gerar uma nova chave de API irá invalidar a chave atual. Deseja continuar?',
      'Gerar Nova Chave?'
    );
    if (confirmed) {
      const { success, error } = await this.settingsDataService.regenerateExternalApiKey();
      if (!success) await this.notificationService.alert(`Erro: ${error?.message}`);
    }
  }

  updateReservationFormField(field: keyof Omit<ReservationSettings, 'id' | 'created_at' | 'user_id' | 'weekly_hours'>, value: any) {
    this.reservationForm.update(form => ({ ...form, [field]: value }));
  }

  updateWeeklyHours(dayIndex: number, field: 'opening_time' | 'closing_time' | 'is_closed', value: string | boolean) {
    this.reservationForm.update(form => {
      const newHours = form.weekly_hours ? [...form.weekly_hours] : [];
      if (newHours[dayIndex]) {
        newHours[dayIndex] = { ...newHours[dayIndex], [field]: value };
        return { ...form, weekly_hours: newHours };
      }
      return form;
    });
  }

  async toggleReservations(event: Event) {
    const is_enabled = (event.target as HTMLInputElement).checked;
    this.reservationForm.update(form => ({ ...form, is_enabled }));
    await this.saveReservationSettings();
  }

  async saveReservationSettings() {
    const { success, error } = await this.reservationDataService.updateReservationSettings(this.reservationForm());
    if (success) this.notificationService.show('Configurações de reserva salvas!', 'success');
    else await this.notificationService.alert(`Erro: ${error?.message}`);
  }

  // --- Loyalty Program ---
  getRewardValueLabel(reward: LoyaltyReward): string {
    const recipesMap = new Map(this.recipes().map(r => [r.id, r.name]));
    switch (reward.reward_type) {
      case 'free_item': return `Item Grátis: ${recipesMap.get(reward.reward_value) || 'Item especial'}`;
      case 'discount_percentage': return `${reward.reward_value}% de desconto`;
      case 'discount_fixed': return `R$ ${reward.reward_value} de desconto`;
    }
  }
  getRewardTypeLabel(type: LoyaltyRewardType): string {
    return { 'discount_fixed': 'Desconto (R$)', 'discount_percentage': 'Desconto (%)', 'free_item': 'Item Grátis' }[type];
  }
  
  updateLoyaltySettingsField(field: keyof Omit<LoyaltySettings, 'user_id' | 'created_at'>, value: any) {
    this.loyaltySettingsForm.update(form => ({ ...form, [field]: value }));
  }

  async toggleLoyalty(event: Event) {
    const is_enabled = (event.target as HTMLInputElement).checked;
    this.loyaltySettingsForm.update(form => ({ ...form, is_enabled }));
    await this.saveLoyaltySettings();
  }

  async saveLoyaltySettings() {
    const { success, error } = await this.settingsDataService.upsertLoyaltySettings(this.loyaltySettingsForm());
    if (success) this.notificationService.show('Configurações de fidelidade salvas!', 'success');
    else await this.notificationService.alert(`Erro: ${error?.message}`);
  }

  openAddRewardModal() {
    this.editingReward.set(null);
    this.rewardForm.set({ name: '', points_cost: 100, reward_type: 'discount_fixed', reward_value: '10', is_active: true });
    this.isRewardModalOpen.set(true);
  }
  
  openEditRewardModal(reward: LoyaltyReward) {
    this.editingReward.set(reward);
    this.rewardForm.set({ ...reward });
    this.isRewardModalOpen.set(true);
  }

  closeRewardModal() { this.isRewardModalOpen.set(false); }

  updateRewardFormField(field: keyof Omit<LoyaltyReward, 'id' | 'user_id' | 'created_at'>, value: any) {
    this.rewardForm.update(form => ({ ...form, [field]: value }));
  }

  async saveReward() {
    const form = this.rewardForm();
    if (!form.name?.trim() || !form.reward_value) {
      await this.notificationService.alert('Nome e valor são obrigatórios.');
      return;
    }
    const result = this.editingReward()
      ? await this.settingsDataService.updateLoyaltyReward({ ...form, id: this.editingReward()!.id })
      : await this.settingsDataService.addLoyaltyReward(form);
    
    if (result.success) this.closeRewardModal();
    else await this.notificationService.alert(`Erro: ${result.error?.message}`);
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
    this.webhookForm.set({ url: '', events: [], is_active: true });
    this.newWebhookSecret.set(null);
    this.isWebhookModalOpen.set(true);
  }

  openEditWebhookModal(webhook: Webhook) {
    this.editingWebhook.set(webhook);
    this.webhookForm.set({ url: webhook.url, events: [...webhook.events], is_active: webhook.is_active });
    this.newWebhookSecret.set(null);
    this.isWebhookModalOpen.set(true);
  }

  closeWebhookModal() {
    this.isWebhookModalOpen.set(false);
    this.newWebhookSecret.set(null);
  }

  updateWebhookFormField(field: 'url' | 'is_active', value: any) {
    this.webhookForm.update(form => ({ ...form, [field]: value }));
  }

  toggleWebhookEvent(event: WebhookEvent) {
    this.webhookForm.update(form => {
      const newEvents = new Set(form.events);
      newEvents.has(event) ? newEvents.delete(event) : newEvents.add(event);
      return { ...form, events: Array.from(newEvents) };
    });
  }

  async saveWebhook() {
    const form = this.webhookForm();
    if (!form.url.trim() || !form.url.startsWith('https://')) return this.notificationService.show('URL inválida.', 'warning');
    if (form.events.length === 0) return this.notificationService.show('Selecione ao menos um evento.', 'warning');

    if (this.editingWebhook()) {
      const { success, error } = await this.settingsDataService.updateWebhook(this.editingWebhook()!.id, { ...form });
      if (success) { this.notificationService.show('Webhook atualizado!', 'success'); this.closeWebhookModal(); } 
      else { this.notificationService.show(`Erro: ${error?.message}`, 'error'); }
    } else {
      const { data, error } = await this.settingsDataService.addWebhook(form.url, form.events);
      if (data) this.newWebhookSecret.set(data.secret);
      else { this.notificationService.show(`Erro: ${error?.message}`, 'error'); this.closeWebhookModal(); }
    }
  }
  
  requestDeleteWebhook(webhook: Webhook) { this.webhookToDelete.set(webhook); }
  cancelDeleteWebhook() { this.webhookToDelete.set(null); }
  async confirmDeleteWebhook() {
    const webhook = this.webhookToDelete();
    if (webhook) {
      const { success, error } = await this.settingsDataService.deleteWebhook(webhook.id);
      if (!success) this.notificationService.show(`Erro: ${error?.message}`, 'error');
      this.webhookToDelete.set(null);
    }
  }

  // --- FocusNFe Methods ---
  handleFocusNFeCertFileChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
        this.focusNFeCertFile.set(file);
    }
  }

  async saveFocusNFeSettings() {
    this.isSavingFocusNFe.set(true);
    const token = this.focusNFeToken().trim();
    const certFile = this.focusNFeCertFile();
    const certPass = this.focusNFeCertPassword();

    if (!token) {
        this.notificationService.show('O token da API FocusNFe é obrigatório.', 'warning');
        this.isSavingFocusNFe.set(false);
        return;
    }

    if (certFile && !certPass) {
        this.notificationService.show('A senha do certificado é obrigatória ao enviar um novo arquivo.', 'warning');
        this.isSavingFocusNFe.set(false);
        return;
    }

    const { success, error, data } = await this.focusNFeService.saveTokenAndCertificate(
        token,
        certFile,
        certPass
    );
    
    if (success) {
        this.notificationService.show('Configurações fiscais salvas com sucesso!', 'success');
        this.settingsState.companyProfile.update(profile => {
            if (!profile) return null;
            const updatedProfile: CompanyProfile = { ...profile, focusnfe_token: token };
            if (data?.cert_valid_until) {
                updatedProfile.focusnfe_cert_valid_until = data.cert_valid_until;
            }
            return updatedProfile;
        });
        this.isFocusNFeModalOpen.set(false);
    } else {
        this.notificationService.show(`Erro ao salvar: ${(error as any)?.message || 'Erro desconhecido'}`, 'error');
    }

    this.isSavingFocusNFe.set(false);
  }
}