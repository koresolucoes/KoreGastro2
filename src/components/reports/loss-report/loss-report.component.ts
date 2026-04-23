import { Component, ChangeDetectionStrategy, input } from '@angular/core';

@Component({
  selector: 'app-loss-report',
  standalone: true,
  template: `
    <div class="h-full flex flex-col space-y-8">
      <div class="chef-surface rounded-[40px] border border-subtle shadow-xl p-8 bg-amber-500/5 border-amber-500/20">
        <div class="flex items-start gap-6">
          <div class="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20 shadow-inner">
            <span class="material-symbols-outlined text-amber-600 text-4xl">trending_down</span>
          </div>
          <div>
            <h2 class="text-3xl font-black text-amber-600 title-display tracking-tight">Relatório de Perdas & Desperdício</h2>
            <p class="text-muted font-medium text-sm mt-2 max-w-3xl leading-relaxed">
              DRE das perdas: Visualize o <strong>custo total de ingredientes vencidos, erros operacionais e cortesias</strong> e o impacto direto na margem de lucro.
            </p>
          </div>
        </div>
      </div>
      
      <div class="flex flex-col items-center justify-center h-96 chef-surface rounded-[40px] border border-dashed border-strong opacity-80">
        <div class="w-24 h-24 bg-surface-elevated rounded-full flex items-center justify-center mb-6 border border-strong shadow-inner">
          <span class="material-symbols-outlined text-muted/40 text-5xl">pie_chart</span>
        </div>
        <h3 class="text-lg font-black text-title tracking-tight mb-2">Processamento de Ocorrências</h3>
        <p class="text-muted text-xs font-medium max-w-sm text-center">Integração com logs de lançamento de inventário e cancelamento de cozinha pendente.</p>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LossReportComponent {
  startDate = input.required<string>();
  endDate = input.required<string>();
}
