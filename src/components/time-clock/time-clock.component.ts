import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Employee, TimeClockEntry, Shift } from '../../models/db.models';
import { HrStateService } from '../../services/hr-state.service';
import { TimeClockService } from '../../services/time-clock.service';
import { NotificationService } from '../../services/notification.service';
import { SettingsStateService } from '../../services/settings-state.service';
import { MtpExportService } from '../../services/mtp-export.service';

declare var L: any; // Leaflet

function formatISOToInput(isoString: string | null | undefined): string {
    if (!isoString) return '';
    const date = new Date(isoString);
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 16);
}

function parseInputToISO(inputString: string | null | undefined): string | null {
    if (!inputString) return null;
    return new Date(inputString).toISOString();
}

@Component({
  selector: 'app-time-clock',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './time-clock.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DatePipe]
})
export class TimeClockComponent {
    private hrState = inject(HrStateService);
    private timeClockService = inject(TimeClockService);
    private notificationService = inject(NotificationService);
    private settingsState = inject(SettingsStateService);
    private mtpExportService = inject(MtpExportService);

    employees = this.hrState.employees;
    schedules = this.hrState.schedules;
    companyProfile = this.settingsState.companyProfile;

    isLoading = signal(true);
    filteredEntries = signal<TimeClockEntry[]>([]);
    filterEmployeeId = signal<string>('all');
    
    private today = new Date();
    private startOfMonth = new Date(this.today.getFullYear(), this.today.getMonth(), 1);
    private endOfMonth = new Date(this.today.getFullYear(), this.today.getMonth() + 1, 0);

    filterStartDate = signal(this.startOfMonth.toISOString().split('T')[0]);
    filterEndDate = signal(this.endOfMonth.toISOString().split('T')[0]);

    isModalOpen = signal(false);
    editingEntry = signal<TimeClockEntry | null>(null);
    entryForm = signal<Partial<TimeClockEntry>>({});
    entryPendingDeletion = signal<TimeClockEntry | null>(null);

    // Map Modal
    isMapModalOpen = signal(false);
    selectedEntryForMap = signal<TimeClockEntry | null>(null);
    @ViewChild('mapContainer') mapContainer!: ElementRef;
    private map: any;

    constructor() {
        effect(() => {
            const employeeId = this.filterEmployeeId();
            const startDate = this.filterStartDate();
            const endDate = this.filterEndDate();
            this.loadEntries(startDate, endDate, employeeId);
        }, { allowSignalWrites: true });
    }

    async loadEntries(startDate: string, endDate: string, employeeId: string) {
        if (!startDate || !endDate) return;
        this.isLoading.set(true);
        const { data, error } = await this.timeClockService.getEntriesForPeriod(startDate, endDate, employeeId);
        if (error) {
            this.notificationService.alert(`Erro ao carregar registros: ${error.message}`);
            this.filteredEntries.set([]);
        } else {
            this.filteredEntries.set(data || []);
        }
        this.isLoading.set(false);
    }

    totalHours = computed(() => {
        const totalMilliseconds = this.filteredEntries()
            .reduce((sum, entry) => {
                const duration = this.calculateDurationInMs(entry);
                return sum + duration;
            }, 0);
        
        return totalMilliseconds / (1000 * 60 * 60); 
    });

    private calculateDurationInMs(entry: TimeClockEntry): number {
        if (!entry.clock_out_time) return 0;
        
        const start = new Date(entry.clock_in_time).getTime();
        const end = new Date(entry.clock_out_time).getTime();
        const totalDuration = end > start ? end - start : 0;
        
        let breakDuration = 0;
        if (entry.break_start_time && entry.break_end_time) {
            const breakStart = new Date(entry.break_start_time).getTime();
            const breakEnd = new Date(entry.break_end_time).getTime();
            if (breakEnd > breakStart) {
                breakDuration = breakEnd - breakStart;
            }
        }
        return Math.max(0, totalDuration - breakDuration);
    }

