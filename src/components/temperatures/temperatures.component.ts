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
    <div class="p-6 max-w-7xl mx-auto">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-bold text-white">Controle de Temperatura</h1>
        <div class="flex gap-3">
          <button (click)="generatePDF()" class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2">
            <span class="material-symbols-outlined text-sm">picture_as_pdf</span>
            Gerar Relatório
          </button>
          @if (isManager()) {
            <button (click)="showAddEquipmentModal.set(true)" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2">
              <span class="material-symbols-outlined text-sm">add</span>
              Novo Equipamento
            </button>
          }
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Equipment List & Logging -->
        <div class="lg:col-span-2 space-y-6">
          <div class="bg-gray-800 shadow rounded-lg overflow-hidden border border-gray-700">
            <div class="px-4 py-5 sm:px-6 border-b border-gray-700 bg-gray-800 flex justify-between items-center">
              <h3 class="text-lg leading-6 font-medium text-white">Equipamentos Monitorados</h3>
              <button (click)="loadData()" class="text-gray-400 hover:text-blue-400" title="Atualizar">
                <span class="material-symbols-outlined">refresh</span>
              </button>
            </div>
            
            @if (isLoading()) {
              <div class="p-8 text-center text-gray-400">
                <span class="material-symbols-outlined animate-spin text-4xl mb-2">sync</span>
                <p>Carregando equipamentos...</p>
              </div>
            } @else if (equipmentList().length === 0) {
              <div class="p-8 text-center text-gray-400">
                <span class="material-symbols-outlined text-4xl mb-2 text-gray-500">kitchen</span>
                <p>Nenhum equipamento cadastrado.</p>
                @if (isManager()) {
                  <p class="text-sm mt-2">Clique em "Novo Equipamento" para começar.</p>
                }
              </div>
            } @else {
              <ul class="divide-y divide-gray-700">
                @for (eq of equipmentList(); track eq.id) {
                  <li class="p-4 hover:bg-gray-700/50 transition-colors">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h4 class="text-md font-semibold text-white flex items-center gap-2">
                          <span class="material-symbols-outlined text-blue-400">kitchen</span>
                          {{ eq.name }}
                        </h4>
                        <p class="text-sm text-gray-400 mt-1">
                          Faixa ideal: 
                          <span class="font-medium text-gray-300">
                            {{ eq.min_temp !== null ? eq.min_temp + '°C' : 'N/A' }} a {{ eq.max_temp !== null ? eq.max_temp + '°C' : 'N/A' }}
                          </span>
                        </p>
                      </div>
                      
                      <div class="flex items-center gap-2">
                        <input type="number" step="0.1" [id]="'temp-' + eq.id" placeholder="Ex: 4.5" 
                               class="block w-24 rounded-md bg-gray-900 border-gray-600 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                               #tempInput (input)="null">
                        <span class="text-gray-400">°C</span>
                        <button (click)="logTemperature(eq, tempInput.value); tempInput.value = ''" 
                                [disabled]="isSubmitting() || !tempInput.value"
                                class="ml-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:text-gray-400 text-white px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1 transition-colors">
                          <span class="material-symbols-outlined text-sm">save</span>
                          Registrar
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
              <h3 class="text-lg leading-6 font-medium text-white">Últimos Registros</h3>
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
                          <p class="text-sm font-medium text-white">{{ log.equipment?.name }}</p>
                          <p class="text-xs text-gray-400 mt-1">Por: {{ log.employees?.name || 'Desconhecido' }}</p>
                          <p class="text-xs text-gray-500">{{ log.recorded_at | date:'dd/MM/yyyy HH:mm' }}</p>
                        </div>
                        <div class="text-right">
                          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
                                [ngClass]="getTemperatureStatusClass(log.temperature, log.equipment?.min_temp, log.equipment?.max_temp)">
                            {{ log.temperature }} °C
                          </span>
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

    <!-- Add Equipment Modal -->
    @if (showAddEquipmentModal()) {
      <div class="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4" (click)="showAddEquipmentModal.set(false)">
        <div class="bg-gray-800 rounded-lg shadow-xl w-full max-w-md border border-gray-700 overflow-hidden" (click)="$event.stopPropagation()">
          <div class="p-4 border-b border-gray-700 flex justify-between items-center">
            <h3 class="text-xl font-bold text-white">Novo Equipamento</h3>
            <button (click)="showAddEquipmentModal.set(false)" class="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <form [formGroup]="equipmentForm" (ngSubmit)="saveEquipment()">
            <div class="p-6 space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-300 mb-1">Nome do Equipamento</label>
                <input type="text" formControlName="name" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ex: Freezer Carnes">
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-300 mb-1">Temp. Mínima (°C)</label>
                  <input type="number" step="0.1" formControlName="min_temp" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-300 mb-1">Temp. Máxima (°C)</label>
                  <input type="number" step="0.1" formControlName="max_temp" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
              </div>
            </div>
            <div class="bg-gray-900/50 p-4 border-t border-gray-700 flex justify-end gap-3">
              <button type="button" (click)="showAddEquipmentModal.set(false)" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors">
                Cancelar
              </button>
              <button type="submit" [disabled]="equipmentForm.invalid || isSubmitting()" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:text-gray-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center">
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
      return 'bg-blue-100 text-blue-800'; // Too cold
    }
    if (max !== null && max !== undefined && temp > max) {
      return 'bg-red-100 text-red-800'; // Too hot
    }
    return 'bg-green-100 text-green-800'; // OK
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
