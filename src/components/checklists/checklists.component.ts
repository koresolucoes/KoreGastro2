import { Component, ChangeDetectionStrategy, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { OperationalService } from '../../services/operational.service';
import { OperationalAuthService } from '../../services/operational-auth.service';
import { NotificationService } from '../../services/notification.service';
import { ChecklistTemplate, ChecklistLog } from '../../models/db.models';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-checklists',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  template: `
    <div class="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <!-- Page Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-subtle pb-6">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 bg-success/10 rounded-2xl flex items-center justify-center border border-success/20 shadow-inner">
            <span class="material-symbols-outlined text-success text-2xl">checklist</span>
          </div>
          <div>
            <h1 class="text-3xl font-black title-display tracking-tight text-title">Checklists</h1>
            <p class="text-muted text-sm font-medium">Controle operacional e rotinas diárias</p>
          </div>
        </div>

        <div class="flex flex-wrap gap-3">
          <button (click)="generatePDF()" class="flex-1 md:flex-none bg-surface-elevated hover-surface-elevated text-title px-5 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 border border-strong shadow-sm hover:translate-y-[-2px] active:scale-95 transition-all">
            <span class="material-symbols-outlined text-info">picture_as_pdf</span>
            Relatório
          </button>
          @if (isManager()) {
            <button (click)="showAddTemplateModal.set(true)" class="flex-1 md:flex-none bg-brand hover:bg-brand-hover text-white px-5 py-2.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-brand/20 hover:translate-y-[-2px] active:scale-95 transition-all border border-brand/50 uppercase tracking-wider">
              <span class="material-symbols-outlined text-sm">add</span>
              Nova Tarefa
            </button>
          }
        </div>
      </div>

      <!-- Filters -->
      <div class="flex flex-col sm:flex-row gap-4 p-4 chef-surface bg-surface-elevated/20 transition-all">
        <div class="flex-1 relative group">
          <span class="absolute left-4 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-brand material-symbols-outlined text-[20px] transition-colors">category</span>
          <select [ngModel]="selectedSection()" (ngModelChange)="selectedSection.set($event)" class="w-full pl-12 pr-4 py-3 rounded-xl bg-surface-elevated border-2 border-strong text-title font-bold focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 transition-all shadow-inner appearance-none">
            <option value="">Todas as Seções</option>
            <option value="Cozinha">Cozinha</option>
            <option value="Salão">Salão</option>
            <option value="Bar">Bar</option>
            <option value="Caixa">Caixa</option>
            <option value="Geral">Geral</option>
          </select>
        </div>
        
        <div class="flex-1 relative group">
          <span class="absolute left-4 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-brand material-symbols-outlined text-[20px] transition-colors">schedule</span>
          <select [ngModel]="selectedType()" (ngModelChange)="selectedType.set($event)" class="w-full pl-12 pr-4 py-3 rounded-xl bg-surface-elevated border-2 border-strong text-title font-bold focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 transition-all shadow-inner appearance-none">
            <option value="">Todos os Tipos</option>
            <option value="opening">Abertura</option>
            <option value="closing">Fechamento</option>
            <option value="custom">Outros</option>
          </select>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- Checklist Tasks -->
        <div class="lg:col-span-2 space-y-6">
          <div class="chef-surface overflow-hidden">
            <div class="px-6 py-5 border-b border-subtle bg-surface-elevated/30 flex justify-between items-center">
              <h3 class="text-lg font-black text-title uppercase tracking-widest flex items-center gap-2">
                <span class="material-symbols-outlined text-brand opacity-60">task_alt</span>
                Tarefas Pendentes
              </h3>
              <button (click)="loadData()" class="p-2 text-muted hover:text-brand hover:bg-brand/10 rounded-xl transition-all" title="Atualizar">
                <span class="material-symbols-outlined text-[20px]" [class.animate-spin]="isLoading()">refresh</span>
              </button>
            </div>
            
            @if (isLoading() && templates().length === 0) {
               <div class="p-16 text-center text-muted">
                <div class="animate-pulse flex flex-col items-center">
                   <div class="w-16 h-16 bg-brand/10 rounded-full flex items-center justify-center mb-4">
                      <span class="material-symbols-outlined text-brand text-4xl">sync</span>
                   </div>
                   <p class="font-bold uppercase tracking-widest text-xs">Sincronizando tarefas...</p>
                </div>
              </div>
            } @else if (filteredTemplates().length === 0) {
              <div class="p-16 text-center text-muted">
                <span class="material-symbols-outlined text-6xl mb-4 opacity-20">inventory</span>
                <p class="text-lg font-bold">Nenhuma tarefa encontrada.</p>
                @if (isManager()) {
                   <button (click)="showAddTemplateModal.set(true)" class="mt-4 text-brand font-black text-sm uppercase tracking-widest hover:underline">Nova tarefa</button>
                }
              </div>
            } @else {
              <div class="divide-y divide-subtle">
                @for (template of filteredTemplates(); track template.id) {
                  <div class="p-6 hover:bg-surface-elevated transition-colors group">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                      <div class="flex-1 min-w-0">
                        <div class="flex flex-wrap items-center gap-2 mb-3">
                           <span class="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-surface-elevated text-muted border border-strong">
                             {{ template.section }}
                           </span>
                           <span class="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest border"
                                 [ngClass]="{
                                   'bg-info/10 text-info border-info/20': template.checklist_type === 'opening',
                                   'bg-purple/10 text-purple border-purple/20': template.checklist_type === 'closing',
                                   'bg-muted/10 text-muted border-muted/20': template.checklist_type === 'custom'
                                 }">
                             {{ getTypeName(template.checklist_type) }}
                           </span>
                        </div>
                        <h4 class="text-lg font-bold text-title leading-tight">{{ template.task_description }}</h4>
                      </div>
                      
                      <div class="flex items-center gap-3">
                        <button (click)="logTask(template, 'completed')" 
                                [disabled]="isSubmitting()"
                                class="flex-1 sm:flex-none bg-success/10 hover:bg-success text-success hover:text-white border border-success/30 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50">
                          <span class="material-symbols-outlined text-[18px]">check_circle</span>
                          OK
                        </button>
                        <button (click)="logTask(template, 'issue')" 
                                [disabled]="isSubmitting()"
                                class="flex-1 sm:flex-none bg-danger/10 hover:bg-danger text-danger hover:text-white border border-danger/30 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50">
                          <span class="material-symbols-outlined text-[18px]">report_problem</span>
                          Falha
                        </button>
                      </div>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        </div>

        <!-- Recent Logs -->
        <div class="lg:col-span-1 space-y-6">
          <div class="chef-surface overflow-hidden flex flex-col max-h-[800px]">
            <div class="px-6 py-5 border-b border-subtle bg-surface-elevated/30 flex-shrink-0">
              <h3 class="text-lg font-black text-title uppercase tracking-widest flex items-center gap-2">
                <span class="material-symbols-outlined text-purple opacity-60">history</span>
                Execuções
              </h3>
            </div>
            <div class="flex-1 overflow-y-auto hide-scrollbar p-0">
              @if (recentLogs().length === 0) {
                <div class="p-12 text-center text-muted italic text-sm">
                   <span class="material-symbols-outlined block text-4xl mb-2 opacity-10">history_edu</span>
                   Nenhum registro.
                </div>
              } @else {
                <div class="divide-y divide-subtle">
                  @for (log of recentLogs(); track log.id) {
                    <div class="p-5 hover:bg-surface-elevated transition-colors">
                      <div class="flex justify-between items-start gap-4">
                        <div class="min-w-0">
                          <p class="text-sm font-bold text-title line-clamp-2 leading-snug">{{ log.checklist_templates?.task_description }}</p>
                          <div class="flex items-center gap-1.5 mt-2">
                             <span class="material-symbols-outlined text-[14px] text-muted">person</span>
                             <p class="text-[10px] font-bold text-muted uppercase tracking-wider truncate">{{ log.employees?.name || 'Sistema' }}</p>
                          </div>
                          @if(log.notes) {
                             <div class="mt-2 p-2 bg-warning/5 border border-warning/20 rounded-lg text-[10px] text-warning font-bold italic">
                                OBS: {{ log.notes }}
                             </div>
                          }
                        </div>
                        <div class="flex-shrink-0">
                          @if (log.status === 'completed') {
                            <div class="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center text-success border border-success/20">
                               <span class="material-symbols-outlined text-[20px]">check_circle</span>
                            </div>
                          } @else if (log.status === 'issue') {
                            <div class="w-8 h-8 rounded-full bg-danger/10 flex items-center justify-center text-danger border border-danger/20 animate-pulse">
                               <span class="material-symbols-outlined text-[20px]">report_problem</span>
                            </div>
                          }
                        </div>
                      </div>
                      <div class="flex items-center gap-1.5 mt-3 opacity-50">
                        <span class="material-symbols-outlined text-[14px]">calendar_month</span>
                        <p class="text-[10px] font-bold uppercase tracking-widest">{{ log.completed_at | date:'dd MMM, HH:mm' }}</p>
                      </div>
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Template Modal -->
    @if (showAddTemplateModal()) {
       <div class="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300" (click)="showAddTemplateModal.set(false)">
        <div class="chef-surface w-full max-w-md overflow-hidden transform scale-100 transition-all shadow-2xl border-2 border-strong" (click)="$event.stopPropagation()">
          <div class="px-6 py-5 border-b border-subtle bg-surface-elevated/50 flex justify-between items-center">
            <h3 class="text-xl font-black text-title title-display tracking-tight flex items-center gap-2">
               <span class="material-symbols-outlined text-brand">add_task</span>
               Nova Tarefa
            </h3>
            <button (click)="showAddTemplateModal.set(false)" class="p-2 rounded-xl text-muted hover:bg-danger/10 hover:text-danger active:scale-95 transition-all">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <form [formGroup]="templateForm" (ngSubmit)="saveTemplate()">
            <div class="p-8 space-y-6">
              <div>
                <label class="block text-[11px] font-black uppercase tracking-widest text-muted mb-2">Descrição da Tarefa</label>
                <textarea formControlName="task_description" rows="3" class="w-full bg-surface-elevated border-2 border-strong rounded-xl px-4 py-3 text-title font-bold focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 transition-all shadow-inner resize-none" placeholder="O que deve ser feito?"></textarea>
              </div>
              <div class="grid grid-cols-2 gap-6">
                <div>
                  <label class="block text-[11px] font-black uppercase tracking-widest text-muted mb-2">Seção</label>
                  <select formControlName="section" class="w-full bg-surface-elevated border-2 border-strong rounded-xl px-4 py-2.5 text-title font-bold focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 transition-all shadow-inner appearance-none">
                    <option value="Cozinha">Cozinha</option>
                    <option value="Salão">Salão</option>
                    <option value="Bar">Bar</option>
                    <option value="Caixa">Caixa</option>
                    <option value="Geral">Geral</option>
                  </select>
                </div>
                <div>
                  <label class="block text-[11px] font-black uppercase tracking-widest text-muted mb-2">Tipo</label>
                  <select formControlName="checklist_type" class="w-full bg-surface-elevated border-2 border-strong rounded-xl px-4 py-2.5 text-title font-bold focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 transition-all shadow-inner appearance-none">
                    <option value="opening">Abertura</option>
                    <option value="closing">Fechamento</option>
                    <option value="custom">Outros</option>
                  </select>
                </div>
              </div>
            </div>
            <div class="bg-surface-elevated/50 px-8 py-5 border-t border-subtle flex justify-end gap-3">
              <button type="button" (click)="showAddTemplateModal.set(false)" class="px-6 py-2.5 bg-surface hover-surface-elevated text-title rounded-xl text-sm font-bold border border-strong transition-all active:scale-95 shadow-sm">
                Cancelar
              </button>
              <button type="submit" [disabled]="templateForm.invalid || isSubmitting()" class="px-8 py-2.5 bg-brand hover:bg-brand-hover disabled:bg-surface-elevated disabled:text-muted disabled:border-subtle text-white rounded-xl text-sm font-black shadow-lg shadow-brand/20 transition-all active:scale-95 border border-brand uppercase tracking-widest">
                Salvar
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChecklistsComponent implements OnInit {
  private operationalService = inject(OperationalService);
  private authService = inject(OperationalAuthService);
  private notificationService = inject(NotificationService);
  private fb = inject(FormBuilder);

  templates = signal<ChecklistTemplate[]>([]);
  recentLogs = signal<ChecklistLog[]>([]);
  isLoading = signal(true);
  isSubmitting = signal(false);
  showAddTemplateModal = signal(false);

  selectedSection = signal<string>('');
  selectedType = signal<string>('');

  templateForm = this.fb.group({
    task_description: ['', Validators.required],
    section: ['Cozinha', Validators.required],
    checklist_type: ['opening', Validators.required]
  });

  filteredTemplates = computed(() => {
    let list = this.templates();
    const section = this.selectedSection();
    const type = this.selectedType();

    if (section) {
      list = list.filter(t => t.section === section);
    }
    if (type) {
      list = list.filter(t => t.checklist_type === type);
    }
    return list;
  });

  ngOnInit() {
    this.loadData();
  }

  async loadData() {
    this.isLoading.set(true);
    try {
      const [templates, logs] = await Promise.all([
        this.operationalService.getChecklistTemplates(),
        this.operationalService.getRecentChecklistLogs()
      ]);
      this.templates.set(templates);
      this.recentLogs.set(logs);
    } finally {
      this.isLoading.set(false);
    }
  }

  isManager(): boolean {
    const employee = this.authService.activeEmployee();
    return employee?.role === 'Gerente' || employee?.role === 'Admin';
  }

  getTypeName(type: string): string {
    switch (type) {
      case 'opening': return 'Abertura';
      case 'closing': return 'Fechamento';
      default: return 'Outros';
    }
  }

  async saveTemplate() {
    if (this.templateForm.invalid) return;
    
    this.isSubmitting.set(true);
    try {
      const values = this.templateForm.value;
      const newTemplate = await this.operationalService.addChecklistTemplate({
        task_description: values.task_description!,
        section: values.section!,
        checklist_type: values.checklist_type as any,
        is_active: true
      });
      
      if (newTemplate) {
        this.templates.update(list => [...list, newTemplate]);
        this.showAddTemplateModal.set(false);
        this.templateForm.reset({ section: 'Cozinha', checklist_type: 'opening' });
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async logTask(template: ChecklistTemplate, status: 'completed' | 'issue') {
    const employee = this.authService.activeEmployee();
    if (!employee) {
      this.notificationService.show('Você precisa estar logado como um funcionário para executar checklists.', 'error');
      return;
    }

    let notes = null;
    if (status === 'issue') {
      const result = await this.notificationService.prompt(
        'Por favor, descreva o problema encontrado:',
        'Reportar Problema',
        { inputType: 'textarea', placeholder: 'Detalhes do problema...' }
      );
      if (!result.confirmed || !result.value) return; // User cancelled or empty
      notes = result.value;
    }

    this.isSubmitting.set(true);
    try {
      const log = await this.operationalService.logChecklistTask({
        template_id: template.id,
        employee_id: employee.id,
        status: status,
        notes: notes
      });

      if (log) {
        // Refresh logs
        const logs = await this.operationalService.getRecentChecklistLogs();
        this.recentLogs.set(logs);
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  generatePDF() {
    const doc = new jsPDF();
    const logs = this.recentLogs();
    
    doc.setFontSize(18);
    doc.text('Relatório de Checklists', 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 30);

    const tableData = logs.map(log => {
      let statusStr = 'Pendente';
      if (log.status === 'completed') statusStr = 'Concluído';
      if (log.status === 'issue') statusStr = 'Problema';

      return [
        log.checklist_templates?.task_description || 'Desconhecido',
        log.checklist_templates?.section || '-',
        statusStr,
        log.employees?.name || 'Desconhecido',
        new Date(log.completed_at).toLocaleString(),
        log.notes || '-'
      ];
    });

    autoTable(doc, {
      startY: 36,
      head: [['Tarefa', 'Seção', 'Status', 'Executado por', 'Data/Hora', 'Observações']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
      columnStyles: {
        5: { cellWidth: 40 } // Observações column width
      }
    });

    doc.save(`relatorio-checklists-${new Date().getTime()}.pdf`);
  }
}
