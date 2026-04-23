import { Component, ChangeDetectionStrategy, input } from '@angular/core';

@Component({
  selector: 'app-system-logs',
  standalone: true,
  template: `
    <div class="h-full flex flex-col space-y-8">
      <div class="chef-surface rounded-[40px] border border-subtle shadow-xl p-8 bg-red-500/5 border-red-500/20">
        <div class="flex items-start gap-6">
          <div class="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center border border-red-500/20 shadow-inner">
            <span class="material-symbols-outlined text-red-500 text-4xl">admin_panel_settings</span>
          </div>
          <div>
            <h2 class="text-3xl font-black text-red-500 title-display tracking-tight">Logs de Sistema & Auditoria Imutável</h2>
            <p class="text-muted font-medium text-sm mt-2 max-w-3xl leading-relaxed">
              Consulte todo o histórico de alterações críticas no sistema: <strong>Quem alterou um preço, quem acessou quais telas, ou quem fez sangrias/fechamentos de caixa</strong>. Este log não pode ser alterado nem excluído.
            </p>
          </div>
        </div>
      </div>
      
      <div class="flex flex-col items-center justify-center h-96 chef-surface rounded-[40px] border border-dashed border-strong opacity-80">
        <div class="w-24 h-24 bg-surface-elevated rounded-full flex items-center justify-center mb-6 border border-strong shadow-inner">
          <span class="material-symbols-outlined text-muted/40 text-5xl">inventory_2</span>
        </div>
        <h3 class="text-lg font-black text-title tracking-tight mb-2">Conectando aos Registros</h3>
        <p class="text-muted text-xs font-medium max-w-sm text-center">Os Logs Imutáveis estão sendo integrados do banco de dados na V3 da API.</p>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SystemLogsReportComponent {
  startDate = input.required<string>();
  endDate = input.required<string>();
}
