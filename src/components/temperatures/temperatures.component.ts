import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { OperationalService } from '../../services/operational.service';
import { OperationalAuthService } from '../../services/operational-auth.service';
import { NotificationService } from '../../services/notification.service';
import { Equipment, TemperatureLog } from '../../models/db.models';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-temperatures',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <!-- Page Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-subtle pb-6">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 bg-info/10 rounded-2xl flex items-center justify-center border border-info/20 shadow-inner">
            <span translate="no" class="notranslate material-symbols-outlined text-info text-2xl">thermostat</span>
          </div>
          <div>
            <h1 class="text-3xl font-black title-display tracking-tight text-title">Temperaturas</h1>
            <p class="text-muted text-sm font-medium">Controle e monitoramento de equipamentos</p>
          </div>
        </div>

        <div class="flex flex-wrap gap-3">
          <button (click)="generatePDF()" class="flex-1 md:flex-none chef-surface hover-surface-elevated text-title px-5 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 border border-subtle shadow-sm active:scale-95 transition-all">
            <span translate="no" class="notranslate material-symbols-outlined text-info">picture_as_pdf</span>
            Relatório
          </button>
          @if (isManager()) {
            <button (click)="showAddEquipmentModal.set(true)" class="flex-1 md:flex-none btn-primary text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all border border-brand/50 uppercase tracking-wider">
              <span translate="no" class="notranslate material-symbols-outlined text-sm">add</span>
              Novo Equipamento
            </button>
          }
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <!-- Equipment Grid -->
        <div class="xl:col-span-2 space-y-6">
          <div class="flex items-center justify-between mb-2">
             <h3 class="text-xl font-bold title-display tracking-tight text-title">Sensores Manuais</h3>
             <button (click)="loadData()" class="p-2 text-muted hover:text-brand transition-all flex items-center gap-2 chef-surface rounded-xl border border-subtle" title="Atualizar">
                <span translate="no" class="notranslate material-symbols-outlined text-sm" [class.animate-spin]="isLoading()">refresh</span>
                <span class="text-xs font-bold uppercase tracking-widest hidden sm:block">Atualizar</span>
             </button>
          </div>

          @if (isLoading() && equipmentList().length === 0) {
             <div class="flex justify-center p-20">
                <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand"></div>
             </div>
          } @else if (equipmentList().length === 0) {
              <div class="chef-surface p-16 text-center text-muted rounded-3xl border border-dashed border-strong">
                <span translate="no" class="notranslate material-symbols-outlined text-6xl mb-4 opacity-50">kitchen</span>
                <p class="text-xl font-bold title-display text-title">Nenhum equipamento cadastrado.</p>
                @if (isManager()) {
                  <button (click)="showAddEquipmentModal.set(true)" class="mt-4 text-brand font-black text-sm uppercase tracking-widest hover:underline">Adicionar equipamento</button>
                }
              </div>
          } @else {
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 gap-6">
                @for (eq of equipmentList(); track eq.id) {
                  <!-- Sensor Card -->
                  <div class="chef-surface rounded-3xl p-6 relative overflow-hidden shadow-sm border group transition-colors flex flex-col"
                       [class.border-subtle]="getEquipmentType(eq) === 'other'"
                       [class.border-info/30]="getEquipmentType(eq) === 'cold'"
                       [class.border-danger/30]="getEquipmentType(eq) === 'hot'"
                       [class.bg-info/5]="getEquipmentType(eq) === 'cold'"
                       [class.bg-danger/5]="getEquipmentType(eq) === 'hot'">
                     <!-- Background ambient glow based on last reading (simulated) -->
                     <div class="absolute inset-0 opacity-10 pointer-events-none transition-colors duration-1000" [ngClass]="getLastReadingStatusClass(eq.id)"></div>
                     
                     <div class="relative z-10 flex flex-col flex-1">
                         <div class="flex justify-between items-start mb-6">
                             <div class="flex items-center gap-3">
                                 <div class="w-12 h-12 rounded-xl flex items-center justify-center shadow-inner" 
                                      [class.bg-surface-elevated]="getEquipmentType(eq) === 'other'"
                                      [class.bg-info/20]="getEquipmentType(eq) === 'cold'"
                                      [class.text-info]="getEquipmentType(eq) === 'cold'"
                                      [class.bg-danger/20]="getEquipmentType(eq) === 'hot'"
                                      [class.text-danger]="getEquipmentType(eq) === 'hot'"
                                      [ngClass]="getLastReadingStatusClass(eq.id, true)">
                                    <span translate="no" class="notranslate material-symbols-outlined">
                                        {{ getEquipmentType(eq) === 'cold' ? 'ac_unit' : (getEquipmentType(eq) === 'hot' ? 'local_fire_department' : 'kitchen') }}
                                    </span>
                                 </div>
                                 <div class="flex-1 min-w-0">
                                     <h4 class="text-xl font-black title-display leading-tight truncate">{{ eq.name }}</h4>
                                     <p class="text-[10px] uppercase font-bold tracking-widest mt-0.5" [ngClass]="getLastReadingStatusColor(eq.id)">
                                         {{ getLastReadingStatusText(eq.id) }}
                                     </p>
                                 </div>
                             </div>
                             <!-- Last Reading Badge -->
                             <div class="text-right shrink-0 ml-2">
                                 <div class="text-3xl font-black data-mono tracking-tighter" [ngClass]="getLastReadingStatusColor(eq.id)">
                                     {{ getLastReadingTemp(eq.id) }}<span class="text-lg opacity-50">°</span>
                                 </div>
                                 <div class="text-[9px] uppercase font-bold tracking-widest text-muted">{{ getLastReadingTime(eq.id) }}</div>
                             </div>
                         </div>

                         <!-- Target Range Bar & Sparkline -->
                         <div class="mb-6 flex-1">
                             <div class="flex justify-between items-end mb-1 px-1">
                                 <div class="flex flex-col">
                                     <span class="text-[9px] uppercase tracking-widest text-muted">Range Seguro</span>
                                     <span class="text-[10px] font-bold text-title">{{ eq.min_temp !== null ? eq.min_temp + '°' : 'N/A' }} ~ {{ eq.max_temp !== null ? eq.max_temp + '°' : 'N/A' }}</span>
                                 </div>
                                 <div class="w-16 h-6">
                                     @if(getSparklinePath(eq.id)) {
                                         <svg viewBox="-2 -2 104 24" class="w-full h-full overflow-visible">
                                             <path [attr.d]="getSparklinePath(eq.id)" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-brand opacity-50"></path>
                                         </svg>
                                     }
                                 </div>
                             </div>
                             <div class="h-1.5 w-full bg-surface-elevated rounded-full overflow-hidden border border-strong inset-shadow-sm flex mt-1">
                                 <!-- Decorative segments based on equipment type -->
                                 @if(getEquipmentType(eq) === 'cold') {
                                     <div class="h-full bg-info flex-1"></div>
                                     <div class="h-full bg-success flex-1" style="flex: 2"></div>
                                     <div class="h-full bg-warning flex-1"></div>
                                 } @else if(getEquipmentType(eq) === 'hot') {
                                     <div class="h-full bg-warning flex-1"></div>
                                     <div class="h-full bg-success flex-1" style="flex: 2"></div>
                                     <div class="h-full bg-danger flex-1"></div>
                                 } @else {
                                     <div class="h-full bg-info flex-1"></div>
                                     <div class="h-full bg-success flex-1"></div>
                                     <div class="h-full bg-danger flex-1"></div>
                                 }
                             </div>
                         </div>
                         
                         <!-- Action Button (now in flow, no overlap) -->
                         <div class="mt-auto pt-4 border-t border-subtle">
                             <div class="flex items-center gap-2">
                                <button (click)="openNumpad(eq)" class="w-full flex justify-between items-center px-4 py-3 rounded-xl chef-surface hover:bg-surface-elevated border border-strong transition-all active:scale-95 text-title font-bold focus:outline-none">
                                    <span class="text-xs uppercase tracking-widest text-muted">Aferir...</span>
                                    <span translate="no" class="notranslate material-symbols-outlined text-brand text-xl">dialpad</span>
                                </button>
                             </div>
                         </div>
                     </div>
                  </div>
                }
              </div>
          }
        </div>

        <!-- Recent Logs -->
        <div class="xl:col-span-1 border-l border-subtle pl-0 xl:pl-8">
            <h3 class="text-xl font-bold text-title title-display tracking-tight mb-6 flex items-center gap-2">
                <span translate="no" class="notranslate material-symbols-outlined text-brand">history</span>
                Diário Técnico
            </h3>
            
            <div class="relative border-l-2 border-subtle ml-3 space-y-6 pb-8">
                @if (recentLogs().length === 0) {
                    <div class="pl-8 text-muted italic text-sm">Nenhum registro.</div>
                }
                
                @for (log of recentLogs(); track log.id) {
                    <div class="relative pl-8 group">
                         <!-- Timeline dot -->
                         <div class="absolute -left-[9px] top-1 w-4 h-4 rounded-full border-4 border-app transition-colors"
                              [ngClass]="getTemperatureDotClass(log.temperature, log.equipment?.min_temp, log.equipment?.max_temp)">
                         </div>
                         
                         <div class="p-4 chef-surface rounded-2xl border border-subtle shadow-sm">
                             <div class="flex justify-between items-start mb-2">
                                 <div>
                                    <div class="text-[10px] font-black uppercase tracking-widest text-muted">{{ log.recorded_at | date:'HH:mm' }}</div>
                                    <p class="text-sm font-bold text-title leading-snug">{{ log.equipment?.name }}</p>
                                 </div>
                                 <div class="text-lg font-black data-mono" [ngClass]="getTemperatureStatusColor(log.temperature, log.equipment?.min_temp, log.equipment?.max_temp)">
                                     {{ log.temperature }}<span class="text-xs">°</span>
                                 </div>
                             </div>
                             
                             <div class="pt-2 border-t border-subtle flex items-center gap-2 text-muted text-xs font-medium">
                                 <div class="w-5 h-5 rounded-full bg-surface-elevated flex items-center justify-center border border-strong shrink-0">
                                     <span translate="no" class="notranslate material-symbols-outlined text-[10px]">person</span>
                                 </div>
                                 <span class="truncate">{{ log.employees?.name || 'Chef' }}</span>
                             </div>
                             
                             @if(log.notes) {
                                  <div class="mt-3 p-3 bg-surface-elevated border border-strong rounded-xl text-xs font-medium">
                                      <div class="text-[10px] uppercase font-black tracking-widest text-muted mb-1 flex items-center gap-1">
                                          <span translate="no" class="notranslate material-symbols-outlined text-[12px] text-brand">gavel</span>
                                          Ação Corretiva
                                      </div>
                                      {{ log.notes }}
                                  </div>
                             }
                         </div>
                    </div>
                }
            </div>
        </div>
      </div>
    </div>

    <!-- Add Equipment Modal -->
    @if (showAddEquipmentModal()) {
      <div class="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300" (click)="showAddEquipmentModal.set(false)">
        <div class="chef-surface w-full max-w-md overflow-hidden transform scale-100 transition-all shadow-2xl border-2 border-strong" (click)="$event.stopPropagation()">
          <div class="px-6 py-5 border-b border-subtle bg-surface-elevated/50 flex justify-between items-center">
            <h3 class="text-xl font-black text-title title-display tracking-tight flex items-center gap-2">
               <span translate="no" class="notranslate material-symbols-outlined text-brand">add_circle</span>
               Novo Equipamento
            </h3>
            <button (click)="showAddEquipmentModal.set(false)" class="p-2 rounded-xl text-muted hover:bg-danger/10 hover:text-danger active:scale-95 transition-all">
              <span translate="no" class="notranslate material-symbols-outlined">close</span>
            </button>
          </div>
          <form [formGroup]="equipmentForm" (ngSubmit)="saveEquipment()">
            <div class="p-8 space-y-6">
              <div>
                <label class="block text-[11px] font-black uppercase tracking-widest text-muted mb-2">Nome do Equipamento</label>
                <div class="relative group">
                   <span translate="no" class="notranslate absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-muted group-focus-within:text-brand transition-colors">kitchen</span>
                   <input type="text" formControlName="name" class="w-full bg-surface-elevated border-2 border-strong rounded-xl pl-12 pr-4 py-3 text-title font-bold focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 transition-all shadow-inner" placeholder="Ex: Freezer de Carnes">
                </div>
              </div>
              <div class="grid grid-cols-2 gap-6">
                <div>
                  <label class="block text-[11px] font-black uppercase tracking-widest text-muted mb-2">Mínima (°C)</label>
                  <input type="number" step="0.1" formControlName="min_temp" class="w-full bg-surface-elevated border-2 border-strong rounded-xl px-4 py-3 text-title font-black data-mono focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 transition-all shadow-inner">
                </div>
                <div>
                  <label class="block text-[11px] font-black uppercase tracking-widest text-muted mb-2">Máxima (°C)</label>
                  <input type="number" step="0.1" formControlName="max_temp" class="w-full bg-surface-elevated border-2 border-strong rounded-xl px-4 py-3 text-title font-black data-mono focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 transition-all shadow-inner">
                </div>
              </div>
            </div>
            <div class="bg-surface-elevated/50 px-8 py-5 border-t border-subtle flex justify-end gap-3">
              <button type="button" (click)="showAddEquipmentModal.set(false)" class="px-6 py-2.5 bg-surface hover-surface-elevated text-title rounded-xl text-sm font-bold border border-strong transition-all active:scale-95 shadow-sm">
                Cancelar
              </button>
              <button type="submit" [disabled]="equipmentForm.invalid || isSubmitting()" class="px-8 py-2.5 bg-brand hover:bg-brand-hover disabled:bg-surface-elevated disabled:text-muted disabled:border-subtle text-white rounded-xl text-sm font-black shadow-lg shadow-brand/20 transition-all active:scale-95 border border-brand uppercase tracking-widest">
                Salvar
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Custom Numpad Modal -->
    @if(activeNumpadEq()) {
       <div class="fixed inset-0 bg-black/80 backdrop-blur-md z-[150] flex flex-col pt-10 px-4 pb-4 animate-in fade-in duration-200" (click)="closeNumpad()">
          <!-- Top area: Equip name & Current temp input -->
          <div class="flex-1 flex flex-col items-center justify-center max-w-md mx-auto w-full mb-8 relative z-10" (click)="$event.stopPropagation()">
              <h2 class="text-2xl title-display font-black text-white/90 mb-6 flex items-center gap-2">
                 <span translate="no" class="notranslate material-symbols-outlined text-brand text-3xl">kitchen</span>
                 {{ activeNumpadEq()?.name }}
              </h2>
              
              <!-- Large Display -->
              <div class="w-full bg-surface/10 border-2 border-surface/30 backdrop-blur-xl rounded-3xl p-8 flex flex-col items-center justify-center transition-all duration-300 shadow-[0_0_50px_rgba(0,0,0,0.5)]"
                   [ngClass]="getNumpadDisplayClass()">
                 <div class="text-7xl font-black data-mono tracking-tighter" [ngClass]="getNumpadDisplayColor()">
                     {{ numpadValue() || '0' }}<span class="text-4xl opacity-50">°C</span>
                 </div>
                 <div class="mt-4 text-sm font-bold uppercase tracking-widest px-4 py-2 rounded-xl backdrop-blur-md" 
                      [ngClass]="getNumpadMsgClass()">
                     {{ getNumpadStatusMessage() }}
                 </div>
              </div>
              
              <!-- Action Required Dropdown (if Danger Zone) -->
              @if(isDangerZone()) {
                 <div class="w-full mt-6 bg-surface/90 border-2 border-danger/50 rounded-3xl p-5 shadow-lg shadow-danger/20 animate-in slide-in-from-top-4 duration-300">
                     <p class="text-danger font-black uppercase tracking-widest text-xs mb-4 flex items-center gap-2">
                        <span translate="no" class="notranslate material-symbols-outlined">warning</span> Ação Corretiva Exigida
                     </p>
                     
                     <div class="flex flex-col gap-2">
                         @for(action of correctiveActions; track action.id) {
                            <button (click)="selectedCorrectiveAction.set(action.id)" class="px-4 py-3 rounded-xl border-2 flex items-center gap-3 transition-colors text-left"
                               [class.bg-danger]="selectedCorrectiveAction() === action.id" [class.border-danger]="selectedCorrectiveAction() === action.id" [class.text-white]="selectedCorrectiveAction() === action.id"
                               [class.bg-surface-elevated]="selectedCorrectiveAction() !== action.id" [class.border-strong]="selectedCorrectiveAction() !== action.id" [class.text-title]="selectedCorrectiveAction() !== action.id">
                               <span translate="no" class="notranslate material-symbols-outlined">{{ action.icon }}</span>
                               <span class="font-bold text-sm">{{ action.label }}</span>
                            </button>
                         }
                     </div>
                     
                     @if(selectedCorrectiveAction() === 'other') {
                         <input type="text" [ngModel]="customCorrectionNote()" (ngModelChange)="customCorrectionNote.set($event)" placeholder="Descreva a ação tomada..." class="mt-3 w-full bg-surface border-2 border-strong rounded-xl px-4 py-3 text-title focus:outline-none focus:border-danger font-medium">
                     }
                 </div>
              }
          </div>
          
          <!-- Bottom area: Numpad Grid -->
          <div class="w-full max-w-md mx-auto relative z-10 shrink-0" (click)="$event.stopPropagation()">
              <!-- Option to Add Quick Actions here -->
              @if(getEquipmentType(activeNumpadEq()!) === 'cold') {
                 <div class="w-full flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-none">
                     <button (click)="setQuickTemp('-18')" class="shrink-0 px-4 py-2 rounded-xl bg-info/10 text-info font-bold text-sm border border-info/20 shadow-sm active:scale-95 transition-all">-18°C</button>
                     <button (click)="setQuickTemp('-12')" class="shrink-0 px-4 py-2 rounded-xl bg-info/10 text-info font-bold text-sm border border-info/20 shadow-sm active:scale-95 transition-all">-12°C</button>
                     <button (click)="setQuickTemp('0')" class="shrink-0 px-4 py-2 rounded-xl bg-info/10 text-info font-bold text-sm border border-info/20 shadow-sm active:scale-95 transition-all">0°C</button>
                     <button (click)="setQuickTemp('2')" class="shrink-0 px-4 py-2 rounded-xl bg-info/10 text-info font-bold text-sm border border-info/20 shadow-sm active:scale-95 transition-all">2°C</button>
                     <button (click)="setQuickTemp('4')" class="shrink-0 px-4 py-2 rounded-xl bg-info/10 text-info font-bold text-sm border border-info/20 shadow-sm active:scale-95 transition-all">4°C</button>
                     <button (click)="setQuickTemp('8')" class="shrink-0 px-4 py-2 rounded-xl bg-info/10 text-info font-bold text-sm border border-info/20 shadow-sm active:scale-95 transition-all">8°C</button>
                 </div>
              } @else if(getEquipmentType(activeNumpadEq()!) === 'hot') {
                 <div class="w-full flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-none">
                     <button (click)="setQuickTemp('60')" class="shrink-0 px-4 py-2 rounded-xl bg-warning/10 text-warning font-bold text-sm border border-warning/20 shadow-sm active:scale-95 transition-all">60°C</button>
                     <button (click)="setQuickTemp('65')" class="shrink-0 px-4 py-2 rounded-xl bg-danger/10 text-danger font-bold text-sm border border-danger/20 shadow-sm active:scale-95 transition-all">65°C</button>
                     <button (click)="setQuickTemp('70')" class="shrink-0 px-4 py-2 rounded-xl bg-danger/10 text-danger font-bold text-sm border border-danger/20 shadow-sm active:scale-95 transition-all">70°C</button>
                     <button (click)="setQuickTemp('74')" class="shrink-0 px-4 py-2 rounded-xl bg-danger/10 text-danger font-bold text-sm border border-danger/20 shadow-sm active:scale-95 transition-all">74°C</button>
                     <button (click)="setQuickTemp('80')" class="shrink-0 px-4 py-2 rounded-xl bg-danger/10 text-danger font-bold text-sm border border-danger/20 shadow-sm active:scale-95 transition-all">80°C</button>
                     <button (click)="setQuickTemp('90')" class="shrink-0 px-4 py-2 rounded-xl bg-danger/10 text-danger font-bold text-sm border border-danger/20 shadow-sm active:scale-95 transition-all">90°C</button>
                 </div>
              }
              
              <!-- Bottom area: Numpad Grid -->
              <div class="grid grid-cols-3 gap-3 mb-4">
                  @for(n of ['1','2','3','4','5','6','7','8','9','-','0','.']; track n) {
                      <button (click)="numpadPress(n)" class="bg-surface hover:bg-surface-elevated active:bg-surface-elevated text-title aspect-[5/4] rounded-2xl flex items-center justify-center text-3xl font-black data-mono shadow-sm border border-strong active:scale-90 transition-all font-sans">
                         {{ n === '-' ? '+/-' : n }}
                      </button>
                  }
              </div>
              <div class="grid grid-cols-2 gap-3 mb-6">
                 <button (click)="numpadBackspace()" class="chef-surface bg-danger/20 hover:bg-danger/30 text-danger border border-danger/30 py-4 rounded-2xl flex flex-col items-center justify-center font-bold text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all">
                     <span translate="no" class="notranslate material-symbols-outlined text-2xl mb-1">backspace</span>
                     Corrigir
                 </button>
                 <button (click)="submitNumpad()" [disabled]="!canSubmitNumpad()" class="btn-primary hover:bg-brand-hover text-white py-4 rounded-2xl flex flex-col items-center justify-center font-bold text-xs uppercase tracking-widest shadow-xl shadow-brand/20 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale">
                     @if (isSubmitting()) {
                        <span translate="no" class="notranslate material-symbols-outlined text-2xl mb-1 animate-spin">refresh</span>
                        Salvando...
                     } @else {
                        <span translate="no" class="notranslate material-symbols-outlined text-2xl mb-1">check_circle</span>
                        Salvar
                     }
                 </button>
              </div>

              <!-- Photo Upload -->
              <div class="w-full flex justify-center mb-6">
                  @if(logImageUrlPreview()) {
                      <div class="relative inline-block">
                          <img [src]="logImageUrlPreview()" class="w-24 h-24 object-cover rounded-2xl border-2 border-brand shadow-md" />
                          <button (click)="removeImage()" class="absolute -top-2 -right-2 bg-danger text-white rounded-full p-1 shadow-md hover:scale-110 active:scale-95 transition-transform">
                              <span translate="no" class="notranslate material-symbols-outlined text-sm">close</span>
                          </button>
                      </div>
                  } @else {
                      <label class="w-full max-w-[200px] flex items-center justify-center gap-2 chef-surface border border-dashed border-brand/50 text-brand py-3 rounded-2xl cursor-pointer hover:bg-brand/10 active:scale-95 transition-all">
                         <span translate="no" class="notranslate material-symbols-outlined text-xl">photo_camera</span>
                         <span class="font-bold text-xs uppercase tracking-widest">Anexar Foto</span>
                         <input type="file" accept="image/*" capture="environment" class="hidden" (change)="onFileSelected($event)" />
                      </label>
                  }
              </div>
          </div>
       </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TemperaturesComponent implements OnInit {
  private operationalService = inject(OperationalService);
  private authService = inject(OperationalAuthService);
  private notificationService = inject(NotificationService);
  private fb = inject(FormBuilder);

  equipmentList = signal<Equipment[]>([]);
  recentLogs = signal<TemperatureLog[]>([]);
  isLoading = signal(true);
  isSubmitting = signal(false);
  showAddEquipmentModal = signal(false);

  // Custom Numpad & Action State
  activeNumpadEq = signal<Equipment | null>(null);
  numpadValue = signal<string>('');
  logImageFile = signal<File | null>(null);
  logImageUrlPreview = signal<string | null>(null);
  
  // Available corrective actions
  correctiveActions = [
    { id: 'reheat', icon: 'local_fire_department', label: 'Reaquecer peça > 74°C' },
    { id: 'cool', icon: 'ac_unit', label: 'Resfriar rapidamente (Gelo)' },
    { id: 'discard', icon: 'delete', label: 'Descartar produto' },
    { id: 'maintenance', icon: 'build', label: 'Chamar Manutenção' },
    { id: 'other', icon: 'edit_note', label: 'Outro (Anotar abaixo)' }
  ];
  selectedCorrectiveAction = signal<string | null>(null);
  customCorrectionNote = signal<string>('');

  equipmentForm = this.fb.group({
    name: ['', Validators.required],
    min_temp: [null as number | null],
    max_temp: [null as number | null]
  });

  ngOnInit() {
    this.loadData();
  }

  async loadData() {
    this.isLoading.set(true);
    try {
      const [equipment, logs] = await Promise.all([
        this.operationalService.getEquipment(),
        this.operationalService.getRecentTemperatureLogs()
      ]);
      this.equipmentList.set(equipment);
      this.recentLogs.set(logs);
    } finally {
      this.isLoading.set(false);
    }
  }

  isManager(): boolean {
    const employee = this.authService.activeEmployee();
    return employee?.role === 'Gerente' || employee?.role === 'Admin';
  }

  async saveEquipment() {
    if (this.equipmentForm.invalid) return;
    
    this.isSubmitting.set(true);
    try {
      const values = this.equipmentForm.value;
      const newEq = await this.operationalService.addEquipment({
        name: values.name!,
        min_temp: values.min_temp,
        max_temp: values.max_temp,
        is_active: true
      });
      
      if (newEq) {
        this.equipmentList.update(list => [...list, newEq].sort((a, b) => a.name.localeCompare(b.name)));
        this.showAddEquipmentModal.set(false);
        this.equipmentForm.reset();
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async logTemperature(equipment: Equipment, tempValue: string, notes: string | null = null, image_url: string | null = null) {
    const temp = parseFloat(tempValue);
    if (isNaN(temp)) return;

    const employee = this.authService.activeEmployee();
    if (!employee) {
      this.notificationService.show('Você precisa estar logado como um funcionário para registrar a temperatura.', 'error');
      return;
    }

    this.isSubmitting.set(true);
    try {
      const log = await this.operationalService.logTemperature({
        equipment_id: equipment.id,
        employee_id: employee.id,
        temperature: temp,
        notes: notes,
        image_url: image_url
      });

      if (log) {
        // Refresh logs
        const logs = await this.operationalService.getRecentTemperatureLogs();
        this.recentLogs.set(logs);
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  // Numpad Logic
  openNumpad(eq: Equipment) {
      this.activeNumpadEq.set(eq);
      this.numpadValue.set('');
      this.selectedCorrectiveAction.set(null);
      this.customCorrectionNote.set('');
      this.logImageFile.set(null);
      this.logImageUrlPreview.set(null);
  }
  
  closeNumpad() {
      if(this.isSubmitting()) return;
      this.activeNumpadEq.set(null);
  }
  
  onFileSelected(event: any) {
      const file = event.target.files[0];
      if (file) {
          this.logImageFile.set(file);
          const reader = new FileReader();
          reader.onload = (e) => this.logImageUrlPreview.set(e.target?.result as string);
          reader.readAsDataURL(file);
      }
  }

  removeImage() {
      this.logImageFile.set(null);
      this.logImageUrlPreview.set(null);
  }
  
  numpadPress(key: string) {
      let current = this.numpadValue();
      
      if (key === '-') {
          if (current.startsWith('-')) {
             this.numpadValue.set(current.slice(1));
          } else {
             this.numpadValue.set('-' + current);
          }
          return;
      }
      
      if (key === '.' && current.includes('.')) return;
      if (current.replace('-', '').length >= 5) return;
      this.numpadValue.set(current + key);
  }
  
  numpadBackspace() {
      const current = this.numpadValue();
      this.numpadValue.set(current.slice(0, -1));
  }
  
  setQuickTemp(val: string) {
      this.numpadValue.set(val);
  }
  
  getEquipmentType(eq: Equipment): 'cold' | 'hot' | 'other' {
      if (eq.max_temp !== null && eq.max_temp <= 15) return 'cold';
      if (eq.min_temp !== null && eq.min_temp >= 40) return 'hot';
      return 'other';
  }
  
  isDangerZone(): boolean {
      const eq = this.activeNumpadEq();
      const val = parseFloat(this.numpadValue());
      if(!eq || isNaN(val)) return false;
      return (eq.min_temp !== null && val < eq.min_temp) || (eq.max_temp !== null && val > eq.max_temp);
  }
  
  canSubmitNumpad(): boolean {
      if(this.isSubmitting()) return false;
      const eq = this.activeNumpadEq();
      const strVal = this.numpadValue();
      if(!eq || strVal === '' || strVal === '-') return false;
      
      const val = parseFloat(strVal);
      if(isNaN(val)) return false;
      
      if(this.isDangerZone()) {
          const action = this.selectedCorrectiveAction();
          if(!action) return false;
          if(action === 'other' && this.customCorrectionNote().trim() === '') return false;
      }
      
      return true;
  }
  
  async submitNumpad() {
      if(!this.canSubmitNumpad()) return;
      const eq = this.activeNumpadEq();
      if(!eq) return;
      
      this.isSubmitting.set(true);
      let noteToSave: string | null = null;
      if (this.isDangerZone()) {
          const actionId = this.selectedCorrectiveAction();
          if(actionId === 'other') {
              noteToSave = this.customCorrectionNote();
          } else {
              const matched = this.correctiveActions.find(a => a.id === actionId);
              if(matched) noteToSave = matched.label;
          }
      }
      
      let imageUrl: string | null = null;
      if (this.logImageFile()) {
          imageUrl = await this.operationalService.uploadOperationalImage(this.logImageFile()!, 'temperatures');
      }
      
      await this.logTemperature(eq, this.numpadValue(), noteToSave, imageUrl);
      this.closeNumpad();
      this.isSubmitting.set(false);
  }

  getNumpadStatusMessage(): string {
      const eq = this.activeNumpadEq();
      const val = parseFloat(this.numpadValue());
      if(!eq || isNaN(val)) return 'Aguardando medicação...';
      
      if(eq.min_temp !== null && val < eq.min_temp) return 'TEMPERATURA MUITO BAIXA';
      if(eq.max_temp !== null && val > eq.max_temp) return 'TEMPERATURA ALERTA (ALTA)';
      return 'DENTRO DO PADRÃO';
  }
  
  getNumpadMsgClass(): string {
      const eq = this.activeNumpadEq();
      const val = parseFloat(this.numpadValue());
      if(!eq || isNaN(val)) return 'bg-surface border border-strong text-muted';
      
      if(eq.min_temp !== null && val < eq.min_temp) return 'bg-info border border-info-hover text-white';
      if(eq.max_temp !== null && val > eq.max_temp) return 'bg-danger border border-danger-hover text-white animate-pulse';
      return 'bg-success border border-success-hover text-white';
  }

  getNumpadDisplayClass(): string {
     const val = parseFloat(this.numpadValue());
     const isDanger = this.isDangerZone();
     if(isNaN(val)) return 'bg-surface-elevated';
     return isDanger ? 'bg-danger/10 border-danger/50 shadow-[0_0_100px_rgba(255,0,0,0.2)]' : 'bg-success/10 border-success/50';
  }
  
  getNumpadDisplayColor(): string {
     const val = parseFloat(this.numpadValue());
     const isDanger = this.isDangerZone();
     if(isNaN(val)) return 'text-muted';
     return isDanger ? 'text-danger' : 'text-success';
  }

  // Helpers for Status Cards
  getRecentReadings(equipmentId: string): number[] {
      return this.recentLogs()
          .filter(l => l.equipment_id === equipmentId)
          .slice(0, 5) // Last 5 logs
          .map(l => l.temperature)
          .reverse(); // Chronological for graph
  }

  getSparklinePath(equipmentId: string): string {
      const readings = this.getRecentReadings(equipmentId);
      if (readings.length < 2) return '';
      
      const width = 100;
      const height = 20;
      
      const minTemp = Math.min(...readings);
      const maxTemp = Math.max(...readings);
      const range = maxTemp - minTemp || 1; // avoid div by 0
      
      const stepX = width / (readings.length - 1);
      
      const points = readings.map((temp, index) => {
          const x = index * stepX;
          // Invert y, higher temp = lower y value (top of svg)
          const y = height - ((temp - minTemp) / range) * height;
          return `${x},${y}`;
      });
      
      return `M ${points.join(' L ')}`;
  }

  getLastReading(equipmentId: string): TemperatureLog | null {
     const logs = this.recentLogs();
     return logs.find(l => l.equipment_id === equipmentId) || null;
  }

  getLastReadingTemp(equipmentId: string): string {
     const log = this.getLastReading(equipmentId);
     return log ? log.temperature.toString() : '--';
  }

  getLastReadingTime(equipmentId: string): string {
     const log = this.getLastReading(equipmentId);
     if (!log) return 'Nenhum registro';
     const date = new Date(log.recorded_at);
     return date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  }

  getLastReadingStatus(equipmentId: string): 'ok' | 'cold' | 'hot' | 'none' {
     const log = this.getLastReading(equipmentId);
     if (!log) return 'none';
     const eq = this.equipmentList().find(e => e.id === equipmentId);
     if (!eq) return 'none';

     if (eq.min_temp !== null && log.temperature < eq.min_temp) return 'cold';
     if (eq.max_temp !== null && log.temperature > eq.max_temp) return 'hot';
     return 'ok';
  }

  getLastReadingStatusText(equipmentId: string): string {
      const status = this.getLastReadingStatus(equipmentId);
      switch(status) {
          case 'ok': return 'Normal';
          case 'cold': return 'Abaixo do Ideal';
          case 'hot': return 'Alerta: Muito Quente';
          default: return 'Aguardando medicação';
      }
  }

  getLastReadingStatusColor(equipmentId: string): string {
      const status = this.getLastReadingStatus(equipmentId);
      switch(status) {
          case 'ok': return 'text-success';
          case 'cold': return 'text-info';
          case 'hot': return 'text-danger';
          default: return 'text-muted';
      }
  }

  getLastReadingStatusClass(equipmentId: string, isIcon = false): string {
      const status = this.getLastReadingStatus(equipmentId);
      switch(status) {
          case 'ok': return isIcon ? 'bg-success/10 text-success border border-success/20' : 'bg-success';
          case 'cold': return isIcon ? 'bg-info/10 text-info border border-info/20' : 'bg-info';
          case 'hot': return isIcon ? 'bg-danger/10 text-danger border border-danger/20 animate-pulse' : 'bg-danger';
          default: return isIcon ? 'bg-surface-elevated text-muted border border-strong' : 'bg-surface-elevated';
      }
  }
  
  getTemperatureDotClass(temp: number, min: number | null | undefined, max: number | null | undefined): string {
    if (min !== null && min !== undefined && temp < min) return 'bg-info';
    if (max !== null && max !== undefined && temp > max) return 'bg-danger';
    return 'bg-success';
  }
  
  getTemperatureStatusColor(temp: number, min: number | null | undefined, max: number | null | undefined): string {
    if (min !== null && min !== undefined && temp < min) return 'text-info';
    if (max !== null && max !== undefined && temp > max) return 'text-danger';
    return 'text-success';
  }

  generatePDF() {
    const doc = new jsPDF();
    const logs = this.recentLogs();
    
    doc.setFontSize(18);
    doc.text('Relatório de Temperaturas', 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 30);

    const tableData = logs.map(log => {
      let status = 'OK';
      if (log.equipment?.min_temp !== null && log.equipment?.min_temp !== undefined && log.temperature < log.equipment.min_temp) {
        status = 'Abaixo do ideal';
      } else if (log.equipment?.max_temp !== null && log.equipment?.max_temp !== undefined && log.temperature > log.equipment.max_temp) {
        status = 'Acima do ideal';
      }

      return [
        log.equipment?.name || 'Desconhecido',
        `${log.temperature} °C`,
        status,
        log.employees?.name || 'Desconhecido',
        new Date(log.recorded_at).toLocaleString()
      ];
    });

    autoTable(doc, {
      startY: 36,
      head: [['Equipamento', 'Temperatura', 'Status', 'Registrado por', 'Data/Hora']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
    });

    doc.save(`relatorio-temperaturas-${new Date().getTime()}.pdf`);
  }
}
