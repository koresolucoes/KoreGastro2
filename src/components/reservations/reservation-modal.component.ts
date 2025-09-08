import { Component, ChangeDetectionStrategy, input, output, signal, computed, effect, InputSignal, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Reservation } from '../../models/db.models';

@Component({
  selector: 'app-reservation-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reservation-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReservationModalComponent {
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

  updateFormField(field: keyof Omit<Reservation, 'id' | 'created_at' | 'user_id' | 'status' | 'reservation_time'>, value: any) {
    this.reservationForm.update(form => {
      const newForm = { ...form };
      if (field === 'party_size') {
        const num = Number(value);
        (newForm as any)[field] = isNaN(num) ? undefined : num;
      } else {
        (newForm as any)[field] = value;
      }
      return newForm;
    });
  }

  isFormValid = computed(() => {
    const form = this.reservationForm();
    return form.customer_name && form.party_size && form.party_size > 0 && this.formDate() && this.formTime();
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