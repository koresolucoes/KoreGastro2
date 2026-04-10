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
    <div class="p-6 max-w-7xl mx-auto">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-bold text-white">Checklists Diários</h1>
        <div class="flex gap-3">
          <button (click)="generatePDF()" class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2">
            <span class="material-symbols-outlined text-sm">picture_as_pdf</span>
            Gerar Relatório
          </button>
          @if (isManager()) {
            <button (click)="showAddTemplateModal.set(true)" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2">
              <span class="material-symbols-outlined text-sm">add</span>
              Nova Tarefa
            </button>
          }
        </div>
      </div>

      <!-- Filters -->
      <div class="mb-6 flex gap-4">
        <select [ngModel]="selectedSection()" (ngModelChange)="selectedSection.set($event)" class="rounded-md bg-gray-800 border-gray-700 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm">
          <option value="">Todas as Seções</option>
          <option value="Cozinha">Cozinha</option>
          <option value="Salão">Salão</option>
          <option value="Bar">Bar</option>
          <option value="Caixa">Caixa</option>
          <option value="Geral">Geral</option>
        </select>
        
        <select [ngModel]="selectedType()" (ngModelChange)="selectedType.set($event)" class="rounded-md bg-gray-800 border-gray-700 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm">
          <option value="">Todos os Tipos</option>
          <option value="opening">Abertura</option>
          <option value="closing">Fechamento</option>
          <option value="custom">Outros</option>
        </select>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Checklist Tasks -->
        <div class="lg:col-span-2 space-y-6">
          <div class="bg-gray-800 shadow rounded-lg overflow-hidden border border-gray-700">
            <div class="px-4 py-5 sm:px-6 border-b border-gray-700 bg-gray-800 flex justify-between items-center">
              <h3 class="text-lg leading-6 font-medium text-white">Tarefas</h3>
              <button (click)="loadData()" class="text-gray-400 hover:text-blue-400" title="Atualizar">
                <span class="material-symbols-outlined">refresh</span>
              </button>
            </div>
            
            @if (isLoading()) {
              <div class="p-8 text-center text-gray-400">
                <span class="material-symbols-outlined animate-spin text-4xl mb-2">sync</span>
                <p>Carregando checklists...</p>
              </div>
            } @else if (filteredTemplates().length === 0) {
              <div class="p-8 text-center text-gray-400">
                <span class="material-symbols-outlined text-4xl mb-2 text-gray-500">checklist</span>
                <p>Nenhuma tarefa encontrada para os filtros selecionados.</p>
                @if (isManager()) {
                  <p class="text-sm mt-2">Clique em "Nova Tarefa" para começar.</p>
                }
              </div>
            } @else {
              <ul class="divide-y divide-gray-700">
                @for (template of filteredTemplates(); track template.id) {
                  <li class="p-4 hover:bg-gray-700/50 transition-colors">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                          <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-900 text-gray-300 border border-gray-700">
                            {{ template.section }}
                          </span>
                          <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border"
                                [ngClass]="{
                                  'bg-blue-900/50 text-blue-400 border-blue-800': template.checklist_type === 'opening',
                                  'bg-indigo-900/50 text-indigo-400 border-indigo-800': template.checklist_type === 'closing',
                                  'bg-gray-900/50 text-gray-400 border-gray-700': template.checklist_type === 'custom'
                                }">
                            {{ getTypeName(template.checklist_type) }}
                          </span>
                        </div>
                        <h4 class="text-md font-medium text-white">{{ template.task_description }}</h4>
                      </div>
                      
                      <div class="flex items-center gap-2">
                        <button (click)="logTask(template, 'completed')" 
                                [disabled]="isSubmitting()"
                                class="bg-green-900/50 hover:bg-green-800 text-green-400 border border-green-800 px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1 transition-colors disabled:opacity-50">
                          <span class="material-symbols-outlined text-sm">check_circle</span>
                          Concluído
                        </button>
                        <button (click)="logTask(template, 'issue')" 
                                [disabled]="isSubmitting()"
                                class="bg-red-900/50 hover:bg-red-800 text-red-400 border border-red-800 px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1 transition-colors disabled:opacity-50">
                          <span class="material-symbols-outlined text-sm">report_problem</span>
                          Problema
                        </button>
                      </div>
                    </div>
                  </li>
                }
              </ul>
            }
          </div>
        </div>

        <!-- Recent Logs -->
        <div class="lg:col-span-1">
          <div class="bg-gray-800 shadow rounded-lg overflow-hidden border border-gray-700">
            <div class="px-4 py-5 sm:px-6 border-b border-gray-700 bg-gray-800">
              <h3 class="text-lg leading-6 font-medium text-white">Últimas Execuções</h3>
            </div>
            <div class="p-0 max-h-[600px] overflow-y-auto">
              @if (recentLogs().length === 0) {
                <div class="p-6 text-center text-gray-400 text-sm">
                  Nenhum registro recente encontrado.
                </div>
              } @else {
                <ul class="divide-y divide-gray-700">
                  @for (log of recentLogs(); track log.id) {
                    <li class="p-4">
                      <div class="flex justify-between items-start">
                        <div>
                          <p class="text-sm font-medium text-white line-clamp-2">{{ log.checklist_templates?.task_description }}</p>
                          <p class="text-xs text-gray-400 mt-1">Por: {{ log.employees?.name || 'Desconhecido' }}</p>
                          <p class="text-xs text-gray-500">{{ log.completed_at | date:'dd/MM/yyyy HH:mm' }}</p>
                        </div>
                        <div class="ml-2 flex-shrink-0">
                          @if (log.status === 'completed') {
                            <span class="material-symbols-outlined text-green-400" title="Concluído">check_circle</span>
                          } @else if (log.status === 'issue') {
                            <span class="material-symbols-outlined text-red-400" title="Problema Reportado">report_problem</span>
                          } @else {
                            <span class="material-symbols-outlined text-yellow-400" title="Pendente">pending</span>
                          }
                        </div>
                      </div>
                    </li>
                  }
                </ul>
              }
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Template Modal -->
    @if (showAddTemplateModal()) {
      <div class="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4" (click)="showAddTemplateModal.set(false)">
        <div class="bg-gray-800 rounded-lg shadow-xl w-full max-w-md border border-gray-700 overflow-hidden" (click)="$event.stopPropagation()">
          <div class="p-4 border-b border-gray-700 flex justify-between items-center">
            <h3 class="text-xl font-bold text-white">Nova Tarefa de Checklist</h3>
            <button (click)="showAddTemplateModal.set(false)" class="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <form [formGroup]="templateForm" (ngSubmit)="saveTemplate()">
            <div class="p-6 space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-300 mb-1">Descrição da Tarefa</label>
                <input type="text" formControlName="task_description" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ex: Ligar as luzes e o ar condicionado">
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-300 mb-1">Seção</label>
                  <select formControlName="section" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="Cozinha">Cozinha</option>
                    <option value="Salão">Salão</option>
                    <option value="Bar">Bar</option>
                    <option value="Caixa">Caixa</option>
                    <option value="Geral">Geral</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-300 mb-1">Tipo</label>
                  <select formControlName="checklist_type" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="opening">Abertura</option>
                    <option value="closing">Fechamento</option>
                    <option value="custom">Outros</option>
                  </select>
                </div>
              </div>
            </div>
            <div class="bg-gray-900/50 p-4 border-t border-gray-700 flex justify-end gap-3">
              <button type="button" (click)="showAddTemplateModal.set(false)" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors">
                Cancelar
              </button>
              <button type="submit" [disabled]="templateForm.invalid || isSubmitting()" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:text-gray-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center">
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
