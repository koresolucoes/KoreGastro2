import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { ReservationDataService } from '../../services/reservation-data.service';
import { Reservation, ReservationStatus } from '../../models/db.models';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-reservations',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './reservations.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReservationsComponent {
  stateService = inject(SupabaseStateService);
  reservationDataService = inject(ReservationDataService);
  notificationService = inject(NotificationService);

  selectedDate = signal(new Date().toISOString().split('T')[0]);

  reservationsForDay = computed(() => {
    const allReservations = this.stateService.reservations();
    const selected = this.selectedDate();
    const startOfDay = new Date(selected);
    startOfDay.setUTCHours(0,0,0,0);
    const endOfDay = new Date(selected);
    endOfDay.setUTCHours(23,59,59,999);
    
    return allReservations.filter(r => {
        const resTime = new Date(r.reservation_time);
        return resTime >= startOfDay && resTime <= endOfDay;
    });
  });

  pendingReservations = computed(() => this.reservationsForDay().filter(r => r.status === 'PENDING'));
  confirmedReservations = computed(() => this.reservationsForDay().filter(r => r.status === 'CONFIRMED'));
  completedOrCancelledReservations = computed(() => this.reservationsForDay().filter(r => r.status === 'COMPLETED' || r.status === 'CANCELLED'));

  handleDateChange(event: Event) {
    const newDate = (event.target as HTMLInputElement).value;
    this.selectedDate.set(newDate);
  }

  async updateStatus(reservation: Reservation, status: ReservationStatus) {
    let confirmMessage = '';
    switch(status) {
        case 'CONFIRMED': confirmMessage = `Confirmar a reserva de ${reservation.customer_name}?`; break;
        case 'CANCELLED': confirmMessage = `Cancelar a reserva de ${reservation.customer_name}?`; break;
        case 'COMPLETED': confirmMessage = `Marcar a reserva de ${reservation.customer_name} como concluída?`; break;
    }
    const confirmed = await this.notificationService.confirm(confirmMessage, 'Confirmar Ação');
    if (!confirmed) return;

    const { success, error } = await this.reservationDataService.updateReservationStatus(reservation.id, status);
    if (!success) {
      await this.notificationService.alert(`Erro ao atualizar reserva: ${error?.message}`);
    }
  }

  getStatusClass(status: ReservationStatus): string {
    switch (status) {
      case 'PENDING': return 'border-yellow-500';
      case 'CONFIRMED': return 'border-blue-500';
      case 'CANCELLED': return 'border-red-500 opacity-60';
      case 'COMPLETED': return 'border-green-500 opacity-80';
      default: return 'border-gray-500';
    }
  }

   getStatusTextClass(status: ReservationStatus): string {
    switch (status) {
      case 'PENDING': return 'text-yellow-300';
      case 'CONFIRMED': return 'text-blue-300';
      case 'CANCELLED': return 'text-red-300 line-through';
      case 'COMPLETED': return 'text-green-300';
      default: return 'text-gray-300';
    }
  }
}
