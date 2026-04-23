import { Component, ChangeDetectionStrategy, input } from '@angular/core';

@Component({
  selector: 'app-customer-behavior',
  standalone: true,
  template: `
    <div class="h-full flex flex-col space-y-8">
      <div class="chef-surface rounded-[40px] border border-subtle shadow-xl p-8">
        <div class="flex items-start gap-6">
          <div class="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20 shadow-inner">
            <span class="material-symbols-outlined text-indigo-500 text-4xl">psychology</span>
          </div>
          <div>
            <h2 class="text-3xl font-black text-title title-display tracking-tight">Comportamento de Clientes (RFM)</h2>
            <p class="text-muted font-medium text-sm mt-2 max-w-3xl leading-relaxed">
              Analise a <strong>Recência, Frequência e Valor Monetário</strong> dos seus clientes (especialmente no Delivery). Entenda quem são os clientes VIPs, os inativos e crie campanhas de fidelidade precisas.
            </p>
          </div>
        </div>
      </div>
      
      <div class="flex flex-col items-center justify-center h-96 chef-surface rounded-[40px] border border-dashed border-strong opacity-80">
        <div class="w-24 h-24 bg-surface-elevated rounded-full flex items-center justify-center mb-6 border border-strong shadow-inner">
          <span class="material-symbols-outlined text-muted/40 text-5xl">construction</span>
        </div>
        <h3 class="text-lg font-black text-title tracking-tight mb-2">Módulo em Desenvolvimento</h3>
        <p class="text-muted text-xs font-medium max-w-sm text-center">Nesta versão os dados do CRM estão sendo integrados ao pipeline de dados.</p>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerBehaviorReportComponent {
  startDate = input.required<string>();
  endDate = input.required<string>();
}
