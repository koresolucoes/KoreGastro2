import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Employee, TimeClockEntry, Shift } from '../../models/db.models';
import { HrStateService } from '../../services/hr-state.service';
import { TimeClockService } from '../../services/time-clock.service';
import { NotificationService } from '../../services/notification.service';
import { SettingsStateService } from '../../services/settings-state.service';

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
        this.entryForm.set({ ...entry });
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
