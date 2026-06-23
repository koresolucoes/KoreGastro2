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
    <div class="p-4 md:p-8 text-body min-h-[calc(100vh-64px)] bg-app flex flex-col pt-20">
      <!-- Page Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 mt-4 md:mt-0">
        <div>
           <h1 class="text-4xl font-black title-display tracking-tight text-title flex items-center gap-3">
              Rotinas & Checklists
           </h1>
           <p class="text-muted mt-2 font-medium">Controle de abertura, fechamento e limpeza</p>
        </div>

        <div class="flex flex-wrap gap-3">
          <button (click)="generatePDF()" class="flex-1 md:flex-none chef-surface hover-surface-elevated text-title px-5 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 border border-subtle shadow-sm active:scale-95 transition-all">
            <span translate="no" class="notranslate material-symbols-outlined text-info">picture_as_pdf</span>
            Gerar Relatório
          </button>
          @if (isManager()) {
            <button (click)="showAddTemplateModal.set(true)" class="flex-1 md:flex-none btn-primary text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all">
              <span translate="no" class="notranslate material-symbols-outlined text-sm">add</span>
              Criar Rotina
            </button>
          }
        </div>
      </div>

      <!-- Filters -->
      <div class="flex flex-col sm:flex-row gap-4 mb-8">
        <div class="flex-1 relative group">
          <span translate="no" class="notranslate absolute left-4 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-brand material-symbols-outlined text-[20px] transition-colors">schedule</span>
          <select [ngModel]="selectedType()" (ngModelChange)="selectedType.set($event)" class="w-full pl-12 pr-4 py-3 rounded-xl chef-surface border border-subtle text-title font-bold focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all appearance-none cursor-pointer">
            <option value="">Qualquer Turno</option>
            <option value="opening">Abertura (Manhã)</option>
            <option value="closing">Fechamento (Noite)</option>
            <option value="custom">Rotinas Específicas</option>
          </select>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-8 pb-12">
        <!-- Checklist Groups (Clipboard Style) -->
        <div class="xl:col-span-2 space-y-8">
            @if (isLoading() && templates().length === 0) {
               <div class="flex justify-center py-20">
                    <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand"></div>
               </div>
            } @else if (groupedTemplates().length === 0) {
              <div class="chef-surface p-16 text-center text-muted rounded-3xl border border-dashed border-strong">
                <span translate="no" class="notranslate material-symbols-outlined text-6xl mb-4 opacity-50">inventory</span>
                <p class="text-xl font-bold title-display text-title">Nenhuma rotina pendente.</p>
                <p class="mt-2 text-sm font-medium">Todas as áreas estão em dia.</p>
              </div>
            } @else {
               @for (group of groupedTemplates(); track group.section) {
                   <!-- Section Card (Clipboard) -->
                   <div class="chef-surface rounded-2xl overflow-hidden shadow-sm border border-subtle relative">
                       <!-- Top clipboard clip -->
                       <div class="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-3 bg-surface-elevated rounded-b-xl border border-t-0 border-subtle shadow-inner z-10 hidden sm:block"></div>
                       
                       <div class="bg-surface-elevated/30 p-6 border-b border-subtle">
                           <div class="flex justify-between items-end">
                               <div>
                                    <span class="inline-block px-3 py-1 bg-surface rounded text-xs font-black uppercase tracking-widest text-muted border border-strong shadow-inner mb-3">
                                        Praça / Setor
                                    </span>
                                    <h3 class="text-3xl font-black text-title title-display tracking-tight">{{ group.section }}</h3>
                               </div>
                               <div class="text-right">
                                   <div class="text-4xl font-black text-brand data-mono tracking-tighter">{{ getSectionProgress(group.section) }}%</div>
                                   <div class="text-[10px] font-bold uppercase tracking-widest text-muted">Concluído hoje</div>
                               </div>
                           </div>
                           
                           <!-- Progress Bar -->
                           <div class="h-2 w-full bg-surface-elevated rounded-full mt-5 overflow-hidden border border-strong inset-shadow-sm">
                                <div class="h-full bg-brand transition-all duration-1000 ease-in-out" [style.width.%]="getSectionProgress(group.section)"></div>
                           </div>
                       </div>

                       <div class="divide-y divide-subtle bg-app/50">
                           @for (template of group.templates; track template.id) {
                               <div class="p-4 sm:p-6 transition-all border-l-4 cursor-pointer select-none group/card" 
                                    [class.opacity-60]="isTaskDone(template.id)"
                                    [class.border-l-success]="isTaskDone(template.id)"
                                    [class.border-l-transparent]="!isTaskDone(template.id)"
                                    [class.bg-success/5]="isTaskDone(template.id)"
                                    [class.hover:bg-surface-elevated]="!isTaskDone(template.id)"
                                    (click)="toggleTask(template)">
                                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div class="flex items-start gap-4 flex-1">
                                             <!-- Checkbox UI -->
                                             <div class="w-10 h-10 shrink-0 rounded-xl border-2 flex items-center justify-center transition-all" 
                                                [class.border-success]="isTaskDone(template.id)" [class.bg-success]="isTaskDone(template.id)" 
                                                [class.border-strong]="!isTaskDone(template.id)" [class.bg-surface]="!isTaskDone(template.id)"
                                                [class.group-hover/card:border-brand]="!isTaskDone(template.id)">
                                                @if (isTaskDone(template.id)) {
                                                    <span translate="no" class="notranslate material-symbols-outlined text-white text-2xl font-bold">check</span>
                                                }
                                             </div>
                                             
                                             <div class="pt-1">
                                                 <label class="text-xl font-bold text-title cursor-pointer leading-tight mb-2 block" [class.line-through]="isTaskDone(template.id)">
                                                     {{ template.task_description }}
                                                 </label>
                                                 <div class="flex items-center gap-2">
                                                     <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest"
                                                         [ngClass]="{
                                                            'bg-info/10 text-info border border-info/20': template.checklist_type === 'opening',
                                                            'bg-purple/10 text-purple border border-purple/20': template.checklist_type === 'closing',
                                                            'bg-surface-elevated text-muted border border-strong': template.checklist_type === 'custom'
                                                         }">
                                                     {{ getTypeName(template.checklist_type) }}
                                                     </span>
                                                 </div>
                                             </div>
                                        </div>
                                        
                                        <div class="flex gap-2 sm:pl-12">
                                             @if (!isTaskDone(template.id)) {
                                                 <button (click)="openIssueModal(template, $event)" class="text-danger bg-surface z-10 hover:bg-danger/10 px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2 border border-danger/30 hover:border-danger hover:shadow-md active:scale-95 text-center justify-center">
                                                     <span translate="no" class="notranslate material-symbols-outlined text-lg">photo_camera</span> 
                                                     <span class="hidden sm:inline">Reportar com Foto</span>
                                                 </button>
                                             }
                                        </div>
                                    </div>
                               </div>
                           }
                       </div>
                   </div>
               }
            }
        </div>

        <!-- Recent Logs Side Panel -->
        <div class="xl:col-span-1 border-l border-subtle pl-0 xl:pl-8">
            <h3 class="text-xl font-bold text-title title-display tracking-tight mb-6 flex items-center gap-2">
                <span translate="no" class="notranslate material-symbols-outlined text-brand">history</span>
                Diário de Bordo
            </h3>
            
            <div class="relative border-l-2 border-subtle ml-3 space-y-8 pb-8">
                @if (recentLogs().length === 0) {
                    <div class="pl-8 text-muted italic text-sm">Nenhum registro recente.</div>
                }
                
                @for (log of recentLogs(); track log.id) {
                    <div class="relative pl-8 group">
                         <!-- Timeline dot -->
                         <div class="absolute -left-[9px] top-1 w-4 h-4 rounded-full border-4 border-app transition-colors"
                            [class.bg-success]="log.status === 'completed'"
                            [class.bg-danger]="log.status === 'issue'">
                         </div>
                         
                         <div class="p-4 chef-surface rounded-2xl border border-subtle shadow-sm group-hover:shadow-md transition-shadow">
                             <div class="text-[10px] font-black uppercase tracking-widest text-muted mb-2">{{ log.completed_at | date:'HH:mm' }} • Hoje</div>
                             <p class="text-sm font-bold text-title leading-snug">{{ log.checklist_templates?.task_description }}</p>
                             
                             @if(log.status === 'issue') {
                                 <div class="mt-3 p-3 bg-danger/5 border border-danger/20 rounded-xl">
                                     <div class="flex items-center gap-1.5 text-danger font-bold text-[10px] uppercase tracking-widest mb-1">
                                         <span translate="no" class="notranslate material-symbols-outlined text-[14px]">warning</span> Atenção Necessária
                                     </div>
                                     <p class="text-xs text-danger/80 italic font-medium">{{ log.notes || 'Sem detalhes' }}</p>
                                 </div>
                             }
                             
                             <div class="mt-3 pt-3 border-t border-subtle flex items-center gap-2 text-muted text-xs font-medium">
                                 <div class="w-5 h-5 rounded-full bg-surface-elevated flex items-center justify-center border border-strong shrink-0">
                                     <span translate="no" class="notranslate material-symbols-outlined text-[10px]">person</span>
                                 </div>
                                 <span class="truncate">{{ log.employees?.name || 'Chef Executivo' }}</span>
                             </div>
                         </div>
                    </div>
                }
            </div>
        </div>
      </div>      <!-- Add Template Modal -->
    @if (showAddTemplateModal()) {
       <div class="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300" (click)="showAddTemplateModal.set(false)">
        <div class="chef-surface w-full max-w-md overflow-hidden transform scale-100 transition-all shadow-2xl border-2 border-strong" (click)="$event.stopPropagation()">
          <div class="px-6 py-5 border-b border-subtle bg-surface-elevated/50 flex justify-between items-center">
            <h3 class="text-xl font-black text-title title-display tracking-tight flex items-center gap-2">
               <span translate="no" class="notranslate material-symbols-outlined text-brand">add_task</span>
               Nova Tarefa
            </h3>
            <button (click)="showAddTemplateModal.set(false)" class="p-2 rounded-xl text-muted hover:bg-danger/10 hover:text-danger active:scale-95 transition-all">
              <span translate="no" class="notranslate material-symbols-outlined">close</span>
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

    <!-- Setup Issue/Photo Modal -->
    @if(templateToIssue()) {
        <div class="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex flex-col pt-10 px-4 pb-4 animate-in fade-in zoom-in-95 duration-200" (click)="closeIssueModal()">
            <div class="max-w-md mx-auto w-full flex flex-col bg-surface rounded-3xl overflow-hidden shadow-2xl relative" (click)="$event.stopPropagation()">
                <div class="p-6 bg-danger border-b border-danger-hover text-white flex justify-between items-start">
                    <div>
                        <h3 class="text-xl font-black title-display tracking-tight flex items-center gap-2 mb-1">
                            <span translate="no" class="notranslate material-symbols-outlined">report</span> Reportar Problema
                        </h3>
                        <p class="text-sm font-bold text-white/80 line-clamp-2 leading-tight">{{ templateToIssue()!.task_description }}</p>
                    </div>
                </div>
                
                <div class="p-6 space-y-6">
                    <!-- Fake Camera Viewport -->
                     <button class="w-full aspect-[4/3] bg-app border-2 border-dashed border-strong rounded-2xl flex flex-col items-center justify-center text-muted hover:text-brand hover:bg-brand/5 hover:border-brand/30 transition-all group active:scale-[0.98]">
                         <span translate="no" class="notranslate material-symbols-outlined text-5xl mb-2 group-hover:scale-110 transition-transform">photo_camera</span>
                         <span class="font-bold uppercase tracking-widest text-xs">Capturar Foto (Obrigatório)</span>
                     </button>
                     
                     <div>
                         <label class="block text-[11px] font-black uppercase tracking-widest text-muted mb-2">Descreva o ocorrido</label>
                         <textarea [ngModel]="issueNote()" (ngModelChange)="issueNote.set($event)" rows="3" class="w-full bg-surface-elevated border border-strong rounded-xl px-4 py-3 text-title font-medium focus:outline-none focus:border-danger focus:ring-1 focus:ring-danger transition-all resize-none" placeholder="O que quebrou? Faltou algo?"></textarea>
                     </div>
                </div>
                
                <div class="p-6 pt-0 flex gap-3">
                    <button (click)="closeIssueModal()" class="flex-1 px-6 py-4 bg-surface hover-surface-elevated text-title rounded-2xl text-sm font-bold border border-strong transition-all active:scale-95 text-center">
                        Cancelar
                    </button>
                    <button (click)="submitIssue()" [disabled]="!issueNote().trim() || isSubmitting()" class="flex-1 px-6 py-4 bg-danger hover:bg-danger-hover text-white rounded-2xl text-sm font-black shadow-lg shadow-danger/20 transition-all active:scale-95 flex justify-center items-center gap-2 disabled:opacity-50">
                        <span translate="no" class="notranslate material-symbols-outlined text-lg">check_circle</span>
                        Reportar
                    </button>
                </div>
            </div>
        </div>
    }
  </div>
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

  // Issue modal state
  templateToIssue = signal<ChecklistTemplate | null>(null);
  issueNote = signal('');

  filteredTemplates = computed(() => {
    let list = this.templates();
    // Removed section filter to allow grouped list
    const type = this.selectedType();

    if (type) {
      list = list.filter(t => t.checklist_type === type);
    }
    return list;
  });

  groupedTemplates = computed(() => {
     const list = this.filteredTemplates();
     const groups = new Map<string, ChecklistTemplate[]>();
     
     list.forEach(t => {
         const section = t.section || 'Geral';
         if (!groups.has(section)) {
             groups.set(section, []);
         }
         groups.get(section)!.push(t);
     });
     
     return Array.from(groups.entries()).map(([section, templates]) => ({ section, templates }));
  });

  // Calculate progress for a section
  getSectionProgress(section: string): number {
     const templates = this.groupedTemplates().find(g => g.section === section)?.templates || [];
     if (templates.length === 0) return 0;
     
     let completed = 0;
     const logs = this.recentLogs();
     
     // Check if each template has a 'completed' log today
     const todayStr = new Date().toISOString().split('T')[0];
     
     templates.forEach(t => {
         const isDone = logs.some(l => l.template_id === t.id && l.status === 'completed' && l.completed_at.startsWith(todayStr));
         if (isDone) completed++;
     });
     
     return Math.round((completed / templates.length) * 100);
  }

  isTaskDone(templateId: string): boolean {
     const logs = this.recentLogs();
     const todayStr = new Date().toISOString().split('T')[0];
     return logs.some(l => l.template_id === templateId && l.status === 'completed' && l.completed_at.startsWith(todayStr));
  }

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

  async toggleTask(template: ChecklistTemplate) {
      if(this.isSubmitting()) return;
      if (this.isTaskDone(template.id)) {
          // Prevent unchecking for this simplified flow, or implement uncheck if needed.
          // For now, doing nothing to prevent accidental unchecks, or we could delete the log.
          // Let's allow unchecking by finding the log and deleting it (not supported by service directly yet).
          return;
      }
      
      // Mark as done
      await this.logTask(template, 'completed', null);
  }

  openIssueModal(template: ChecklistTemplate, event: Event) {
      event.stopPropagation();
      this.templateToIssue.set(template);
      this.issueNote.set('');
  }

  closeIssueModal() {
      this.templateToIssue.set(null);
  }

  async submitIssue() {
      const template = this.templateToIssue();
      if(!template) return;
      await this.logTask(template, 'issue', this.issueNote());
      this.closeIssueModal();
  }

  async logTask(template: ChecklistTemplate, status: 'completed' | 'issue', providedNotes: string | null = null) {
    const employee = this.authService.activeEmployee();
    if (!employee) {
      this.notificationService.show('Você precisa estar logado como um funcionário para executar checklists.', 'error');
      return;
    }

    this.isSubmitting.set(true);
    try {
      const log = await this.operationalService.logChecklistTask({
        template_id: template.id,
        employee_id: employee.id,
        status: status,
        notes: providedNotes
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
