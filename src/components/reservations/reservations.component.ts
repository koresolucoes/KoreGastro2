import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { SettingsStateService } from '../../services/settings-state.service';
import { ReservationDataService } from '../../services/reservation-data.service';
import { Reservation, ReservationStatus } from '../../models/db.models';
import { NotificationService } from '../../services/notification.service';
import { OperationalAuthService } from '../../services/operational-auth.service';
import { ReservationModalComponent } from './reservation-modal.component';

@Component({
  selector: 'app-reservations',
  standalone: true,
  imports: [CommonModule, ReservationModalComponent, DatePipe],
  templateUrl: './reservations.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReservationsComponent {
  settingsState = inject(SettingsStateService);
  reservationDataService = inject(ReservationDataService);
  notificationService = inject(NotificationService);
  operationalAuthService = inject(OperationalAuthService);

  activeView = signal<'daily' | 'overview'>('daily');
  selectedDate = signal(new Date().toISOString().split('T')[0]);

  // Modal State
  isModalOpen = signal(false);
  reservationForModal = signal<Partial<Reservation> | null>(null);

  canAddReservation = computed(() => {
    const role = this.operationalAuthService.activeEmployee()?.role;
    return role === 'Gerente' || role === 'Garçom';
  });

  reservationsForDay = computed(() => {
    const allReservations = this.settingsState.reservations();
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
  
  groupedOverviewReservations = computed(() => {
    const allReservations = this.settingsState.reservations();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const fifteenDaysFromNow = new Date(today);
    fifteenDaysFromNow.setDate(today.getDate() + 15);
    fifteenDaysFromNow.setHours(23, 59, 59, 999);

    const filtered = allReservations
      .filter(r => {
        const resTime = new Date(r.reservation_time);
        return resTime >= today && resTime <= fifteenDaysFromNow && r.status !== 'CANCELLED' && r.status !== 'COMPLETED';
      })
      .sort((a, b) => new Date(a.reservation_time).getTime() - new Date(b.reservation_time).getTime());

    const grouped = new Map<string, Reservation[]>();

    for (const reservation of filtered) {
      const dateKey = new Date(reservation.reservation_time).toISOString().split('T')[0];
      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, []);
      }
      grouped.get(dateKey)!.push(reservation);
    }
    
    return Array.from(grouped.entries())
      .map(([date, reservations]) => ({ date, reservations }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  });


  handleDateChange(event: Event) {
    const newDate = (event.target as HTMLInputElement).value;
    this.selectedDate.set(newDate);
  }

  openAddModal() {
    this.reservationForModal.set({
      reservation_time: new Date(`${this.selectedDate()}T19:00:00`).toISOString(), // Default to 7 PM
      party_size: 2,
    });
    this.isModalOpen.set(true);
  }

  openEditModal(reservation: Reservation) {
    this.reservationForModal.set({ ...reservation });
    this.isModalOpen.set(true);
  }

  async handleSave(reservation: Partial<Reservation>) {
    if (reservation.id) {
      // Update existing reservation
      const { success, error } = await this.reservationDataService.updateReservation(reservation.id, reservation);
      if (success) {
        await this.notificationService.alert('Reserva atualizada com sucesso!', 'Sucesso');
        this.isModalOpen.set(false);
      } else {
        await this.notificationService.alert(`Erro ao atualizar reserva: ${error?.message}`);
      }
    } else {
      // Create new reservation
      const { success, error } = await this.reservationDataService.createManualReservation(reservation);
      if (success) {
        await this.notificationService.alert('Reserva criada com sucesso!', 'Sucesso');
        this.isModalOpen.set(false);
      } else {
        await this.notificationService.alert(`Erro ao salvar reserva: ${error?.message}`);
      }
    }
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
