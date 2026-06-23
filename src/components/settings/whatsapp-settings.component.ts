import { Component, ChangeDetectionStrategy, inject, signal, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsStateService } from '../../services/settings-state.service';
import { NotificationService } from '../../services/notification.service';
import { UnitContextService } from '../../services/unit-context.service';
import { supabase } from '../../services/supabase-client';

@Component({
  selector: 'app-whatsapp-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-8">
      <div class="bg-surface border border-subtle rounded-3xl p-8 flex flex-col items-center justify-center text-center">
        <div class="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center mb-4">
           <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" alt="WhatsApp" class="w-10 h-10">
        </div>
        <h2 class="text-2xl font-black text-title title-display tracking-tight">WhatsApp / Assistente IA</h2>
        <p class="text-xs text-muted max-w-lg mt-2 font-medium">Conecte sua conta do WhatsApp Business usando o Meta Embedded Signup. O Assistente IA do Gemini assumirá os pedidos automaticamente usando seu cardápio do ChefOS.</p>
      </div>

      <div class="bg-surface-elevated rounded-3xl border border-strong flex flex-col overflow-hidden">
         <div class="p-6 border-b border-subtle bg-surface/50">
            <h3 class="text-[12px] font-black text-title uppercase tracking-widest flex items-center gap-2">
                <span translate="no" class="notranslate material-symbols-outlined text-green-500 text-lg">chat</span>
                Status da Conexão
            </h3>
         </div>
         <div class="p-6">
            @if (config()) {
               <div class="flex items-center justify-between p-6 bg-surface rounded-2xl border border-green-500/20">
                  <div class="flex items-center gap-4">
                     <div class="relative">
                        <div class="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/20">
                           <span translate="no" class="notranslate material-symbols-outlined text-green-500 text-2xl">phonelink_ring</span>
                        </div>
                        <div class="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-surface-elevated rounded-full animate-pulse"></div>
                     </div>
                     <div>
                        <p class="text-[10px] font-black text-muted uppercase tracking-widest mb-1">WhatsApp Business Conectado</p>
                        <p class="text-title font-black text-lg">{{ config()?.phone_number || 'Número Oculto' }}</p>
                        <div class="flex items-center gap-2 mt-1">
                           <span class="text-[9px] font-black uppercase text-green-600 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20">WABA: {{ config()?.waba_id }}</span>
                        </div>
                     </div>
                  </div>
                  <button (click)="disconnect()" class="px-6 py-2.5 text-[10px] font-black text-red-500 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 rounded-xl transition-all uppercase tracking-widest active:scale-95">Desconectar</button>
               </div>
               
               <div class="mt-6 p-6 bg-blue-500/5 rounded-2xl border border-blue-500/20">
                   <h4 class="text-[11px] font-bold text-title mb-2">Webhook Configurado Automaticamente</h4>
                   <p class="text-[10px] text-muted leading-relaxed">
                     O sistema já registrou o webhook no Meta Developers para que seu assistente da IA do Gemini 
                     receba e envie as mensagens usando as instruções nativas do cardápio. Nenhuma ação adicional é requerida.
                   </p>
                   <div class="mt-4 pt-4 border-t border-blue-500/10">
                     <p class="text-[10px] font-bold text-muted uppercase tracking-widest mb-1">URL do Webhook (Configuração Manual)</p>
                     <div class="flex items-center gap-2">
                       <code class="flex-1 bg-surface-elevated border border-subtle px-3 py-2 rounded-lg text-xs font-mono text-title break-all">
                         {{ getWebhookUrl() }}
                       </code>
                       <button (click)="copyWebhookUrl()" class="p-2 bg-surface hover:bg-surface-elevated border border-subtle rounded-lg text-muted hover:text-title transition-all group" title="Copiar URL">
                         <span translate="no" class="notranslate material-symbols-outlined text-[18px] group-active:scale-95 transition-transform">content_copy</span>
                       </button>
                     </div>
                     <p class="text-[9px] text-muted mt-2">Verify Token: <strong>chefos_whatsapp_webhook_2024</strong> (Use isso caso precise configurar manualmente no painel da Meta)</p>
                   </div>
               </div>

               @if (config()?.waba_id === 'PENDING_CONFIG' || showManualUI()) {
                  <div class="mt-6 p-6 bg-yellow-500/5 rounded-2xl border border-yellow-500/20">
                     <h4 class="text-[11px] font-bold text-yellow-600 mb-2 uppercase tracking-widest">Configuração Manual</h4>
                     <p class="text-[10px] text-muted leading-relaxed mb-4">
                        Insira os dados do WhatsApp Cloud API. Você pode encontrá-los no Meta for Developers > WhatsApp > API Setup.
                     </p>
                     <div class="space-y-4">
                        <div>
                           <label class="block text-[10px] font-bold text-muted uppercase tracking-widest mb-1">WhatsApp Business Account ID (WABA ID)</label>
                           <input type="text" [(ngModel)]="manualWabaId" class="w-full bg-surface-elevated border border-subtle rounded-xl px-4 py-2 text-sm text-title focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all">
                        </div>
                        <div>
                           <label class="block text-[10px] font-bold text-muted uppercase tracking-widest mb-1">Phone Number ID</label>
                           <input type="text" [(ngModel)]="manualPhoneId" class="w-full bg-surface-elevated border border-subtle rounded-xl px-4 py-2 text-sm text-title focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all">
                        </div>
                        <div>
                           <label class="block text-[10px] font-bold text-muted uppercase tracking-widest mb-1">Número de Telefone (Ex: +5511999999999)</label>
                           <input type="text" [(ngModel)]="manualPhoneNumber" class="w-full bg-surface-elevated border border-subtle rounded-xl px-4 py-2 text-sm text-title focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all">
                        </div>
                        <div>
                           <label class="block text-[10px] font-bold text-muted uppercase tracking-widest mb-1">Access Token (Permanente do Usuário do Sistema)</label>
                           <input type="password" [(ngModel)]="manualAccessToken" class="w-full bg-surface-elevated border border-subtle rounded-xl px-4 py-2 text-sm text-title focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all">
                        </div>
                        <button (click)="saveManualConfig()" class="px-6 py-2.5 text-[10px] font-black text-white bg-green-500 hover:bg-green-600 rounded-xl transition-all uppercase tracking-widest active:scale-95 w-full">Salvar Configuração</button>
                     </div>
                  </div>
               }

            } @else {
               <div class="text-center py-8">
                  <div class="w-20 h-20 bg-surface rounded-full flex items-center justify-center border border-subtle mx-auto mb-6">
                    <span translate="no" class="notranslate material-symbols-outlined text-muted text-4xl">link_off</span>
                  </div>
                  <h4 class="text-lg font-black text-title mb-2">Conta não conectada</h4>
                  <p class="text-xs text-muted mb-8 max-w-sm mx-auto">Para habilitar o Assistente IA de pedidos do chefOS via WhatsApp, faça login com sua conta do Facebook associada à sua Empresa.</p>

                  <div class="flex flex-col gap-3 max-w-sm mx-auto">
                    <button (click)="launchFacebookLogin()" class="group relative inline-flex items-center justify-center px-8 py-3.5 bg-[#1877F2] hover:bg-[#166FE5] text-white rounded-2xl text-xs font-black transition-all shadow-lg shadow-[#1877F2]/30 active:scale-95 border border-[#1877F2]">
                       <img src="https://upload.wikimedia.org/wikipedia/commons/c/c2/F_icon.svg" class="w-5 h-5 mr-3 bg-white rounded-sm p-[1px]" alt="Facebook">
                       Continuar com o Facebook
                       <div class="absolute inset-0 h-full w-full rounded-2xl bg-white/20 scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
                    </button>
                    <button (click)="toggleManualUI()" class="px-8 py-3.5 bg-surface-elevated hover:bg-surface border border-subtle text-title rounded-2xl text-xs font-black transition-all active:scale-95">
                       Configuração Manual via Meta Developers
                    </button>
                  </div>

                  @if (showManualUI()) {
                    <div class="mt-8 text-left">
                       <h4 class="text-[11px] font-bold text-title mb-2 uppercase tracking-widest">Configuração Manual</h4>
                       <div class="space-y-4">
                          <div>
                             <label class="block text-[10px] font-bold text-muted uppercase tracking-widest mb-1">WhatsApp Business Account ID (WABA ID)</label>
                             <input type="text" [(ngModel)]="manualWabaId" class="w-full bg-surface-elevated border border-subtle rounded-xl px-4 py-2 text-sm text-title focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all">
                          </div>
                          <div>
                             <label class="block text-[10px] font-bold text-muted uppercase tracking-widest mb-1">Phone Number ID</label>
                             <input type="text" [(ngModel)]="manualPhoneId" class="w-full bg-surface-elevated border border-subtle rounded-xl px-4 py-2 text-sm text-title focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all">
                          </div>
                          <div>
                             <label class="block text-[10px] font-bold text-muted uppercase tracking-widest mb-1">Número de Telefone (Ex: +5511999999999)</label>
                             <input type="text" [(ngModel)]="manualPhoneNumber" class="w-full bg-surface-elevated border border-subtle rounded-xl px-4 py-2 text-sm text-title focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all">
                          </div>
                          <div>
                             <label class="block text-[10px] font-bold text-muted uppercase tracking-widest mb-1">Access Token (Permanent)</label>
                             <input type="password" [(ngModel)]="manualAccessToken" class="w-full bg-surface-elevated border border-subtle rounded-xl px-4 py-2 text-sm text-title focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all">
                          </div>
                          <button (click)="saveManualConfig()" class="px-6 py-2.5 text-[10px] font-black text-white bg-green-500 hover:bg-green-600 rounded-xl transition-all uppercase tracking-widest active:scale-95 w-full">Salvar</button>
                       </div>
                    </div>
                  }
               </div>
            }
         </div>
      </div>
    </div>
  `
})
export class WhatsappSettingsComponent {
  private unitContextService = inject(UnitContextService);
  private notificationService = inject(NotificationService);

  config = signal<any | null>(null);
  showManualUI = signal<boolean>(false);

  manualWabaId = '';
  manualPhoneId = '';
  manualPhoneNumber = '';
  manualAccessToken = '';

  constructor() {
    this.loadConfig();
  }

  getWebhookUrl(): string {
    return `${window.location.origin}/api/whatsapp/webhook`;
  }

  copyWebhookUrl() {
    navigator.clipboard.writeText(this.getWebhookUrl());
    this.notificationService.show('URL do Webhook copiada!', 'success');
  }

  async loadConfig() {
      const storeId = this.unitContextService.activeUnitId();
      if (!storeId) return;

      const { data, error } = await supabase
         .from('whatsapp_configs')
         .select('*')
         .eq('store_id', storeId)
         .maybeSingle();
      
      if (!error && data) {
         this.config.set(data);
         if (data.waba_id && data.waba_id !== 'PENDING_CONFIG') {
             this.manualWabaId = data.waba_id;
         }
         if (data.phone_number_id && data.phone_number_id !== 'PENDING_CONFIG') {
             this.manualPhoneId = data.phone_number_id;
         }
         if (data.phone_number && data.phone_number !== 'Pendente') {
             this.manualPhoneNumber = data.phone_number;
         }
         if (data.access_token) {
             this.manualAccessToken = data.access_token;
         }
      } else {
         this.config.set(null);
      }
  }

  toggleManualUI() {
    this.showManualUI.set(!this.showManualUI());
  }

  async saveManualConfig() {
      if (!this.manualWabaId || !this.manualPhoneId || !this.manualPhoneNumber || !this.manualAccessToken) {
          return this.notificationService.show('Por favor, preencha todos os campos.', 'warning');
      }

      const storeId = this.unitContextService.activeUnitId();
      if (!storeId) return;

      const configId = this.config()?.id;

      let error;
      if (configId) {
          const res = await supabase
              .from('whatsapp_configs')
              .update({
                  waba_id: this.manualWabaId,
                  phone_number_id: this.manualPhoneId,
                  phone_number: this.manualPhoneNumber,
                  access_token: this.manualAccessToken,
                  is_active: true
              })
              .eq('id', configId);
          error = res.error;
      } else {
          const res = await supabase
              .from('whatsapp_configs')
              .insert({
                  store_id: storeId,
                  waba_id: this.manualWabaId,
                  phone_number_id: this.manualPhoneId,
                  phone_number: this.manualPhoneNumber,
                  access_token: this.manualAccessToken,
                  is_active: true
              });
          error = res.error;
      }

      if (!error) {
          this.notificationService.show('Configuração salva com sucesso!', 'success');
          this.showManualUI.set(false);
          await this.loadConfig();
      } else {
          this.notificationService.show('Erro ao salvar configuração.', 'error');
          console.error(error);
      }
  }

  async launchFacebookLogin() {
      const storeId = this.unitContextService.activeUnitId();
      if (!storeId) return this.notificationService.show('Loja não identificada.', 'warning');

      try {
          // Construct redirect URI for the callback
          const redirectUri = `${window.location.origin}/api/whatsapp/auth/callback`;
          
          // Fetch the authorization URL from our server
          const response = await fetch(`/api/whatsapp/auth/url?redirectUri=${encodeURIComponent(redirectUri)}`);
          if (!response.ok) {
              throw new Error('Falha ao obter URL de autenticação do Facebook');
          }
          
          const data = await response.json();
          let authUrl = data.url;

          // Append state parameter for our callback to know the storeId
          authUrl += `&state=${storeId}`;

          const authWindow = window.open(authUrl, 'facebook_oauth', 'width=600,height=700');
          
          if (!authWindow) {
             return this.notificationService.show('Por favor, permita popups para concluir a integração.', 'warning');
          }

          // Handle the popup response via postMessage
          const handleOAuthMessage = async (event: MessageEvent) => {
              // Note: in a real environment we would firmly check origin, but in previews it could be varied
              if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
                  window.removeEventListener('message', handleOAuthMessage);
                  this.notificationService.show('WhatsApp conectado com sucesso!', 'success');
                  await this.loadConfig();
              } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
                  window.removeEventListener('message', handleOAuthMessage);
                  this.notificationService.show(`Erro: ${event.data.error}`, 'error');
              }
          };

          window.addEventListener('message', handleOAuthMessage);
          
      } catch (err) {
          console.error(err);
          this.notificationService.show('Erro ao iniciar conexão com WhatsApp.', 'error');
      }
  }

  async disconnect() {
      const confirm = await this.notificationService.confirm('Tem certeza que deseja desconectar e excluir a configuração atual do seu WABA? Seu assistente vai parar de funcionar.', 'Desconectar WhatsApp');
      if (!confirm) return;

      const configId = this.config()?.id;
      if (!configId) return;

      const { error } = await supabase.from('whatsapp_configs').delete().eq('id', configId);
      if (!error) {
         this.notificationService.show('WhatsApp desconectado.', 'success');
         this.config.set(null);
      }
  }
}
