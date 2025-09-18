
import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ReservationDataService } from '../../services/reservation-data.service';
import { CompanyProfile, Reservation, ReservationSettings } from '../../models/db.models';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { NotificationService } from '../../services/notification.service';
import { PublicDataService } from '../../services/public-data.service';

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
  notificationService = inject(NotificationService);
  publicDataService = inject(PublicDataService);
  private routeSub: Subscription | undefined;

  // View state
  viewState = signal<'loading' | 'form' | 'success' | 'error'>('loading');
  errorMessage = signal('');

  // Data
  userId = signal<string | null>(null);
  settings = signal<ReservationSettings | null>(null);
  companyProfile = signal<Partial<CompanyProfile> | null>(null);
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
    const [settings, profile] = await Promise.all([
        this.reservationDataService.getPublicReservationSettings(userId),
        this.publicDataService.getPublicCompanyProfile(userId)
    ]);

    if (!settings) {
      this.viewState.set('error');
      this.errorMessage.set('Este restaurante não está aceitando reservas no momento.');
      return;
    }

    this.settings.set(settings);
    this.companyProfile.set(profile);
    
    // Clamp the initial party size to be within the allowed range
    this.partySize.set(Math.max(settings.min_party_size, Math.min(this.partySize(), settings.max_party_size)));

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
    const selectedDate = new Date(this.selectedDate() + 'T12:00:00Z'); // Use UTC noon to avoid timezone shifts with getDay()
    const dayOfWeek = selectedDate.getUTCDay(); // 0 for Sunday, 1 for Monday, etc.

    if (!s || !s.weekly_hours) return [];

    const daySettings = s.weekly_hours.find(d => d.day_of_week === dayOfWeek);
    if (!daySettings || daySettings.is_closed) return [];

    const slots: TimeSlot[] = [];
    const opening = new Date(`1970-01-01T${daySettings.opening_time}`);
    let closing = new Date(`1970-01-01T${daySettings.closing_time}`);
    
    // Handle overnight closing times
    if (closing <= opening) {
        closing.setDate(closing.getDate() + 1);
    }

    const existingTimes = new Set(this.existingReservations().map(r => {
        const d = new Date(r.reservation_time);
        return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
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
    const settings = this.settings();
    if (!settings) {
      this.viewState.set('error');
      this.errorMessage.set('Configurações de reserva não encontradas.');
      return;
    }

    if (this.partySize() < settings.min_party_size || this.partySize() > settings.max_party_size) {
        await this.notificationService.alert(`O número de pessoas deve ser entre ${settings.min_party_size} e ${settings.max_party_size}.`);
        return;
    }

    if (!this.customerName() || !this.customerPhone() || !this.selectedTime()) {
        await this.notificationService.alert('Por favor, preencha seu nome, telefone e selecione um horário.');
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
