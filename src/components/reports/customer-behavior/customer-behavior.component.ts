import { Component, ChangeDetectionStrategy, input, inject, signal, effect, untracked } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { CrmDataService, RfmCustomer } from '../../../services/crm-data.service';

@Component({
  selector: 'app-customer-behavior',
  standalone: true,
  imports: [CommonModule],
  providers: [CurrencyPipe, DatePipe],
  template: `
    <div class="h-full flex flex-col space-y-8">
      <div class="chef-surface rounded-3xl border border-subtle shadow-xl p-6 bg-indigo-500/5 border-indigo-500/20 flex-shrink-0">
        <div class="flex items-start gap-6">
          <div class="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20 shadow-inner flex-shrink-0">
            <span class="material-symbols-outlined text-indigo-500 text-4xl">psychology</span>
          </div>
          <div>
            <h2 class="text-2xl font-black text-title title-display tracking-tight">Comportamento de Clientes (RFM)</h2>
            <p class="text-muted font-medium text-sm mt-2 max-w-3xl leading-relaxed">
              Analise a <strong>Recência, Frequência e Valor Monetário</strong> dos seus clientes (especialmente no Delivery). Entenda quem são os clientes VIPs, os inativos e crie campanhas de fidelidade precisas.
            </p>
          </div>
        </div>
      </div>
      
      <div class="flex-1 chef-surface rounded-3xl border border-subtle flex flex-col overflow-hidden">
        @if (isLoading()) {
            <div class="flex-1 flex flex-col items-center justify-center p-12">
                <div class="w-16 h-16 border-4 border-subtle border-t-brand rounded-full animate-spin mb-4"></div>
                <p class="text-muted font-black uppercase tracking-widest text-xs animate-pulse">Processando CRM...</p>
            </div>
        } @else if (error()) {
            <div class="flex-1 flex flex-col items-center justify-center p-12 text-center">
                <div class="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
                    <span class="material-symbols-outlined text-red-500 text-5xl">warning</span>
                </div>
                <h3 class="text-lg font-black text-title tracking-tight mb-2">Erro</h3>
                <p class="text-muted text-sm max-w-md mx-auto">{{ error() }}</p>
            </div>
        } @else if (customers().length === 0) {
             <div class="flex flex-col items-center justify-center flex-1 p-12 opacity-80">
                <div class="w-24 h-24 bg-surface-elevated rounded-full flex items-center justify-center mb-6 border border-strong shadow-inner">
                  <span class="material-symbols-outlined text-muted/40 text-5xl">group_off</span>
                </div>
                <h3 class="text-lg font-black text-title tracking-tight mb-2">Nenhum Cliente com Pedidos</h3>
                <p class="text-muted text-xs font-medium max-w-sm text-center">Os pedidos devem estar associados a clientes para que a análise RFM seja processada. Utilize o campo cliente no caixa ou processando pedidos do Delivery.</p>
              </div>
        } @else {
            <!-- Table Header -->
            <div class="grid grid-cols-12 gap-4 p-4 border-b border-subtle bg-surface-elevated text-xs font-black text-muted uppercase tracking-widest sticky top-0 z-10">
                <div class="col-span-4 lg:col-span-3">Cliente / Contato</div>
                <div class="col-span-2 text-center">Frequência</div>
                <div class="col-span-2 text-center">Recência</div>
                <div class="col-span-2 text-right">Monetário</div>
                <div class="col-span-2 lg:col-span-3 text-right">Segmento / Ação</div>
            </div>
            
            <!-- Table Body -->
            <div class="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                @for(c of customers(); track c.customerId) {
                    <div class="grid grid-cols-12 gap-4 p-3 hover-surface-elevated rounded-xl transition-colors border border-transparent hover:border-strong text-sm items-center group">
                        <div class="col-span-4 lg:col-span-3 flex flex-col truncate pr-2">
                            <span class="font-bold text-title truncate">{{ c.name }}</span>
                            <span class="text-xs text-muted font-mono truncate">{{ c.phone || 'Sem Telefone' }}</span>
                        </div>
                        <div class="col-span-2 flex flex-col items-center justify-center">
                            <span class="font-black text-title text-base">{{ c.frequency }}</span>
                            <span class="text-[10px] text-muted font-bold uppercase">Pedidos</span>
                        </div>
                        <div class="col-span-2 flex flex-col items-center justify-center">
                             <span class="font-black text-title text-base">{{ c.recencyDays }}</span>
                             <span class="text-[10px] text-muted font-bold uppercase">Dias atrás</span>
                        </div>
                        <div class="col-span-2 text-right flex flex-col justify-center">
                            <span class="font-bold text-success">{{ c.monetary | currency:'BRL' }}</span>
                            <span class="text-[10px] text-muted font-bold uppercase lg:hidden">Total</span>
                        </div>
                        <div class="col-span-2 lg:col-span-3 flex items-center justify-end gap-2">
                             <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap shadow-sm" [ngClass]="getSegmentStyles(c.segment)">
                                 {{ c.segment }}
                             </span>
                             <button class="w-8 h-8 rounded-lg bg-surface border border-subtle flex items-center justify-center text-muted hover:text-brand hover:border-brand transition-all hidden lg:flex" title="Ver Detalhes">
                                 <span class="material-symbols-outlined text-[18px]">chevron_right</span>
                             </button>
                        </div>
                    </div>
                }
            </div>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerBehaviorReportComponent {
  startDate = input.required<string>(); // Not strictly using it here, analysis over all time usually, but could be filtered
  endDate = input.required<string>();
  
  crmService = inject(CrmDataService);
  
  customers = signal<RfmCustomer[]>([]);
  isLoading = signal(false);
  error = signal<string | null>(null);

  constructor() {
    effect(() => {
        const start = this.startDate();
        const end = this.endDate();
        if (start && end) {
            untracked(() => {
                this.loadData();
            });
        }
    });
  }

  async loadData() {
      if (this.isLoading()) return;
      this.isLoading.set(true);
      this.error.set(null);
      
      const { success, data, error } = await this.crmService.getRfmAnalysis();
      
      if (success && data) {
          this.customers.set(data);
      } else {
          this.error.set(error?.message || 'Falha ao processar dados de CRM.');
      }
      this.isLoading.set(false);
  }
  
  getSegmentStyles(segment: string): string {
      switch(segment) {
          case 'VIP': return 'bg-amber-100 text-amber-800 border border-amber-200';
          case 'Leal': return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
          case 'Novo': return 'bg-blue-100 text-blue-800 border border-blue-200';
          case 'Potencial': return 'bg-indigo-100 text-indigo-800 border border-indigo-200';
          case 'Risco': return 'bg-orange-100 text-orange-800 border border-orange-200';
          case 'Inativo': return 'bg-gray-100 text-gray-800 border border-gray-200';
          default: return 'bg-surface-elevated text-muted border-subtle';
      }
  }
}

