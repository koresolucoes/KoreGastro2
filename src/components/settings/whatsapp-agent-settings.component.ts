import { Component, ChangeDetectionStrategy, inject, signal, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../services/notification.service';
import { UnitContextService } from '../../services/unit-context.service';
import { supabase } from '../../services/supabase-client';

@Component({
  selector: 'app-whatsapp-agent-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="bg-surface-elevated rounded-3xl border border-strong flex flex-col overflow-hidden">
      <div class="p-6 border-b border-subtle bg-surface/50 flex justify-between items-center">
        <h3 class="text-[12px] font-black text-title uppercase tracking-widest flex items-center gap-2">
            <span translate="no" class="notranslate material-symbols-outlined text-brand text-lg">smart_toy</span>
            Configurações do Agente IA
        </h3>
        <button (click)="triggerAutoCapture()" class="text-xs text-brand font-bold flex items-center gap-1 hover:underline px-2 py-1 bg-brand/10 rounded-lg">
          <span translate="no" class="notranslate material-symbols-outlined text-sm">auto_fix_high</span>
          Preencher com dados da loja
        </button>
      </div>
      <div class="p-6 space-y-4">
        <div>
          <label class="block text-[10px] font-bold text-muted uppercase tracking-widest mb-1">Nome do Restaurante</label>
          <input type="text" [(ngModel)]="restaurantName" class="w-full bg-surface border border-subtle rounded-xl px-4 py-2 text-sm text-title focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all" placeholder="Ex: Pizzaria do Mario">
        </div>
        <div>
          <label class="block text-[10px] font-bold text-muted uppercase tracking-widest mb-1">Endereço (Para responder clientes)</label>
          <input type="text" [(ngModel)]="restaurantAddress" class="w-full bg-surface border border-subtle rounded-xl px-4 py-2 text-sm text-title focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all" placeholder="Ex: Rua das Flores, 123 - Centro">
        </div>
        <div>
          <label class="block text-[10px] font-bold text-muted uppercase tracking-widest mb-1">Horário de Funcionamento</label>
          <input type="text" [(ngModel)]="restaurantHours" class="w-full bg-surface border border-subtle rounded-xl px-4 py-2 text-sm text-title focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all" placeholder="Ex: Seg a Sex das 18h às 23h">
        </div>
        
        <div>
          <label class="block text-[10px] font-bold text-muted uppercase tracking-widest mb-1">Tom de Voz da IA</label>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
            @for(tone of availableTones; track tone) {
              <button (click)="agentTone = tone" 
                [class.bg-brand]="agentTone === tone" [class.text-white]="agentTone === tone" [class.border-brand]="agentTone === tone"
                [class.bg-surface]="agentTone !== tone" [class.text-title]="agentTone !== tone" [class.border-subtle]="agentTone !== tone"
                class="px-3 py-2 border rounded-xl text-xs font-bold transition-all text-center">
                {{ tone }}
              </button>
            }
          </div>
        </div>

        <div>
          <label class="block text-[10px] font-bold text-muted uppercase tracking-widest mb-1">Regras Adicionais (Prompt Customizado)</label>
          <textarea [(ngModel)]="extraRules" rows="4" class="w-full bg-surface border border-subtle rounded-xl px-4 py-2 text-sm text-title focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all resize-none" placeholder="Ex: Se perguntarem por pizza vegana, ofereça a marguerita sem queijo."></textarea>
        </div>

        <button (click)="saveSettings()" [disabled]="isLoading()" class="px-6 py-2.5 mt-2 text-[10px] font-black text-white bg-brand hover:bg-brand-600 rounded-xl transition-all uppercase tracking-widest active:scale-95 w-full flex justify-center items-center gap-2 disabled:opacity-50">
          @if(isLoading()) {
            <span class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            Salvando...
          } @else {
            <span translate="no" class="notranslate material-symbols-outlined text-sm">save</span>
            Salvar Configurações
          }
        </button>
      </div>
    </div>
  `
})
export class WhatsappAgentSettingsComponent implements OnInit {
  private unitContextService = inject(UnitContextService);
  private notificationService = inject(NotificationService);
  private cdr = inject(ChangeDetectorRef);

  isLoading = signal(false);

  restaurantName = '';
  restaurantAddress = '';
  restaurantHours = '';
  agentTone = 'educado e profissional';
  extraRules = '';

  availableTones = [
    'educado e profissional',
    'descontraído e amigável',
    'direto e objetivo',
    'divertido e cheio de emojis'
  ];

  ngOnInit() {
    this.loadSettings();
  }

  async loadSettings() {
    const storeId = this.unitContextService.activeUnitId();
    if (!storeId) return;

    const { data, error } = await supabase
      .from('whatsapp_agent_configs')
      .select('*')
      .eq('store_id', storeId)
      .maybeSingle();

    if (error && error.code === 'PGRST204') {
      console.warn("Table whatsapp_agent_configs missing agent_tone column. Schema reload required.");
      await this.autoCaptureCompanyData(storeId);
      return;
    }

    if (data) {
      this.restaurantName = data.restaurant_name || '';
      this.restaurantAddress = data.restaurant_address || '';
      this.restaurantHours = data.restaurant_hours || '';
      this.agentTone = data.agent_tone || 'educado e profissional';
      this.extraRules = data.extra_rules || '';
      this.cdr.markForCheck();
    }

    if (!this.restaurantName || !this.restaurantAddress || !this.restaurantHours) {
      await this.autoCaptureCompanyData(storeId);
    }
  }

  async autoCaptureCompanyData(storeId: string) {
    const { data: profile } = await supabase
      .from('company_profile')
      .select('company_name, address')
      .eq('user_id', storeId)
      .maybeSingle();

    if (profile) {
      if (!this.restaurantName) this.restaurantName = profile.company_name || '';
      if (!this.restaurantAddress) this.restaurantAddress = profile.address || '';
    }

    if (!this.restaurantHours) {
      const { data: schedules } = await supabase
        .from('schedules')
        .select('*')
        .eq('user_id', storeId);
      
      if (schedules && schedules.length > 0) {
        // Just a simple default hours based on schedules, if any
        this.restaurantHours = "Aberto conforme programação.";
      }
    }
    this.cdr.markForCheck();
  }

  async triggerAutoCapture() {
    const storeId = this.unitContextService.activeUnitId();
    if (!storeId) return;

    this.isLoading.set(true);
    
    const { data: profile } = await supabase
      .from('company_profile')
      .select('company_name, address')
      .eq('user_id', storeId)
      .maybeSingle();

    if (profile) {
      this.restaurantName = profile.company_name || this.restaurantName;
      this.restaurantAddress = profile.address || this.restaurantAddress;
    }

    const { data: schedules } = await supabase
      .from('schedules')
      .select('*')
      .eq('user_id', storeId);
    
    if (schedules && schedules.length > 0) {
      this.restaurantHours = "Aberto conforme programação.";
    }

    this.isLoading.set(false);
    this.cdr.markForCheck();
    this.notificationService.show('Dados capturados!', 'success');
  }

  async saveSettings() {
    const storeId = this.unitContextService.activeUnitId();
    if (!storeId) return;

    this.isLoading.set(true);
    
    const payload = {
      store_id: storeId,
      restaurant_name: this.restaurantName,
      restaurant_address: this.restaurantAddress,
      restaurant_hours: this.restaurantHours,
      agent_tone: this.agentTone,
      extra_rules: this.extraRules,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('whatsapp_agent_configs')
      .upsert(payload, { onConflict: 'store_id' });

    this.isLoading.set(false);
    this.cdr.markForCheck();

    if (error) {
      if (error.code === 'PGRST204' || error.code === 'PGRST205') {
        this.notificationService.show('Atualize o banco de dados (database.sql) para salvar as novas opções.', 'error');
      } else {
        this.notificationService.show('Erro ao salvar as configurações do Agente.', 'error');
      }
      console.error("Save error:", error);
    } else {
      this.notificationService.show('Configurações do Agente salvas com sucesso!', 'success');
    }
  }
}
