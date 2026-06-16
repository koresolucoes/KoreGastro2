import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { SettingsStateService } from '../../services/settings-state.service';
import { ReservationDataService } from '../../services/reservation-data.service';
import { Reservation, ReservationStatus } from '../../models/db.models';
import { NotificationService } from '../../services/notification.service';
import { OperationalAuthService } from '../../services/operational-auth.service';
import { ReservationModalComponent } from './reservation-modal.component';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { PrintingService } from '../../services/printing.service';
import { PosStateService } from '../../services/pos-state.service';
import { PosDataService } from '../../services/pos-data.service';

@Component({
  selector: 'app-reservations',
  standalone: true,
  imports: [CommonModule, ReservationModalComponent, DatePipe],
  templateUrl: './reservations.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReservationsComponent implements OnInit {
  settingsState = inject(SettingsStateService);
  reservationDataService = inject(ReservationDataService);
  notificationService = inject(NotificationService);
  operationalAuthService = inject(OperationalAuthService);
  supabaseStateService = inject(SupabaseStateService);
  printingService = inject(PrintingService);
  posState = inject(PosStateService);
  posDataService = inject(PosDataService);

  activeView = signal<'daily' | 'overview'>('daily');
  selectedDate = signal(new Date().toISOString().split('T')[0]);

  getTableName(tableId: string | undefined | null) {
    if (!tableId) return '';
    const table = this.posState.tables().find(t => t.id === tableId);
    return table ? `Mesa ${table.number}` : '';
  }

  // Modal State
  isModalOpen = signal(false);
  reservationForModal = signal<Partial<Reservation> | null>(null);

  ngOnInit() {
    this.supabaseStateService.loadBackOfficeData();
  }

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
  
  occupancyByHour = computed(() => {
    const reservations = this.reservationsForDay().filter(r => r.status === 'CONFIRMED' || r.status === 'PENDING' || r.status === 'COMPLETED');
    const hourlySummary = new Map<string, { count: number; pax: number; confirmed: number; pending: number }>();
    
    // Group by hour
    reservations.forEach(res => {
      const date = new Date(res.reservation_time);
      const hourKey = `${date.getHours().toString().padStart(2, '0')}:00`;
      
      if (!hourlySummary.has(hourKey)) {
        hourlySummary.set(hourKey, { count: 0, pax: 0, confirmed: 0, pending: 0 });
      }
      
      const stats = hourlySummary.get(hourKey)!;
      stats.count++;
      stats.pax += res.party_size || 0;
      
      if (res.status === 'CONFIRMED') stats.confirmed++;
      if (res.status === 'PENDING') stats.pending++;
    });
    
    return Array.from(hourlySummary.entries())
      .map(([hour, stats]) => ({ hour, ...stats }))
      .sort((a, b) => a.hour.localeCompare(b.hour));
  });

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

    if (status === 'CONFIRMED' && !reservation.customer_id) {
       let customerIdToLink = '';
       const existingCustomers = this.posState.customers();
       let match = null;
       if (reservation.customer_phone) {
           const cleanPhone = reservation.customer_phone.replace(/\D/g, '');
           match = existingCustomers.find(c => c.phone?.replace(/\D/g, '') === cleanPhone);
       }
       if (!match && reservation.customer_name) {
           match = existingCustomers.find(c => c.name.toLowerCase() === reservation.customer_name.toLowerCase());
       }

       if (match) {
           const link = await this.notificationService.confirm(`Encontramos um cadastro com este nome/telefone (${match.name}). Deseja vincular a reserva a este cliente?`, 'Vincular Cliente');
           if (link) {
               customerIdToLink = match.id;
           }
       } else {
           const create = await this.notificationService.confirm('Este cliente não está na sua base de clientes. Deseja criar um novo cadastro para ele?', 'Novo Cliente');
           if (create) {
               const { success, data, error } = await this.posDataService.createCustomer({
                   name: reservation.customer_name,
                   phone: reservation.customer_phone || undefined,
                   email: reservation.customer_email || undefined
               });
               if (success && data) {
                  customerIdToLink = data.id;
               } else {
                  await this.notificationService.alert('Falha ao criar cliente: ' + error?.message);
               }
           }
       }

       if (customerIdToLink) {
           const { success, error } = await this.reservationDataService.updateReservation(reservation.id, { customer_id: customerIdToLink, status: status });
           if (!success) {
               await this.notificationService.alert(`Erro ao atualizar reserva: ${error?.message}`);
           }
           return; 
       }
    }

    if (status === 'CANCELLED') {
        const reason = window.prompt("Motivo do cancelamento (opcional):", "");
        if (reason === null) return; // User pressed cancel on the prompt
        
        const { success, error } = await this.reservationDataService.updateReservation(reservation.id, {
          status: 'CANCELLED',
          cancellation_reason: reason || 'Cancelado manualmente'
        });
        if(!success) {
            await this.notificationService.alert(`Erro ao cancelar reserva: ${error?.message}`);
        }
        return;
    }

    const { success, error } = await this.reservationDataService.updateReservationStatus(reservation.id, status);
    if (!success) {
      await this.notificationService.alert(`Erro ao atualizar reserva: ${error?.message}`);
    }
  }

  async markCheckIn(reservation: Reservation) {
    const confirmed = await this.notificationService.confirm(`Registrar chegada de ${reservation.customer_name}?`, 'Confirmar Check-in');
    if (!confirmed) return;

    let finalCustomerId = reservation.customer_id;
    if (!finalCustomerId) {
       const existingCustomers = this.posState.customers();
       let match = null;
       if (reservation.customer_phone) {
           const cleanPhone = reservation.customer_phone.replace(/\D/g, '');
           match = existingCustomers.find(c => c.phone?.replace(/\D/g, '') === cleanPhone);
       }
       if (!match && reservation.customer_name) {
           match = existingCustomers.find(c => c.name.toLowerCase() === reservation.customer_name.toLowerCase());
       }

       if (match) {
           const link = await this.notificationService.confirm(`Este cliente existe na base (${match.name}). Deseja vincular?`, 'Vincular Cliente');
           if (link) finalCustomerId = match.id;
       } else {
           const create = await this.notificationService.confirm('Este cliente não está na sua base. Deseja cadastrá-lo agora para acompanhar histórico e fidelidade?', 'Cadastrar Cliente');
           if (create) {
               const { success, data } = await this.posDataService.createCustomer({
                   name: reservation.customer_name,
                   phone: reservation.customer_phone || undefined,
                   email: reservation.customer_email || undefined
               });
               if (success && data) finalCustomerId = data.id;
           }
       }
       
       if (finalCustomerId) {
           await this.reservationDataService.updateReservation(reservation.id, { customer_id: finalCustomerId });
           reservation.customer_id = finalCustomerId;
       }
    }

    if (reservation.table_id) {
       const table = this.posState.tables().find(t => t.id === reservation.table_id);
       if (table) {
           const existingOrder = this.posDataService.getOrderByTableNumber(table.number);
           if (!existingOrder) {
               const emp = this.operationalAuthService.activeEmployee();
               if (!emp) {
                   await this.notificationService.alert('Nenhum funcionário ativo para abrir a mesa.');
                   return;
               }
               const result = await this.posDataService.createOrderForTable(table, emp.id);
               if (result.success && result.data) {
                   if (finalCustomerId) {
                       await this.posDataService.associateCustomerToOrder(result.data.id, finalCustomerId);
                   }
                   if (reservation.party_size) {
                       await this.posDataService.updateTableCustomerCount(table.id, reservation.party_size);
                   }
               } else {
                   await this.notificationService.alert('Falha ao abrir a mesa automaticamente.');
               }
           } else {
               // Table already has an order, maybe just associate customer if empty?
               if (finalCustomerId && !existingOrder.customer_id) {
                   await this.posDataService.associateCustomerToOrder(existingOrder.id, finalCustomerId);
               }
           }
       }
    }

    const check_in_time = new Date().toISOString();
    const { success, error } = await this.reservationDataService.updateReservation(reservation.id, { check_in_time, status: 'COMPLETED' });
    if (!success) {
      await this.notificationService.alert(`Erro ao registrar check-in: ${error?.message}`);
    }
  }

  async markCheckOut(reservation: Reservation) {
    const confirmed = await this.notificationService.confirm(`Registrar saída de ${reservation.customer_name} e finalizar reserva?`, 'Confirmar Check-out');
    if (!confirmed) return;

    const check_out_time = new Date().toISOString();
    const { success, error } = await this.reservationDataService.updateReservation(reservation.id, { check_out_time, status: 'COMPLETED' });
    if (success) {
      // nothing
    } else {
      await this.notificationService.alert(`Erro ao registrar check-out: ${error?.message}`);
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

  printDailyReport() {
    const dateStr = this.selectedDate();
    const dayReservations = this.reservationsForDay();
    const confirmed = dayReservations.filter(r => r.status === 'CONFIRMED').length;
    const pending = dayReservations.filter(r => r.status === 'PENDING').length;
    
    let content = `
      <html>
      <head>
        <title>Relatório de Reservas - ${dateStr}</title>
        <style>
          body { font-family: sans-serif; padding: 20px; color: #333; }
          h1 { font-size: 24px; border-bottom: 2px solid #000; padding-bottom: 5px; }
          h2 { font-size: 18px; color: #666; }
          h3 { font-size: 16px; margin-top: 20px; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
          p { margin: 5px 0; font-size: 14px; }
          ul { list-style-type: none; padding: 0; }
          li { padding: 8px 0; border-bottom: 1px dashed #eee; font-size: 14px; }
          .time { font-weight: bold; width: 60px; display: inline-block; }
          .status-confirmada { color: green; font-weight: bold; font-size: 12px; }
          .status-pendente { color: orange; font-weight: bold; font-size: 12px; }
          .notes { font-style: italic; color: #666; font-size: 12px; display: block; margin-left: 65px; margin-top: 2px; }
        </style>
      </head>
      <body>
      <h1>Relatório de Reservas</h1>
      <h2>Data: ${dateStr.split('-').reverse().join('/')}</h2>
      <p><strong>Reservas Confirmadas:</strong> ${confirmed}</p>
      <p><strong>Reservas Pendentes:</strong> ${pending}</p>
      <p><strong>Total de Pessoas:</strong> ${dayReservations.reduce((acc, r) => acc + (r.status !== 'CANCELLED' ? (r.party_size || 0) : 0), 0)}</p>
      
      <h3>Resumo por Horário</h3>
      <ul>
    `;
    
    this.occupancyByHour().forEach(stat => {
        content += `<li><span class="time">${stat.hour}</span> ${stat.count} reservas (${stat.pax} pessoas) - Conf: ${stat.confirmed} | Pend: ${stat.pending}</li>`;
    });
    
    content += `</ul><h3>Lista de Reservas Ativas</h3>`;
    
    const activeR = dayReservations.filter(r => r.status === 'CONFIRMED' || r.status === 'PENDING').sort((a,b) => new Date(a.reservation_time).getTime() - new Date(b.reservation_time).getTime());
    
    if (activeR.length === 0) {
      content += `<p>Nenhuma reserva ativa para esta data.</p>`;
    }

    activeR.forEach(r => {
        const time = new Date(r.reservation_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const hasTable = r.table_id ? ` [Mesa: ${this.getTableName(r.table_id)}]` : '';
        const statusClass = r.status === 'CONFIRMED' ? 'status-confirmada' : 'status-pendente';
        const statusText = r.status === 'CONFIRMED' ? 'CONFIRMADA' : 'PENDENTE';
        content += `<p><span class="time">${time}</span> ${r.customer_name} (${r.party_size} pax)${hasTable} <span class="${statusClass}">[${statusText}]</span></p>`;
        if (r.notes) content += `<span class="notes">Obs: ${r.notes}</span>`;
    });
    
    content += `</body></html>`;
    
    this.printingService.printHtml(content);
  }
}

