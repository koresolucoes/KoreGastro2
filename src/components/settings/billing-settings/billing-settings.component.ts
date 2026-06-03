import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/core';
import { SupabaseService } from '../../../services/supabase.service';

@Component({
  selector: 'app-billing-settings',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-8 animate-in fade-in">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-black text-title title-display">Assinatura e Pagamento</h2>
          <p class="text-muted text-sm mt-1">Gerencie seu plano, métodos de pagamento e faturas do Mercado Pago.</p>
        </div>
      </div>
      
      <!-- Implementação nas próximas etapas -->
      <div class="bg-surface-elevated rounded-3xl p-8 border border-strong flex flex-col items-center justify-center text-center py-16">
        <span translate="no" class="notranslate material-symbols-outlined text-4xl text-brand mb-4">payments</span>
        <h3 class="text-xl font-bold text-title mb-2">Módulo em Desenvolvimento</h3>
        <p class="text-muted max-w-md">Para ativarmos este módulo, por favor execute os scripts SQL listados no chat no seu Supabase primeiro.</p>
      </div>
    </div>
  `
})
export class BillingSettingsComponent {}
