import { Component, ChangeDetectionStrategy, input, output, signal, computed, effect, InputSignal, OutputEmitterRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Reservation } from '../../models/db.models';
import { PosStateService } from '../../services/pos-state.service';
import { SettingsStateService } from '../../services/settings-state.service';

@Component({
  selector: 'app-reservation-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reservation-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReservationModalComponent {
  posState = inject(PosStateService);
  settingsState = inject(SettingsStateService);

  initialData: InputSignal<Partial<Reservation> | null> = input.required<Partial<Reservation> | null>();

  save: OutputEmitterRef<Partial<Reservation>> = output<Partial<Reservation>>();
  close: OutputEmitterRef<void> = output<void>();

  reservationForm = signal<Partial<Reservation>>({});
  
  // Use separate signals for form inputs to handle date/time combination
  formDate = signal('');
  formTime = signal('');

  isEditing = computed(() => !!this.initialData()?.id);

  constructor() {
    effect(() => {
      const data = this.initialData();
      if (data) {
        this.reservationForm.set({ ...data });
        if (data.reservation_time) {
            const date = new Date(data.reservation_time);
            // Adjust for timezone offset to display local time correctly in the input
            const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
            this.formDate.set(localDate.toISOString().split('T')[0]);
            this.formTime.set(localDate.toISOString().substring(11, 16));
        }
      }
    });
  }

  updateFormField(field: keyof Omit<Reservation, 'id' | 'created_at' | 'user_id' | 'reservation_time'>, value: any) {
    this.reservationForm.update(form => {
      const newForm = { ...form };
      if (field === 'party_size' || field === 'expected_duration_minutes') {
        const num = Number(value);
        (newForm as any)[field] = isNaN(num) || value === '' ? null : num;
      } else {
        (newForm as any)[field] = value;
      }
      return newForm;
    });
  }

  onCustomerSelect(customerId: string | null) {
    const customer = this.posState.customers().find(c => c.id === customerId);
    this.reservationForm.update(form => ({
      ...form,
      customer_id: customerId,
      customer_name: customer ? customer.name : form.customer_name,
      customer_phone: customer ? (customer.phone || undefined) : form.customer_phone
    }));
  }

  isFormValid = computed(() => {
    const form = this.reservationForm();
    const hasConflict = !!(form.table_id && this.tableConflicts()[form.table_id]);
    return form.customer_name && form.party_size && form.party_size > 0 && this.formDate() && this.formTime() && !hasConflict;
  });

  tableConflicts = computed(() => {
    const dateStr = this.formDate();
    const timeStr = this.formTime();
    const durStr = this.reservationForm().expected_duration_minutes || 120; // Default 120
    const resId = this.reservationForm().id;

    if (!dateStr || !timeStr) return {};

    const targetStart = new Date(`${dateStr}T${timeStr}`);
    const targetEnd = new Date(targetStart.getTime() + durStr * 60000);
    const conflicts: Record<string, boolean> = {};

    this.settingsState.reservations().forEach(res => {
      // Ignore current reservation, cancelled or completed ones
      if (res.id === resId || res.status === 'CANCELLED' || res.status === 'COMPLETED') return;
      if (!res.table_id) return;
      
      const resStart = new Date(res.reservation_time);
      const dur = res.expected_duration_minutes || 120;
      const resEnd = new Date(resStart.getTime() + dur * 60000);

      // Simple overlap logic: max(start) < min(end)
      if (targetStart < resEnd && targetEnd > resStart) {
        conflicts[res.table_id] = true;
      }
    });

    return conflicts;
  });
  
  onSave() {
    if (this.isFormValid()) {
      // Before emitting, combine date and time back into a single ISO string
      // This creates a date object in the browser's local timezone
      const combinedDateTime = new Date(`${this.formDate()}T${this.formTime()}`);
      
      this.reservationForm.update(form => ({
          ...form, 
          // .toISOString() converts it to UTC (Z timezone) for the database
          reservation_time: combinedDateTime.toISOString() 
      }));
      this.save.emit(this.reservationForm());
    }
  }
}