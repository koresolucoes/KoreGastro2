import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
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
    allEntries = this.stateService.timeClockEntries;
    employees = this.stateService.employees;
    isLoading = computed(() => !this.stateService.isDataLoaded());

    // Filter signals
    filterEmployeeId = signal<string>('all');
    
    // Set default date range to current month
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

    filteredEntries = computed(() => {
        const employeeId = this.filterEmployeeId();
        const startDateStr = this.filterStartDate(); // e.g., '2025-09-01'
        const endDateStr = this.filterEndDate(); // e.g., '2025-09-30'
        
        // Create full ISO strings for the boundaries.
        // This ensures we are comparing UTC times correctly.
        const startISO = startDateStr ? `${startDateStr}T00:00:00.000Z` : null;
        const endISO = endDateStr ? `${endDateStr}T23:59:59.999Z` : null;

        return this.allEntries()
            .filter(entry => {
                if (employeeId !== 'all' && entry.employee_id !== employeeId) {
                    return false;
                }
                
                // clock_in_time from Supabase is a full ISO 8601 string,
                // which allows for safe lexicographical (string) comparison.
                const entryDateStr = entry.clock_in_time; 
                
                if (startISO && entryDateStr < startISO) {
                    return false;
                }
                if (endISO && entryDateStr > endISO) {
                    return false;
                }
                return true;
            });
    });

    totalHours = computed(() => {
        const totalMilliseconds = this.filteredEntries()
            .filter(entry => entry.clock_out_time)
            .reduce((sum, entry) => {
                const duration = new Date(entry.clock_out_time!).getTime() - new Date(entry.clock_in_time).getTime();
                return sum + (duration > 0 ? duration : 0);
            }, 0);
        
        return totalMilliseconds / (1000 * 60 * 60); // Convert to hours
    });

    calculateDuration(entry: TimeClockEntry): string {
        if (!entry.clock_out_time) {
            return 'Em andamento';
        }
        const start = new Date(entry.clock_in_time);
        const end = new Date(entry.clock_out_time);
        const diffMs = end.getTime() - start.getTime();
        if (diffMs < 0) return 'Inválido';

        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    openAddModal() {
        this.editingEntry.set(null);
        this.entryForm.set({
            employee_id: this.employees()[0]?.id ?? null,
            clock_in_time: new Date().toISOString(),
            clock_out_time: null,
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
            if (!result.success) {
                await this.notificationService.alert(`Falha ao deletar. Erro: ${result.error?.message}`);
            }
            this.entryPendingDeletion.set(null);
        }
    }

    updateEntryFormField(field: keyof Omit<TimeClockEntry, 'id' | 'created_at' | 'user_id' | 'employees' | 'clock_in_time' | 'clock_out_time'>, value: string | null) {
        this.entryForm.update(form => ({...form, [field]: value}));
    }

    updateEntryFormDateTime(field: 'clock_in_time' | 'clock_out_time', value: string) {
        this.entryForm.update(form => ({ ...form, [field]: parseInputToISO(value) }));
    }

    formatForInput(iso: string | null | undefined): string {
      return formatISOToInput(iso);
    }
}