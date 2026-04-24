import { Component, ChangeDetectionStrategy, input, inject, signal, effect, untracked } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { AuditDataService } from '../../../services/audit-data.service';
import { SystemLog } from '../../../models/db.models';

@Component({
  selector: 'app-system-logs',
  standalone: true,
  imports: [CommonModule],
  providers: [DatePipe],
  template: `
    <div class="h-full flex flex-col space-y-8">
      <div class="chef-surface rounded-3xl border border-subtle shadow-xl p-6 bg-red-500/5 border-red-500/20 flex-shrink-0">
        <div class="flex items-start gap-6">
          <div class="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center border border-red-500/20 shadow-inner flex-shrink-0">
             <span class="material-symbols-outlined text-red-500 text-4xl">admin_panel_settings</span>
          </div>
          <div>
            <h2 class="text-2xl font-black text-red-500 title-display tracking-tight">Logs de Sistema & Auditoria Imutável</h2>
            <p class="text-muted font-medium text-sm mt-2 max-w-3xl leading-relaxed">
              Consulte todo o histórico de alterações críticas no sistema: <strong>Quem alterou um preço, quem acessou quais telas, ou quem fez sangrias/fechamentos de caixa</strong>. Este log não pode ser alterado nem excluído.
            </p>
          </div>
        </div>
      </div>
      
      <div class="flex-1 chef-surface rounded-3xl border border-subtle flex flex-col overflow-hidden">
        @if (isLoading()) {
            <div class="flex-1 flex flex-col items-center justify-center p-12">
                <div class="w-16 h-16 border-4 border-subtle border-t-brand rounded-full animate-spin mb-4"></div>
                <p class="text-muted font-black uppercase tracking-widest text-xs animate-pulse">Carregando Registros Seguros...</p>
            </div>
        } @else if (error()) {
            <div class="flex-1 flex flex-col items-center justify-center p-12 text-center">
                <div class="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
                    <span class="material-symbols-outlined text-red-500 text-5xl">error</span>
                </div>
                <h3 class="text-lg font-black text-title tracking-tight mb-2">Erro de Conexão</h3>
                <p class="text-muted text-sm max-w-md mx-auto">{{ error() }}</p>
            </div>
        } @else if (logs().length === 0) {
             <div class="flex flex-col items-center justify-center flex-1 p-12 opacity-80">
                <div class="w-24 h-24 bg-surface-elevated rounded-full flex items-center justify-center mb-6 border border-strong shadow-inner">
                  <span class="material-symbols-outlined text-muted/40 text-5xl">inventory_2</span>
                </div>
                <h3 class="text-lg font-black text-title tracking-tight mb-2">Nenhum Registro no Período</h3>
                <p class="text-muted text-xs font-medium max-w-sm text-center">Nenhum evento auditável aconteceu entre os dias selecionados.</p>
              </div>
        } @else {
            <!-- Table Header -->
            <div class="grid grid-cols-12 gap-4 p-4 border-b border-subtle bg-surface-elevated text-xs font-black text-muted uppercase tracking-widest stick top-0 z-10">
                <div class="col-span-3 lg:col-span-2">Data / Hora</div>
                <div class="col-span-3 lg:col-span-2">Operador</div>
                <div class="col-span-3 lg:col-span-2">Ação</div>
                <div class="col-span-6 lg:col-span-6">Detalhes do Evento</div>
            </div>
            
            <!-- Table Body -->
            <div class="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                @for(log of logs(); track log.id) {
                    <div class="grid grid-cols-12 gap-4 p-3 hover-surface-elevated rounded-xl transition-colors border border-transparent hover:border-strong text-sm items-center group">
                        <div class="col-span-3 lg:col-span-2 flex flex-col whitespace-nowrap">
                            <span class="font-bold text-title">{{ log.created_at | date:'dd/MM/yyyy' }}</span>
                            <span class="text-xs text-muted font-mono">{{ log.created_at | date:'HH:mm:ss' }}</span>
                        </div>
                        <div class="col-span-3 lg:col-span-2 flex items-center gap-2 truncate pr-2">
                             @if(log.employee_id && log.employees?.name) {
                                 <div class="flex items-center gap-2">
                                    <div class="w-6 h-6 rounded bg-brand/10 flex items-center justify-center flex-shrink-0">
                                        <span class="text-brand font-bold text-[10px]">{{ log.employees?.name?.substring(0, 2).toUpperCase() }}</span>
                                    </div>
                                    <span class="font-bold text-title truncate text-xs">{{ log.employees!.name }}</span>
                                 </div>
                             } @else {
                                 <span class="text-xs font-bold text-muted bg-surface-elevated px-2 py-1 rounded-md border border-subtle">Sistema / Admin</span>
                             }
                        </div>
                        <div class="col-span-3 lg:col-span-2">
                            <span class="px-2 py-1 bg-surface-elevated border border-strong rounded-md text-[10px] font-black uppercase tracking-widest"
                                  [ngClass]="getActionStyles(log.action)">
                                {{ formatAction(log.action) }}
                            </span>
                        </div>
                        <div class="col-span-6 lg:col-span-6 flex items-center">
                            <p class="text-muted text-xs leading-relaxed line-clamp-2 group-hover:line-clamp-none transition-all">{{ log.details }}</p>
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
export class SystemLogsReportComponent {
  startDate = input.required<string>();
  endDate = input.required<string>();
  
  auditService = inject(AuditDataService);
  
  logs = signal<SystemLog[]>([]);
  isLoading = signal(false);
  error = signal<string | null>(null);

  constructor() {
    effect(() => {
        const start = this.startDate();
        const end = this.endDate();
        if (start && end) {
            untracked(() => {
                this.loadLogs(start, end);
            });
        }
    });
  }

  async loadLogs(startDate: string, endDate: string) {
      if (this.isLoading()) return;
      this.isLoading.set(true);
      this.error.set(null);
      
      const { success, data, error } = await this.auditService.getLogs(startDate, endDate);
      
      if (success && data) {
          this.logs.set(data);
      } else {
          // If the table doesn't exist yet, show a friendly message
          if (error && error.message && error.message.includes('relation "system_logs" does not exist')) {
             this.error.set('Tabela de logs imutáveis não está configurada no banco de dados. Os logs não estão sendo registrados.');
          } else {
             this.error.set('Falha ao carregar os registros de auditoria. Tente novamente.');
             console.error('Audit Load Error:', error);
          }
      }
      this.isLoading.set(false);
  }
  
  formatAction(action: string): string {
      return action.replace(/_/g, ' ');
  }
  
  getActionStyles(action: string): string {
      const act = action.toUpperCase();
      if (act.includes('CANCEL') || act.includes('DELETE') || act.includes('FECHAMENTO')) {
          return 'text-danger border-danger/30 bg-danger/5';
      }
      if (act.includes('ALTERA') || act.includes('UPDATE') || act.includes('PRICE')) {
          return 'text-warning border-warning/30 bg-warning/5';
      }
      if (act.includes('NEW') || act.includes('CREATE') || act.includes('ABERTURA')) {
          return 'text-success border-success/30 bg-success/5';
      }
      return 'text-brand border-brand/30 bg-brand/5';
  }
}