    formatDuration(durationMs: number): string {
        if (durationMs <= 0) return '00:00:00';
        const hours = Math.floor(durationMs / (1000 * 60 * 60));
        const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    getFormattedDuration(entry: TimeClockEntry): string {
        if (!entry.clock_out_time) return 'Em andamento';
        const durationMs = this.calculateDurationInMs(entry);
        return this.formatDuration(durationMs);
    }

    // Homologation Info Modal
    isInfoModalOpen = signal(false);

    openInfoModal() {
        this.isInfoModalOpen.set(true);
    }

    closeInfoModal() {
        this.isInfoModalOpen.set(false);
    }
    
    // --- Lateness Logic ---
    isLate(entry: TimeClockEntry): boolean {
        // Find schedule for this day/employee
        const entryDate = new Date(entry.clock_in_time);
        // Find schedule week
        const schedules = this.schedules();
        
        // Very basic search, ideally should index by date
        // Find shift matching employee and date
        for (const schedule of schedules) {
             const shift = schedule.shifts.find(s => 
                s.employee_id === entry.employee_id && 
                new Date(s.start_time).toISOString().split('T')[0] === entryDate.toISOString().split('T')[0]
             );
             if (shift && !shift.is_day_off) {
                 const scheduledStart = new Date(shift.start_time);
                 const actualStart = new Date(entry.clock_in_time);
                 // Tolerance: 10 minutes
                 const diffMinutes = (actualStart.getTime() - scheduledStart.getTime()) / 60000;
                 return diffMinutes > 10;
             }
        }
        return false;
    }
    
    // --- Map Logic ---
    openMapModal(entry: TimeClockEntry) {
        if (!entry.latitude || !entry.longitude) {
            this.notificationService.show('Localização não registrada para este ponto.', 'warning');
            return;
        }
        this.selectedEntryForMap.set(entry);
        this.isMapModalOpen.set(true);
        
        setTimeout(() => this.initMap(), 100);
    }
    
    closeMapModal() {
        this.isMapModalOpen.set(false);
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
    }

    private initMap() {
        const entry = this.selectedEntryForMap();
        if (!entry || !this.mapContainer) return;
        
        const lat = entry.latitude!;
        const lon = entry.longitude!;
        
        this.map = L.map(this.mapContainer.nativeElement).setView([lat, lon], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
        
        // Employee Marker
        L.marker([lat, lon]).addTo(this.map).bindPopup(`Ponto: ${entry.employees?.name}`).openPopup();
        
        // Store Marker (if available)
        const profile = this.companyProfile();
        if (profile?.latitude && profile.longitude) {
             L.circle([profile.latitude, profile.longitude], {
                color: 'blue',
                fillColor: '#3b82f6',
                fillOpacity: 0.2,
                radius: profile.time_clock_radius || 100
            }).addTo(this.map).bindPopup('Área Permitida');
        }
    }
    
    exportAFD() {
        if (this.filteredEntries().length === 0) {
            this.notificationService.alert('Não há registros no período selecionado para exportar.');
            return;
        }
        this.mtpExportService.exportAFD(this.filteredEntries());
    }

    exportAEJ() {
        if (this.filteredEntries().length === 0) {
            this.notificationService.alert('Não há registros no período selecionado para exportar.');
            return;
        }
        this.mtpExportService.exportAEJ(this.filteredEntries());
    }

    printEspelhoPonto() {
        const employeeId = this.filterEmployeeId();
        if (employeeId === 'all') {
            this.notificationService.alert('Selecione um funcionário específico para gerar o espelho de ponto.');
            return;
        }

        const employee = this.employees().find(e => e.id === employeeId);
        if (!employee) return;

        const startDate = this.filterStartDate();
        const endDate = this.filterEndDate();
        const entries = this.filteredEntries();

        let tableRows = '';
        let totalMs = 0;

        entries.forEach(entry => {
            const date = new Date(entry.clock_in_time).toLocaleDateString('pt-BR');
            const inTime = new Date(entry.clock_in_time).toLocaleTimeString('pt-BR');
            const outTime = entry.clock_out_time ? new Date(entry.clock_out_time).toLocaleTimeString('pt-BR') : '-';
            const breakIn = entry.break_start_time ? new Date(entry.break_start_time).toLocaleTimeString('pt-BR') : '-';
            const breakOut = entry.break_end_time ? new Date(entry.break_end_time).toLocaleTimeString('pt-BR') : '-';
            const dur = this.getFormattedDuration(entry);
            
            totalMs += this.calculateDurationInMs(entry);

            tableRows += `
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;">${date}</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${inTime}</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${breakIn}</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${breakOut}</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${outTime}</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${dur}</td>
                </tr>
            `;
        });

        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);

        iframe.contentDocument?.write(`
            <html>
            <head>
                <title>Espelho de Ponto - ${employee.name}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
                    h1 { font-size: 20px; text-align: center; }
                    .header { margin-bottom: 20px; font-size: 14px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 12px; text-align: center; }
                    th { background-color: #f4f4f4; padding: 10px; border: 1px solid #ddd; }
                    .signature { margin-top: 50px; text-align: center; }
                    .signature-line { border-top: 1px solid #000; width: 300px; margin: 0 auto 10px auto; }
                </style>
            </head>
            <body>
                <h1>Espelho de Ponto</h1>
                <div class="header">
                    <strong>Empregado:</strong> ${employee.name} <br>
                    <strong>Matrícula:</strong> ${employee.bank_details?.matricula || 'N/A'} <br>
                    <strong>CPF:</strong> ${employee.cpf || 'N/A'} <br>
                    <strong>Período:</strong> ${new Date(startDate).toLocaleDateString('pt-BR')} a ${new Date(endDate).toLocaleDateString('pt-BR')} <br>
                    <strong>Total de Horas:</strong> ${this.formatDuration(totalMs)}
                </div>
                
                <table>
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Entrada</th>
                            <th>Início Pausa</th>
                            <th>Fim Pausa</th>
                            <th>Saída</th>
                            <th>Total (Dia)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>

                <div class="signature">
                    <div class="signature-line"></div>
                    <p>Assinatura do Empregado</p>
                </div>
            </body>
            </html>
        `);
        iframe.contentDocument?.close();
        
        setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => document.body.removeChild(iframe), 1000);
        }, 250);
    }

    openAddModal() {
        this.editingEntry.set(null);
        this.entryForm.set({
            employee_id: this.employees()[0]?.id ?? undefined,
            clock_in_time: new Date().toISOString(),
            clock_out_time: null,
            break_start_time: null,
            break_end_time: null,
            notes: '',
        });
        this.isModalOpen.set(true);
    }
    
    openEditModal(entry: TimeClockEntry) {
        this.editingEntry.set(entry);
        
        let cleanedNotes = entry.notes || '';
        // Remove trailing hash lines if they exist from older records
        cleanedNotes = cleanedNotes.replace(/\[NSR: .*? \| TIPO: .*? \| HASH: .*?\]/g, '').trim();

        this.entryForm.set({ ...entry, notes: cleanedNotes });
        this.isModalOpen.set(true);
    }

    closeModal() {
        this.isModalOpen.set(false);
    }

    async saveEntry() {
        const formValue = this.entryForm();
        if (!formValue.employee_id || !formValue.clock_in_time) {
            await this.notificationService.alert('Funcionário e Horário de Entrada são obrigatórios.');
            return;
        }

        const result = this.editingEntry()
            ? await this.timeClockService.updateEntry(this.editingEntry()!.id, formValue)
            : await this.timeClockService.addEntry(formValue);

        if (result.success) {
            await this.notificationService.alert(this.editingEntry() ? 'Registro atualizado!' : 'Registro adicionado!', 'Sucesso');
            this.closeModal();
            this.loadEntries(this.filterStartDate(), this.filterEndDate(), this.filterEmployeeId());
        } else {
            await this.notificationService.alert(`Falha ao salvar. Erro: ${result.error?.message}`);
        }
    }

    requestDeleteEntry(entry: TimeClockEntry) { this.entryPendingDeletion.set(entry); }
    cancelDeleteEntry() { this.entryPendingDeletion.set(null); }
    
    async confirmDeleteEntry() {
        const entry = this.entryPendingDeletion();
        if (entry) {
            const result = await this.timeClockService.deleteEntry(entry.id);
            if (result.success) {
                this.loadEntries(this.filterStartDate(), this.filterEndDate(), this.filterEmployeeId());
            } else {
                await this.notificationService.alert(`Falha ao deletar. Erro: ${result.error?.message}`);
            }
            this.entryPendingDeletion.set(null);
        }
    }

    updateEntryFormField(field: string, value: any) {
        this.entryForm.update(form => ({...form, [field]: value}));
    }

    updateEntryFormDateTime(field: 'clock_in_time' | 'clock_out_time' | 'break_start_time' | 'break_end_time', value: string) {
        this.entryForm.update(form => ({ ...form, [field]: parseInputToISO(value) }));
    }

    formatForInput(iso: string | null | undefined): string {
      return formatISOToInput(iso);
    }
}
