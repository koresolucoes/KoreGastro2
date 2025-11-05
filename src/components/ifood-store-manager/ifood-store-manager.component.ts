import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IfoodMenuService, IfoodMerchantStatus, IfoodInterruption, IfoodOpeningHours } from '../../services/ifood-menu.service';
import { NotificationService } from '../../services/notification.service';

interface WeeklyHoursForm {
  dayOfWeek: IfoodOpeningHours['dayOfWeek'];
  dayName: string;
  openingTime: string; // HH:mm
  closingTime: string; // HH:mm
  is_closed: boolean;
}

@Component({
  selector: 'app-ifood-store-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './ifood-store-manager.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IfoodStoreManagerComponent implements OnInit {
  private ifoodMenuService = inject(IfoodMenuService);
  private notificationService = inject(NotificationService);

  isLoadingStatus = signal(true);
  isLoadingInterruptions = signal(true);
  isLoadingHours = signal(true);
  isSaving = signal(false);

  status = signal<IfoodMerchantStatus | null>(null);
  interruptions = signal<IfoodInterruption[]>([]);
  
  isInterruptionModalOpen = signal(false);
  editingInterruption = signal<{ start: string; end: string; description: string }>({ start: '', end: '', description: '' });

  daysOfWeekMap = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  dayOfWeekApiMap: IfoodOpeningHours['dayOfWeek'][] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

  weeklyHoursForm = signal<WeeklyHoursForm[]>([]);

  isLoading = computed(() => this.isLoadingStatus() || this.isLoadingInterruptions() || this.isLoadingHours());

  storeState = computed(() => {
    const s = this.status();
    if (!s) return { state: 'DESCONHECIDO', message: 'Carregando...', color: 'bg-gray-500' };

    switch (s.state) {
      case 'OPEN':
        return { state: 'ABERTA', message: s.message || 'Loja aberta e recebendo pedidos.', color: 'bg-green-500' };
      case 'INTERRUPTED':
        return { state: 'INTERROMPIDA', message: s.message || 'Loja fechada temporariamente.', color: 'bg-yellow-500' };
      case 'CLOSED':
        return { state: 'FECHADA', message: s.message || 'Loja fechada.', color: 'bg-red-500' };
      default:
        return { state: 'DESCONHECIDO', message: s.message || 'Status desconhecido.', color: 'bg-gray-500' };
    }
  });

  ngOnInit() {
    this.loadAllData();
  }

  async loadAllData() {
    this.isLoadingStatus.set(true);
    this.isLoadingInterruptions.set(true);
    this.isLoadingHours.set(true);
    try {
      const [status, interruptions, hours] = await Promise.all([
        this.ifoodMenuService.getMerchantStatus(),
        this.ifoodMenuService.getInterruptions(),
        this.ifoodMenuService.getOpeningHours()
      ]);

      this.status.set(status);
      this.interruptions.set(interruptions);
      this.initializeHoursForm(hours);

    } catch (error: any) {
      this.notificationService.show(`Erro ao carregar dados da loja iFood: ${error.message}`, 'error');
    } finally {
      this.isLoadingStatus.set(false);
      this.isLoadingInterruptions.set(false);
      this.isLoadingHours.set(false);
    }
  }

  initializeHoursForm(apiHours: IfoodOpeningHours[]) {
    const hoursMap = new Map(apiHours.map(h => [h.dayOfWeek, h]));
    const form = this.dayOfWeekApiMap.map((day, index) => {
      const existing = hoursMap.get(day);
      if (existing) {
        const [h, m] = existing.start.split(':').map(Number);
        
        // Use a base date for time calculations, avoiding timezone issues by using UTC methods
        const startDate = new Date(0);
        startDate.setUTCHours(h, m, 0, 0);

        const endDate = new Date(startDate.getTime() + existing.duration * 60000); // duration is in minutes
        
        const closingTime = `${String(endDate.getUTCHours()).padStart(2, '0')}:${String(endDate.getUTCMinutes()).padStart(2, '0')}`;

        return {
          dayOfWeek: day,
          dayName: this.daysOfWeekMap[index],
          openingTime: existing.start.slice(0, 5), // Keep HH:mm format for input
          closingTime: closingTime,
          is_closed: false
        };
      } else {
        return {
          dayOfWeek: day,
          dayName: this.daysOfWeekMap[index],
          openingTime: '09:00', // Sensible default
          closingTime: '22:00', // Sensible default
          is_closed: true
        };
      }
    });
    this.weeklyHoursForm.set(form);
  }

  updateWeeklyHours(index: number, field: 'openingTime' | 'closingTime' | 'is_closed', value: any) {
    this.weeklyHoursForm.update(currentForm => {
      const newForm = [...currentForm];
      const dayToUpdate = { ...newForm[index] };
      (dayToUpdate as any)[field] = value;
      newForm[index] = dayToUpdate;
      return newForm;
    });
  }

  async saveOpeningHours() {
    this.isSaving.set(true);
    try {
      const formValue = this.weeklyHoursForm();
      const shiftsToSave: IfoodOpeningHours[] = formValue
        .filter(day => !day.is_closed)
        .map(day => {
          const [openH, openM] = day.openingTime.split(':').map(Number);
          const [closeH, closeM] = day.closingTime.split(':').map(Number);

          const openDate = new Date(0);
          openDate.setUTCHours(openH, openM, 0, 0);

          const closeDate = new Date(0);
          closeDate.setUTCHours(closeH, closeM, 0, 0);
          
          // Handle cases where closing time is on the next day (e.g., 22:00 to 02:00)
          if (closeDate <= openDate) {
            closeDate.setUTCDate(closeDate.getUTCDate() + 1);
          }

          const durationInMinutes = (closeDate.getTime() - openDate.getTime()) / 60000;

          return {
            dayOfWeek: day.dayOfWeek,
            start: `${day.openingTime}:00`, // Format as HH:mm:ss
            duration: durationInMinutes,
          };
        });

      await this.ifoodMenuService.updateOpeningHours(shiftsToSave);
      this.notificationService.show('Horário de funcionamento atualizado com sucesso!', 'success');
      this.loadAllData(); // Refresh data from iFood
    } catch (error: any) {
      this.notificationService.show(`Erro ao salvar horários: ${error.message}`, 'error');
    } finally {
      this.isSaving.set(false);
    }
  }

  openInterruptionModal() {
    const now = new Date();
    const start = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    now.setHours(now.getHours() + 1);
    const end = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);

    this.editingInterruption.set({ start, end, description: '' });
    this.isInterruptionModalOpen.set(true);
  }

  closeInterruptionModal() {
    this.isInterruptionModalOpen.set(false);
  }

  async saveInterruption() {
    this.isSaving.set(true);
    const form = this.editingInterruption();
    try {
      if (!form.start || !form.end) throw new Error('Data e hora de início e fim são obrigatórias.');
      const startISO = new Date(form.start).toISOString();
      const endISO = new Date(form.end).toISOString();
      if (new Date(startISO) >= new Date(endISO)) throw new Error('A data de fim deve ser posterior à data de início.');

      await this.ifoodMenuService.createInterruption({ start: startISO, end: endISO, description: form.description || 'Pausa na operação.' });
      this.notificationService.show('Interrupção agendada com sucesso!', 'success');
      this.loadAllData();
      this.closeInterruptionModal();
    } catch (error: any) {
      this.notificationService.show(`Erro: ${error.message}`, 'error');
    } finally {
      this.isSaving.set(false);
    }
  }

  async deleteInterruption(id: string) {
    const confirmed = await this.notificationService.confirm('Tem certeza que deseja remover esta interrupção?');
    if (!confirmed) return;
    
    this.isSaving.set(true);
    try {
      await this.ifoodMenuService.deleteInterruption(id);
      this.notificationService.show('Interrupção removida.', 'success');
      this.loadAllData();
    } catch (error: any) {
      this.notificationService.show(`Erro ao remover: ${error.message}`, 'error');
    } finally {
      this.isSaving.set(false);
    }
  }
}