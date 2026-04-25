import { Component, ChangeDetectionStrategy, input, inject, signal, effect, untracked, computed } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FinancialDataService, LossReportItem } from '../../../services/financial-data.service';

@Component({
  selector: 'app-loss-report',
  standalone: true,
  imports: [CommonModule],
  providers: [CurrencyPipe, DatePipe],
  template: `
    <div class="h-full flex flex-col space-y-8">
      <div class="chef-surface rounded-3xl border border-subtle shadow-xl p-6 bg-amber-500/5 border-amber-500/20 flex-shrink-0">
        <div class="flex items-start gap-6">
          <div class="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20 shadow-inner flex-shrink-0">
            <span class="material-symbols-outlined text-amber-600 text-4xl">trending_down</span>
          </div>
          <div class="flex-1">
            <h2 class="text-2xl font-black text-amber-600 title-display tracking-tight">Relatório de Perdas & Desperdício</h2>
            <p class="text-muted font-medium text-sm mt-2 max-w-3xl leading-relaxed">
              DRE das perdas: Visualize o <strong>custo total de ingredientes vencidos, erros operacionais e cortesias</strong> e o impacto direto na margem de lucro.
            </p>
          </div>
          
          <div class="hidden md:flex flex-col items-end shrink-0">
              <span class="text-xs font-black text-muted uppercase tracking-widest">Total Perdido</span>
              <span class="text-3xl font-black text-danger title-display">{{ totalLoss() | currency:'BRL' }}</span>
          </div>
        </div>
      </div>
      
      <!-- Metricas -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 flex-shrink-0">
          <div class="chef-surface p-4 rounded-2xl border border-subtle flex items-center gap-4">
              <div class="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                  <span class="material-symbols-outlined text-orange-500">inventory_2</span>
              </div>
              <div>
                  <p class="text-xs font-bold text-muted tracking-wide uppercase">Custo de Ingredientes (Estoque)</p>
                  <p class="text-xl font-black text-title">{{ inventoryLoss() | currency:'BRL' }}</p>
              </div>
          </div>
          
          <div class="chef-surface p-4 rounded-2xl border border-subtle flex items-center gap-4">
              <div class="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20">
                  <span class="material-symbols-outlined text-red-500">cancel</span>
              </div>
              <div>
                  <p class="text-xs font-bold text-muted tracking-wide uppercase">Custo de Cancelamentos (Estimado)</p>
                  <p class="text-xl font-black text-title">{{ cancellationLoss() | currency:'BRL' }}</p>
              </div>
          </div>
      </div>
      
      <div class="flex-1 chef-surface rounded-3xl border border-subtle flex flex-col overflow-hidden">
        @if (isLoading()) {
            <div class="flex-1 flex flex-col items-center justify-center p-12">
                <div class="w-16 h-16 border-4 border-subtle border-t-amber-500 rounded-full animate-spin mb-4"></div>
                <p class="text-muted font-black uppercase tracking-widest text-xs animate-pulse">Processando Ocorrências...</p>
            </div>
        } @else if (error()) {
            <div class="flex-1 flex flex-col items-center justify-center p-12 text-center">
                <div class="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
                    <span class="material-symbols-outlined text-red-500 text-5xl">warning</span>
                </div>
                <h3 class="text-lg font-black text-title tracking-tight mb-2">Erro</h3>
                <p class="text-muted text-sm max-w-md mx-auto">{{ error() }}</p>
            </div>
        } @else if (items().length === 0) {
             <div class="flex flex-col items-center justify-center flex-1 p-12 opacity-80">
                <div class="w-24 h-24 bg-surface-elevated rounded-full flex items-center justify-center mb-6 border border-strong shadow-inner">
                  <span class="material-symbols-outlined text-muted/40 text-5xl">verified</span>
                </div>
                <h3 class="text-lg font-black text-title tracking-tight mb-2">Nenhuma Perda Registrada</h3>
                <p class="text-muted text-xs font-medium max-w-sm text-center">Ótimo trabalho! Nenhuma ocorrência de desperdício ou cancelamento encontrada neste período.</p>
              </div>
        } @else {
            <!-- Table Header -->
            <div class="grid grid-cols-12 gap-4 p-4 border-b border-subtle bg-surface-elevated text-xs font-black text-muted uppercase tracking-widest sticky top-0 z-10">
                <div class="col-span-3 lg:col-span-2">Data</div>
                <div class="col-span-4 lg:col-span-4">Descrição / Item</div>
                <div class="col-span-3 lg:col-span-4">Motivo / Tipo</div>
                <div class="col-span-2 text-right">Custo Perdido</div>
            </div>
            
            <!-- Table Body -->
            <div class="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                @for(item of items(); track item.id) {
                    <div class="grid grid-cols-12 gap-4 p-3 hover-surface-elevated rounded-xl transition-colors border border-transparent hover:border-strong text-sm items-center group">
                        <div class="col-span-3 lg:col-span-2 flex flex-col truncate pr-2">
                            <span class="font-bold text-title truncate">{{ item.date | date:'dd/MM/yyyy' }}</span>
                            <span class="text-xs text-muted font-mono">{{ item.date | date:'HH:mm' }}</span>
                        </div>
                        <div class="col-span-4 flex flex-col justify-center">
                            <span class="font-bold text-title line-clamp-1 leading-snug">{{ item.description }}</span>
                            <span class="text-[10px] text-muted font-bold uppercase tracking-wide">QTD: {{ item.quantity }}</span>
                        </div>
                        <div class="col-span-3 lg:col-span-4 flex flex-col justify-center">
                             <div class="flex items-center gap-2">
                                <span class="w-2 h-2 rounded-full flex-shrink-0" [ngClass]="item.type === 'CANCELLATION' ? 'bg-red-500' : 'bg-orange-500'"></span>
                                <span class="text-xs font-bold truncate text-muted">{{ item.reason }}</span>
                             </div>
                             <span class="text-[10px] text-muted/60 font-bold uppercase tracking-wide truncate ml-4">{{ item.employeeName || 'Sistema' }}</span>
                        </div>
                        <div class="col-span-2 text-right flex flex-col justify-center">
                            <span class="font-black text-danger">{{ item.totalCost | currency:'BRL' }}</span>
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
export class LossReportComponent {
  startDate = input.required<string>();
  endDate = input.required<string>();
  
  financeService = inject(FinancialDataService);
  
  items = signal<LossReportItem[]>([]);
  isLoading = signal(false);
  error = signal<string | null>(null);

  totalLoss = computed(() => this.items().reduce((acc, curr) => acc + curr.totalCost, 0));
  inventoryLoss = computed(() => this.items().filter(i => i.type === 'INVENTORY_LOSS').reduce((acc, curr) => acc + curr.totalCost, 0));
  cancellationLoss = computed(() => this.items().filter(i => i.type === 'CANCELLATION').reduce((acc, curr) => acc + curr.totalCost, 0));

  constructor() {
    effect(() => {
        const start = this.startDate();
        const end = this.endDate();
        if (start && end) {
            untracked(() => {
                this.loadData(start, end);
            });
        }
    });
  }

  async loadData(start: string, end: string) {
      if (this.isLoading()) return;
      this.isLoading.set(true);
      this.error.set(null);
      
      const { data, error } = await this.financeService.getLossReport(start, end);
      
      if (data) {
          this.items.set(data);
      } else {
          this.error.set(error?.message || 'Falha ao processar dados de perdas.');
      }
      this.isLoading.set(false);
  }
}
