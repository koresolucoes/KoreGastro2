import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ReservationDataService } from '../../services/reservation-data.service';
import { Reservation, ReservationSettings } from '../../models/db.models';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

interface TimeSlot {
  time: string; // "HH:mm"
  isAvailable: boolean;
}

@Component({
  selector: 'app-public-booking',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './public-booking.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicBookingComponent implements OnInit, OnDestroy {
  route = inject(ActivatedRoute);
  router = inject(Router);
  reservationDataService = inject(ReservationDataService);
  private routeSub: Subscription | undefined;

  // View state
  viewState = signal<'loading' | 'form' | 'success' | 'error'>('loading');
  errorMessage = signal('');

  // Data
  userId = signal<string | null>(null);
  settings = signal<ReservationSettings | null>(null);
  existingReservations = signal<Reservation[]>([]);

  // Form state
  selectedDate = signal(new Date().toISOString().split('T')[0]);
  minDate = signal(new Date().toISOString().split('T')[0]);
  maxDate = signal('');
  selectedTime = signal<string | null>(null);
  partySize = signal(2);
  customerName = signal('');
  customerPhone = signal('');
  customerEmail = signal('');
  notes = signal('');

  ngOnInit() {
    // This component is public, so we need to adjust the body class for the light theme
    document.body.classList.remove('bg-gray-900');
    document.body.classList.add('bg-gray-100');

    this.routeSub = this.route.paramMap.subscribe(params => {
      const userId = params.get('userId');
      if (userId) {
        this.userId.set(userId);
        this.loadInitialData(userId);
      } else {
        this.viewState.set('error');
        this.errorMessage.set('ID do restaurante não encontrado.');
      }
    });
  }

  ngOnDestroy() {
    // Revert body class when leaving the component
    document.body.classList.add('bg-gray-900');
    document.body.classList.remove('bg-gray-100');
    this.routeSub?.unsubscribe();
  }

  async loadInitialData(userId: string) {
    this.viewState.set('loading');
    const settings = await this.reservationDataService.getPublicReservationSettings(userId);

    if (!settings) {
      this.viewState.set('error');
      this.errorMessage.set('Este restaurante não está aceitando reservas no momento.');
      return;
    }

    this.settings.set(settings);
    
    const today = new Date();
    const maxDate = new Date();
    maxDate.setDate(today.getDate() + settings.booking_notice_days);
    this.maxDate.set(maxDate.toISOString().split('T')[0]);

    await this.fetchReservationsForDate(this.selectedDate());
    this.viewState.set('form');
  }

  async fetchReservationsForDate(date: string) {
    const userId = this.userId();
    if (userId) {
      const reservations = await this.reservationDataService.getReservationsForDay(userId, date);
      this.existingReservations.set(reservations);
    }
  }

  async onDateChange(event: Event) {
    const newDate = (event.target as HTMLInputElement).value;
    this.selectedDate.set(newDate);
    this.selectedTime.set(null); // Reset time selection
    await this.fetchReservationsForDate(newDate);
  }

  timeSlots = computed<TimeSlot[]>(() => {
    const s = this.settings();
    if (!s) return [];

    const slots: TimeSlot[] = [];
    const opening = new Date(`1970-01-01T${s.opening_time}`);
    const closing = new Date(`1970-01-01T${s.closing_time}`);
    const existingTimes = new Set(this.existingReservations().map(r => {
        const d = new Date(r.reservation_time);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }));

    let current = opening;
    while (current < closing) {
      const timeStr = `${String(current.getHours()).padStart(2, '0')}:${String(current.getMinutes()).padStart(2, '0')}`;
      slots.push({
        time: timeStr,
        isAvailable: !existingTimes.has(timeStr),
      });
      current = new Date(current.getTime() + s.booking_duration_minutes * 60000);
    }
    return slots;
  });

  selectTime(time: string) {
    this.selectedTime.set(time);
  }

  async submitReservation() {
    if (!this.customerName() || !this.customerPhone() || !this.selectedTime()) {
        alert('Por favor, preencha seu nome, telefone e selecione um horário.');
        return;
    }
    this.viewState.set('loading');
    const userId = this.userId();
    if (!userId) {
        this.viewState.set('error');
        this.errorMessage.set('Ocorreu um erro. Tente novamente.');
        return;
    }

    const [hours, minutes] = this.selectedTime()!.split(':');
    const reservationDateTime = new Date(`${this.selectedDate()}T00:00:00.000Z`);
    reservationDateTime.setUTCHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

    const { success, error } = await this.reservationDataService.createPublicReservation({
      user_id: userId,
      customer_name: this.customerName(),
      customer_phone: this.customerPhone(),
      customer_email: this.customerEmail(),
      party_size: this.partySize(),
      reservation_time: reservationDateTime.toISOString(),
      notes: this.notes()
    });

    if (success) {
      this.viewState.set('success');
    } else {
      this.viewState.set('error');
      this.errorMessage.set(error?.message || 'Não foi possível completar sua reserva. Por favor, tente novamente.');
    }
  }

  startNewBooking() {
      this.viewState.set('form');
      this.selectedTime.set(null);
      this.customerName.set('');
      this.customerEmail.set('');
      this.customerPhone.set('');
      this.notes.set('');
  }
}
