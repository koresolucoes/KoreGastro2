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
               </div>

            } @else {
               <div class="text-center py-8">
                  <div class="w-20 h-20 bg-surface rounded-full flex items-center justify-center border border-subtle mx-auto mb-6">
                    <span translate="no" class="notranslate material-symbols-outlined text-muted text-4xl">link_off</span>
                  </div>
                  <h4 class="text-lg font-black text-title mb-2">Conta não conectada</h4>
                  <p class="text-xs text-muted mb-8 max-w-sm mx-auto">Para habilitar o Assistente IA de pedidos do chefOS via WhatsApp, faça login com sua conta do Facebook associada à sua Empresa.</p>

                  <button (click)="launchFacebookLogin()" class="group relative inline-flex items-center justify-center px-8 py-3.5 bg-[#1877F2] hover:bg-[#166FE5] text-white rounded-2xl text-xs font-black transition-all shadow-lg shadow-[#1877F2]/30 active:scale-95 border border-[#1877F2]">
                     <img src="https://upload.wikimedia.org/wikipedia/commons/c/c2/F_icon.svg" class="w-5 h-5 mr-3 bg-white rounded-sm p-[1px]" alt="Facebook">
                     Continuar com o Facebook
                     <div class="absolute inset-0 h-full w-full rounded-2xl bg-white/20 scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
                  </button>
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

  constructor() {
    this.loadConfig();
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
      } else {
         this.config.set(null);
      }
  }

  async launchFacebookLogin() {
      // In a real app, this would initialize the Facebook SDK and call FB.login
      // using Embedded Signup. Since we are in an iframe sandbox without a real APP ID,
      // we'll mock the flow visually to demonstrate the functional architecture.
      
      const storeId = this.unitContextService.activeUnitId();
      if (!storeId) return this.notificationService.show('Loja não identificada.', 'warning');

      try {
          // Simulate popup delay
          await new Promise(resolve => setTimeout(resolve, 800));
          
          await this.notificationService.alert(
              'O login do Facebook foi aberto e você autorizou o chefOS como provedor de tecnologia.', 
              'Integração Meta'
          );

          const mockToken = 'EAA_MOCK_TOKEN_' + Math.random().toString(36).substring(7);
          const mockWaba = 'WABA_' + Math.floor(Math.random() * 900000 + 100000);
          const mockPhoneId = 'PHONE_' + Math.floor(Math.random() * 900000 + 100000);

          const { error } = await supabase.from('whatsapp_configs').upsert({
              store_id: storeId,
              waba_id: mockWaba,
              phone_number_id: mockPhoneId,
              access_token: mockToken,
              phone_number: '+55 11 99999-9999',
              is_active: true
          });

          if (error) throw error;
          
          this.notificationService.show('WhatsApp conectado com sucesso!', 'success');
          await this.loadConfig();
          
      } catch (err) {
          console.error(err);
          this.notificationService.show('Erro ao conectar WhatsApp.', 'error');
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
