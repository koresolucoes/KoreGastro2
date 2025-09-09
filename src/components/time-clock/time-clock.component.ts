import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Employee, TimeClockEntry } from '../../models/db.models';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { TimeClockService } from '../../services/time-clock.service';
import { NotificationService } from '../../services/notification.service';

// Helper to format ISO string to datetime-local input value
function formatISOToInput(isoString: string | null | undefined): string {
    if (!isoString) return '';
    const date = new Date(isoString);
    // Adjust for timezone offset
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 16);
}

// Helper to parse datetime-local input value back to ISO string (UTC)
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
    private stateService = inject(SupabaseStateService);
    private timeClockService = inject(TimeClockService);
    private notificationService = inject(NotificationService);

    // Data signals
    employees = this.stateService.employees;
    isLoading = signal(true);
    filteredEntries = signal<TimeClockEntry[]>([]);

    // Filter signals
    filterEmployeeId = signal<string>('all');
    
    private today = new Date();
    private startOfMonth = new Date(this.today.getFullYear(), this.today.getMonth(), 1);
    private endOfMonth = new Date(this.today.getFullYear(), this.today.getMonth() + 1, 0);

    filterStartDate = signal(this.startOfMonth.toISOString().split('T')[0]);
    filterEndDate = signal(this.endOfMonth.toISOString().split('T')[0]);

    // Modal state
    isModalOpen = signal(false);
    editingEntry = signal<TimeClockEntry | null>(null);
    entryForm = signal<Partial<TimeClockEntry>>({});
    entryPendingDeletion = signal<TimeClockEntry | null>(null);

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
        
        return totalMilliseconds / (1000 * 60 * 60); // Convert to hours
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
            // Re-fetch data to show the new/updated entry
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
                 // Re-fetch data to remove the deleted entry
                this.loadEntries(this.filterStartDate(), this.filterEndDate(), this.filterEmployeeId());
            } else {
                await this.notificationService.alert(`Falha ao deletar. Erro: ${result.error?.message}`);
            }
            this.entryPendingDeletion.set(null);
        }
    }

    updateEntryFormField(field: keyof Omit<TimeClockEntry, 'id' | 'created_at' | 'user_id' | 'employees' | 'clock_in_time' | 'clock_out_time' | 'break_start_time' | 'break_end_time'>, value: string | null) {
        this.entryForm.update(form => ({...form, [field]: value}));
    }

    updateEntryFormDateTime(field: 'clock_in_time' | 'clock_out_time' | 'break_start_time' | 'break_end_time', value: string) {
        this.entryForm.update(form => ({ ...form, [field]: parseInputToISO(value) }));
    }

    formatForInput(iso: string | null | undefined): string {
      return formatISOToInput(iso);
    }
}