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
          <div class="w-12 h-12 bg-brand/10 rounded-2xl flex items-center justify-center border border-brand/20 shadow-inner">
            <span translate="no" class="notranslate material-symbols-outlined text-brand text-2xl">checklist</span>
          </div>
          <div>
            <h1 class="text-3xl font-black title-display tracking-tight text-title">Rotinas & Checklists</h1>
            <p class="text-muted text-sm font-medium">Controle de abertura, fechamento e limpeza</p>
          </div>
        </div>

        <div class="flex flex-wrap gap-3">
          <button (click)="showReportModal.set(true)" class="flex-1 md:flex-none chef-surface hover-surface-elevated text-title px-5 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 border border-subtle shadow-sm active:scale-95 transition-all">
            <span translate="no" class="notranslate material-symbols-outlined text-info">picture_as_pdf</span>
            Gerar Relatório
          </button>
          @if (isManager()) {
            <button (click)="showAddTemplateModal.set(true)" class="flex-1 md:flex-none btn-primary text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all border border-brand/50 uppercase tracking-wider">
              <span translate="no" class="notranslate material-symbols-outlined text-sm">add</span>
              Nova Rotina
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
                   <div class="bg-surface rounded-3xl overflow-hidden shadow-sm border border-subtle relative">
                       <!-- Top clipboard clip -->
                       <div class="absolute top-0 left-1/2 transform -translate-x-1/2 w-24 h-1.5 bg-strong rounded-b-lg opacity-50 hidden sm:block"></div>
                       
                       <div class="bg-surface-elevated/20 p-6 sm:p-8 border-b border-subtle">
                           <div class="flex justify-between items-end">
                               <div>
                                    <span class="inline-block px-3 py-1 bg-surface rounded-lg text-[10px] font-black uppercase tracking-widest text-muted border border-strong mb-3">
                                        Praça / Setor
                                    </span>
                                    <h3 class="text-2xl sm:text-3xl font-black text-title title-display tracking-tight">{{ group.section }}</h3>
                               </div>
                               <div class="text-right">
                                   <div class="text-3xl sm:text-4xl font-black text-brand data-mono tracking-tighter">{{ getSectionProgress(group.section) }}%</div>
                                   <div class="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-muted">Concluído hoje</div>
                               </div>
                           </div>
                           
                           <!-- Progress Bar -->
                           <div class="h-1.5 w-full bg-surface-elevated rounded-full mt-6 overflow-hidden">
                                <div class="h-full bg-brand transition-all duration-1000 ease-in-out" [style.width.%]="getSectionProgress(group.section)"></div>
                           </div>
                       </div>

                       <div class="divide-y divide-subtle bg-surface">
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
            <div class="flex items-center justify-between mb-6">
                <h3 class="text-xl font-bold text-title title-display tracking-tight flex items-center gap-2">
                    <span translate="no" class="notranslate material-symbols-outlined text-brand">history</span>
                    Diário de Bordo
                </h3>
                <select [ngModel]="sidebarPeriod()" (ngModelChange)="onSidebarPeriodChange($event)" class="bg-surface-elevated border border-strong rounded-lg px-2 py-1 text-xs font-bold focus:outline-none">
                    <option value="today">Hoje</option>
                    <option value="yesterday">Ontem</option>
                    <option value="last7">Últ. 7 dias</option>
                </select>
            </div>
            
            <div class="relative border-l-2 border-subtle ml-3 space-y-8 pb-8">
                @if (recentLogs().length === 0) {
                    <div class="pl-8 text-muted italic text-sm">Nenhum registro para este período.</div>
                }
                
                @for (log of recentLogs(); track log.id) {
                    <div class="relative pl-8 group">
                         <!-- Timeline dot -->
                         <div class="absolute -left-[9px] top-1 w-4 h-4 rounded-full border-4 border-app transition-colors"
                            [class.bg-success]="log.status === 'completed'"
                            [class.bg-danger]="log.status === 'issue'">
                         </div>
                         
                         <div class="p-4 chef-surface rounded-2xl border border-subtle shadow-sm group-hover:shadow-md transition-shadow">
                             <div class="text-[10px] font-black uppercase tracking-widest text-muted mb-2">{{ log.completed_at | date:'dd/MM HH:mm' }}</div>
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
                
                @if (recentLogs().length >= sidebarLimit()) {
                    <div class="pl-8 pt-4">
                        <button (click)="loadMoreLogs()" class="w-full chef-surface border border-subtle hover:bg-surface-elevated py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors active:scale-95 text-brand">
                            Carregar Mais
                        </button>
                    </div>
                }
            </div>
        </div>
      </div>      <!-- Add Template Modal -->
    @if (showAddTemplateModal()) {
      <div class="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300" (click)="showAddTemplateModal.set(false)">
        <div class="chef-surface w-full max-w-md overflow-hidden transform scale-100 transition-all shadow-2xl border-2 border-strong rounded-3xl" (click)="$event.stopPropagation()">
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
                <div class="relative group">
                    <span translate="no" class="notranslate absolute left-4 top-4 material-symbols-outlined text-muted group-focus-within:text-brand transition-colors">edit</span>
                    <textarea formControlName="task_description" rows="3" class="w-full bg-surface-elevated border-2 border-strong rounded-xl pl-12 pr-4 py-3 text-title font-bold focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 transition-all shadow-inner resize-none" placeholder="O que deve ser feito?"></textarea>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-6">
                <div>
                  <label class="block text-[11px] font-black uppercase tracking-widest text-muted mb-2">Seção</label>
                  <div class="relative group">
                    <span translate="no" class="notranslate absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-muted group-focus-within:text-brand transition-colors text-[18px]">category</span>
                    <select formControlName="section" class="w-full bg-surface-elevated border-2 border-strong rounded-xl pl-10 pr-3 py-3 text-title font-bold focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 transition-all shadow-inner appearance-none cursor-pointer">
                        <option value="Cozinha">Cozinha</option>
                        <option value="Salão">Salão</option>
                        <option value="Bar">Bar</option>
                        <option value="Caixa">Caixa</option>
                        <option value="Geral">Geral</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label class="block text-[11px] font-black uppercase tracking-widest text-muted mb-2">Tipo</label>
                  <div class="relative group">
                    <span translate="no" class="notranslate absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-muted group-focus-within:text-brand transition-colors text-[18px]">schedule</span>
                    <select formControlName="checklist_type" class="w-full bg-surface-elevated border-2 border-strong rounded-xl pl-10 pr-3 py-3 text-title font-bold focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 transition-all shadow-inner appearance-none cursor-pointer">
                        <option value="opening">Abertura</option>
                        <option value="closing">Fechamento</option>
                        <option value="custom">Outros</option>
                    </select>
                  </div>
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
        <div class="fixed inset-0 bg-black/60 backdrop-blur-md z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300" (click)="closeIssueModal()">
            <div class="max-w-md w-full chef-surface rounded-3xl overflow-hidden shadow-2xl relative border-2 border-danger/30" (click)="$event.stopPropagation()">
                <div class="p-6 bg-danger/5 border-b border-danger/20 flex justify-between items-start">
                    <div>
                        <h3 class="text-xl font-black title-display tracking-tight flex items-center gap-2 mb-1 text-danger">
                            <span translate="no" class="notranslate material-symbols-outlined">report</span> Reportar Problema
                        </h3>
                        <p class="text-xs font-bold text-danger/80 line-clamp-2 leading-tight">{{ templateToIssue()!.task_description }}</p>
                    </div>
                    <button (click)="closeIssueModal()" class="p-2 rounded-xl text-danger/70 hover:bg-danger/20 hover:text-danger active:scale-95 transition-all">
                        <span translate="no" class="notranslate material-symbols-outlined">close</span>
                    </button>
                </div>
                
                <div class="p-8 space-y-6">
                    <!-- Fake Camera Viewport -->
                     <button class="w-full aspect-[21/9] bg-surface-elevated border-2 border-dashed border-strong rounded-2xl flex flex-col items-center justify-center text-muted hover:text-danger hover:bg-danger/5 hover:border-danger/30 transition-all group active:scale-[0.98]">
                         <span translate="no" class="notranslate material-symbols-outlined text-4xl mb-2 group-hover:scale-110 transition-transform">photo_camera</span>
                         <span class="font-bold uppercase tracking-widest text-[11px]">Capturar Foto (Obrigatório)</span>
                     </button>
                     
                     <div>
                         <label class="block text-[11px] font-black uppercase tracking-widest text-muted mb-2">Descreva o ocorrido</label>
                         <textarea [ngModel]="issueNote()" (ngModelChange)="issueNote.set($event)" rows="3" class="w-full bg-surface-elevated border-2 border-strong rounded-xl px-4 py-3 text-title font-bold focus:outline-none focus:border-danger focus:ring-4 focus:ring-danger/10 transition-all resize-none shadow-inner" placeholder="O que quebrou? Faltou algo?"></textarea>
                     </div>
                </div>
                
                <div class="bg-surface-elevated/50 px-8 py-5 border-t border-subtle flex justify-end gap-3">
                    <button (click)="closeIssueModal()" class="px-6 py-2.5 bg-surface hover-surface-elevated text-title rounded-xl text-sm font-bold border border-strong transition-all active:scale-95 text-center shadow-sm">
                        Cancelar
                    </button>
                    <button (click)="submitIssue()" [disabled]="!issueNote().trim() || isSubmitting()" class="px-8 py-2.5 bg-danger hover:bg-danger-hover disabled:bg-surface-elevated disabled:text-muted disabled:border-subtle text-white rounded-xl text-sm font-black shadow-lg shadow-danger/20 transition-all active:scale-95 flex justify-center items-center gap-2 disabled:opacity-50 uppercase tracking-widest">
                        <span translate="no" class="notranslate material-symbols-outlined text-lg">check_circle</span>
                        Reportar
                    </button>
                </div>
            </div>
        </div>
    }

    <!-- Report Config Modal -->
    @if (showReportModal()) {
      <div class="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300" (click)="showReportModal.set(false)">
        <div class="chef-surface w-full max-w-md overflow-hidden transform scale-100 transition-all shadow-2xl border-2 border-strong rounded-3xl" (click)="$event.stopPropagation()">
          <div class="px-6 py-5 border-b border-subtle bg-surface-elevated/50 flex justify-between items-center">
            <h3 class="text-xl font-black text-title title-display tracking-tight flex items-center gap-2">
               <span translate="no" class="notranslate material-symbols-outlined text-brand">picture_as_pdf</span>
               Configurar Relatório
            </h3>
            <button (click)="showReportModal.set(false)" class="p-2 rounded-xl text-muted hover:bg-danger/10 hover:text-danger active:scale-95 transition-all">
              <span translate="no" class="notranslate material-symbols-outlined">close</span>
            </button>
          </div>
          <form [formGroup]="reportForm" (ngSubmit)="generatePDF()">
            <div class="p-8 space-y-6">
              <div>
                <label class="block text-[11px] font-black uppercase tracking-widest text-muted mb-2">Período</label>
                <select formControlName="period" class="w-full bg-surface-elevated border-2 border-strong rounded-xl px-4 py-3 text-title font-bold focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 transition-all">
                  <option value="today">Hoje</option>
                  <option value="yesterday">Ontem</option>
                  <option value="last7">Últimos 7 dias</option>
                  <option value="last30">Últimos 30 dias</option>
                  <option value="thisMonth">Mês Atual</option>
                  <option value="custom">Personalizado</option>
                </select>
              </div>

              @if (reportForm.get('period')?.value === 'custom') {
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-[11px] font-black uppercase tracking-widest text-muted mb-2">Data Inicial</label>
                    <input type="date" formControlName="startDate" class="w-full bg-surface-elevated border-2 border-strong rounded-xl px-4 py-3 text-title font-bold focus:outline-none focus:border-brand">
                  </div>
                  <div>
                    <label class="block text-[11px] font-black uppercase tracking-widest text-muted mb-2">Data Final</label>
                    <input type="date" formControlName="endDate" class="w-full bg-surface-elevated border-2 border-strong rounded-xl px-4 py-3 text-title font-bold focus:outline-none focus:border-brand">
                  </div>
                </div>
              }

              <div>
                <label class="block text-[11px] font-black uppercase tracking-widest text-muted mb-2">Setor</label>
                <select formControlName="section" class="w-full bg-surface-elevated border-2 border-strong rounded-xl px-4 py-3 text-title font-bold focus:outline-none focus:border-brand">
                  <option value="all">Todos os Setores</option>
                  <option value="Cozinha">Cozinha</option>
                  <option value="Salão">Salão</option>
                  <option value="Bar">Bar</option>
                  <option value="Caixa">Caixa</option>
                </select>
              </div>

              <div>
                <label class="block text-[11px] font-black uppercase tracking-widest text-muted mb-2">Status</label>
                <select formControlName="status" class="w-full bg-surface-elevated border-2 border-strong rounded-xl px-4 py-3 text-title font-bold focus:outline-none focus:border-brand">
                  <option value="all">Todos</option>
                  <option value="completed">Apenas Concluídos</option>
                  <option value="issue">Apenas Problemas / Não conformidades</option>
                </select>
              </div>
            </div>
            
            <div class="bg-surface-elevated/50 px-8 py-5 border-t border-subtle flex justify-end gap-3">
              <button type="button" (click)="showReportModal.set(false)" class="px-6 py-2.5 bg-surface hover-surface-elevated text-title rounded-xl text-sm font-bold border border-strong transition-all active:scale-95 shadow-sm">
                Cancelar
              </button>
              <button type="submit" [disabled]="isSubmitting()" class="px-8 py-2.5 bg-brand hover:bg-brand-hover text-white rounded-xl text-sm font-black shadow-lg shadow-brand/20 transition-all active:scale-95 border border-brand uppercase tracking-widest flex items-center gap-2">
                @if(isSubmitting()) {
                   <span translate="no" class="notranslate material-symbols-outlined text-sm animate-spin">refresh</span>
                } @else {
                   <span translate="no" class="notranslate material-symbols-outlined text-sm">download</span>
                }
                Baixar PDF
              </button>
            </div>
          </form>
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

  // Sidebar state
  sidebarPeriod = signal<'today' | 'yesterday' | 'last7'>('today');
  sidebarLimit = signal(15);

  // Report Modal state
  showReportModal = signal(false);
  reportForm = this.fb.group({
    period: ['today'],
    startDate: [''],
    endDate: [''],
    section: ['all'],
    status: ['all']
  });

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
      const templates = await this.operationalService.getChecklistTemplates();
      this.templates.set(templates);
      await this.loadSidebarLogs();
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadSidebarLogs() {
    const range = this.getDateRange(this.sidebarPeriod());
    const logs = await this.operationalService.getRecentChecklistLogs(
      this.sidebarLimit(), 
      range.start, 
      range.end
    );
    this.recentLogs.set(logs);
  }

  loadMoreLogs() {
    this.sidebarLimit.update(l => l + 15);
    this.loadSidebarLogs();
  }

  onSidebarPeriodChange(period: 'today' | 'yesterday' | 'last7') {
    this.sidebarPeriod.set(period);
    this.sidebarLimit.set(15);
    this.loadSidebarLogs();
  }

  getDateRange(period: string, startStr?: string, endStr?: string): {start?: string, end?: string} {
    const today = new Date();
    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    if (period === 'custom' && startStr && endStr) {
      return { start: startStr, end: endStr };
    }
    if (period === 'today') {
      return { start: formatDate(today), end: formatDate(today) };
    }
    if (period === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { start: formatDate(yesterday), end: formatDate(yesterday) };
    }
    if (period === 'last7') {
      const last7 = new Date(today);
      last7.setDate(last7.getDate() - 7);
      return { start: formatDate(last7), end: formatDate(today) };
    }
    if (period === 'last30') {
      const last30 = new Date(today);
      last30.setDate(last30.getDate() - 30);
      return { start: formatDate(last30), end: formatDate(today) };
    }
    if (period === 'thisMonth') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: formatDate(firstDay), end: formatDate(today) };
    }
    return {};
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
        await this.loadSidebarLogs();
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async generatePDF() {
    this.isSubmitting.set(true);
    try {
      const values = this.reportForm.value;
      const range = this.getDateRange(values.period || 'today', values.startDate || undefined, values.endDate || undefined);
      
      const logs = await this.operationalService.getRecentChecklistLogs(
        null, // fetch all for the report
        range.start,
        range.end,
        values.section || 'all',
        values.status as any || 'all'
      );

      const doc = new jsPDF();
      
      // Cabeçalho Gerencial
      doc.setFontSize(22);
      doc.setTextColor(33, 37, 41);
      doc.text('Relatório de Checklists', 14, 22);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      let periodText = 'Período: Hoje';
      if(values.period !== 'today') periodText = `Período: ${range.start || ''} a ${range.end || ''}`;
      doc.text(`Unidade: Restaurante Principal | ${periodText}`, 14, 30);
      doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 35);

      // Resumo Executivo
      const total = logs.length;
      const issues = logs.filter(l => l.status === 'issue').length;
      const completed = logs.filter(l => l.status === 'completed').length;
      
      doc.setFillColor(248, 249, 250);
      doc.roundedRect(14, 42, 182, 20, 3, 3, 'F');
      
      doc.setFontSize(11);
      doc.setTextColor(33, 37, 41);
      doc.text(`Total de Ações: ${total}`, 20, 50);
      doc.text(`Concluídas: ${completed}`, 80, 50);
      doc.setTextColor(220, 53, 69);
      doc.text(`Problemas: ${issues}`, 140, 50);

      const tableData = logs.map(log => {
        let statusStr = 'Pendente';
        if (log.status === 'completed') statusStr = 'Concluído';
        if (log.status === 'issue') statusStr = 'Problema';

        return [
          new Date(log.completed_at).toLocaleString(),
          log.checklist_templates?.task_description || 'Desconhecido',
          log.checklist_templates?.section || '-',
          statusStr,
          log.employees?.name || 'Desconhecido',
          log.notes || '-'
        ];
      });

      autoTable(doc, {
        startY: 70,
        head: [['Data/Hora', 'Tarefa', 'Seção', 'Status', 'Executado por', 'Observações']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 4 },
        columnStyles: {
          5: { cellWidth: 50 } // Observações
        },
        willDrawCell: (data) => {
           // Destacar linhas com problema
           if (data.row.section === 'body' && data.row.raw[3] === 'Problema') {
              doc.setFillColor(255, 235, 238); // light red
           }
        }
      });

      doc.save(`relatorio-checklists-${new Date().getTime()}.pdf`);
      this.showReportModal.set(false);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
