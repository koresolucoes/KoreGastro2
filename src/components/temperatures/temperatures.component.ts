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
            <span class="material-symbols-outlined text-info text-2xl">thermostat</span>
          </div>
          <div>
            <h1 class="text-3xl font-black title-display tracking-tight text-title">Temperaturas</h1>
            <p class="text-muted text-sm font-medium">Controle e monitoramento de equipamentos</p>
          </div>
        </div>

        <div class="flex flex-wrap gap-3">
          <button (click)="generatePDF()" class="flex-1 md:flex-none bg-surface-elevated hover-surface-elevated text-title px-5 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 border border-strong shadow-sm hover:translate-y-[-2px] active:scale-95 transition-all">
            <span class="material-symbols-outlined text-info">picture_as_pdf</span>
            Gerar Relatório
          </button>
          @if (isManager()) {
            <button (click)="showAddEquipmentModal.set(true)" class="flex-1 md:flex-none bg-brand hover:bg-brand-hover text-white px-5 py-2.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-brand/20 hover:translate-y-[-2px] active:scale-95 transition-all border border-brand/50 uppercase tracking-wider">
              <span class="material-symbols-outlined text-sm">add</span>
              Novo Equipamento
            </button>
          }
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- Equipment List & Logging -->
        <div class="lg:col-span-2 space-y-6">
          <div class="chef-surface overflow-hidden">
            <div class="px-6 py-5 border-b border-subtle bg-surface-elevated/30 flex justify-between items-center">
              <h3 class="text-lg font-black text-title uppercase tracking-widest flex items-center gap-2">
                <span class="material-symbols-outlined text-brand opacity-60">kitchen</span>
                Monitoramento Ativo
              </h3>
              <button (click)="loadData()" class="p-2 text-muted hover:text-brand hover:bg-brand/10 rounded-xl transition-all" title="Atualizar">
                <span class="material-symbols-outlined text-[20px]" [class.animate-spin]="isLoading()">refresh</span>
              </button>
            </div>
            
            @if (isLoading() && equipmentList().length === 0) {
              <div class="p-16 text-center text-muted">
                <div class="animate-pulse flex flex-col items-center">
                   <div class="w-16 h-16 bg-brand/10 rounded-full flex items-center justify-center mb-4">
                      <span class="material-symbols-outlined text-brand text-4xl">sync</span>
                   </div>
                   <p class="font-bold uppercase tracking-widest text-xs">Carregando dispositivos...</p>
                </div>
              </div>
            } @else if (equipmentList().length === 0) {
              <div class="p-16 text-center text-muted">
                <span class="material-symbols-outlined text-6xl mb-4 opacity-20">kitchen</span>
                <p class="text-lg font-bold">Nenhum equipamento cadastrado.</p>
                @if (isManager()) {
                  <button (click)="showAddEquipmentModal.set(true)" class="mt-4 text-brand font-black text-sm uppercase tracking-widest hover:underline">Clique para adicionar</button>
                }
              </div>
            } @else {
              <div class="divide-y divide-subtle">
                @for (eq of equipmentList(); track eq.id) {
                  <div class="p-6 hover:bg-surface-elevated transition-colors group">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                      <div class="flex items-center gap-4">
                         <div class="w-10 h-10 rounded-xl bg-surface-elevated flex items-center justify-center border border-subtle shadow-sm">
                            <span class="material-symbols-outlined text-muted group-hover:text-brand transition-colors">kitchen</span>
                         </div>
                         <div>
                            <h4 class="text-base font-black text-title">{{ eq.name }}</h4>
                            <div class="flex items-center gap-2 mt-1">
                               <span class="text-[10px] font-bold uppercase tracking-widest text-muted">Faixa Ideal</span>
                               <span class="text-xs font-black text-brand bg-brand/10 px-2 py-0.5 rounded-md border border-brand/20">
                                 {{ eq.min_temp !== null ? eq.min_temp + '°C' : 'N/A' }} a {{ eq.max_temp !== null ? eq.max_temp + '°C' : 'N/A' }}
                               </span>
                            </div>
                         </div>
                      </div>
                      
                      <div class="flex items-center gap-3">
                        <div class="relative flex items-center">
                            <input type="number" step="0.1" [id]="'temp-' + eq.id" placeholder="00.0" 
                                   class="block w-28 rounded-xl bg-surface-elevated border-2 border-strong/50 text-title font-black text-center py-2.5 focus:border-brand focus:ring-4 focus:ring-brand/10 outline-none transition-all placeholder:opacity-30 text-lg data-mono shadow-inner"
                                   #tempInput (input)="null">
                            <span class="absolute -right-6 text-sm font-black text-muted tracking-tighter">°C</span>
                        </div>
                        <button (click)="logTemperature(eq, tempInput.value); tempInput.value = ''" 
                                [disabled]="isSubmitting() || !tempInput.value"
                                class="ml-8 bg-success hover:bg-success-hover disabled:bg-surface-elevated disabled:text-muted disabled:border-subtle text-white px-6 py-2.5 rounded-xl text-sm font-black flex items-center gap-2 transition-all shadow-md hover:translate-y-[-2px] active:scale-95 border border-success/30 uppercase tracking-widest">
                          <span class="material-symbols-outlined text-sm">save</span>
                          Registrar
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
                Histórico
              </h3>
            </div>
            <div class="flex-1 overflow-y-auto hide-scrollbar p-0">
              @if (recentLogs().length === 0) {
                <div class="p-12 text-center text-muted italic text-sm">
                  <span class="material-symbols-outlined block text-4xl mb-2 opacity-10">history_edu</span>
                  Nenhum registro recente.
                </div>
              } @else {
                <div class="divide-y divide-subtle">
                  @for (log of recentLogs(); track log.id) {
                    <div class="p-5 hover:bg-surface-elevated transition-colors">
                      <div class="flex justify-between items-start mb-3">
                        <div class="min-w-0">
                          <p class="text-sm font-black text-title truncate">{{ log.equipment?.name }}</p>
                          <div class="flex items-center gap-1.5 mt-1">
                             <span class="material-symbols-outlined text-[14px] text-muted">person</span>
                             <p class="text-[10px] font-bold text-muted uppercase tracking-wider truncate">{{ log.employees?.name || 'Sistema' }}</p>
                          </div>
                        </div>
                        <div class="flex-shrink-0 ml-2">
                           <div class="px-3 py-1.5 rounded-xl font-black text-sm data-mono shadow-sm border"
                                [ngClass]="getTemperatureStatusClass(log.temperature, log.equipment?.min_temp, log.equipment?.max_temp)">
                             {{ log.temperature }}°C
                           </div>
                        </div>
                      </div>
                      <div class="flex items-center gap-1.5 opacity-50">
                        <span class="material-symbols-outlined text-[14px]">calendar_month</span>
                        <p class="text-[10px] font-bold uppercase tracking-widest">{{ log.recorded_at | date:'dd MMM, HH:mm' }}</p>
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

    <!-- Add Equipment Modal -->
    @if (showAddEquipmentModal()) {
      <div class="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300" (click)="showAddEquipmentModal.set(false)">
        <div class="chef-surface w-full max-w-md overflow-hidden transform scale-100 transition-all shadow-2xl border-2 border-strong" (click)="$event.stopPropagation()">
          <div class="px-6 py-5 border-b border-subtle bg-surface-elevated/50 flex justify-between items-center">
            <h3 class="text-xl font-black text-title title-display tracking-tight flex items-center gap-2">
               <span class="material-symbols-outlined text-brand">add_circle</span>
               Novo Equipamento
            </h3>
            <button (click)="showAddEquipmentModal.set(false)" class="p-2 rounded-xl text-muted hover:bg-danger/10 hover:text-danger active:scale-95 transition-all">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <form [formGroup]="equipmentForm" (ngSubmit)="saveEquipment()">
            <div class="p-8 space-y-6">
              <div>
                <label class="block text-[11px] font-black uppercase tracking-widest text-muted mb-2">Nome do Equipamento</label>
                <div class="relative group">
                   <span class="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-muted group-focus-within:text-brand transition-colors">kitchen</span>
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

  async logTemperature(equipment: Equipment, tempValue: string) {
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
        temperature: temp
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

  getTemperatureStatusClass(temp: number, min: number | null | undefined, max: number | null | undefined): string {
    if (min !== null && min !== undefined && temp < min) {
      return 'bg-info/10 text-info border-info/30'; // Too cold
    }
    if (max !== null && max !== undefined && temp > max) {
      return 'bg-danger/10 text-danger border-danger/30'; // Too hot
    }
    return 'bg-success/10 text-success border-success/30'; // OK
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
