import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IfoodMenuService, IfoodMerchantStatus, IfoodInterruption, IfoodOpeningHours } from '../../services/ifood-menu.service';
import { NotificationService } from '../../services/notification.service';
import { SettingsDataService } from '../../services/settings-data.service';
import { supabase } from '../../services/supabase-client';
import { environment } from '../../config/environment';

interface IfoodIntegrationRequest {
  id: string;
  supportTicketId: string | null;
  storeCnpj: string | null;
  claimedMerchantId: string | null;
  status: string;
  createdAt: string;
}

interface ShiftForm {
  id: string; // A temporary ID for Angular's trackBy
  openingTime: string;
  closingTime: string;
}

interface WeeklyHoursForm {
  dayOfWeek: IfoodOpeningHours['dayOfWeek'];
  dayName: string;
  is_closed: boolean;
  shifts: ShiftForm[];
}

@Component({
  selector: 'app-ifood-store-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, RouterLink],
  templateUrl: './ifood-store-manager.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IfoodStoreManagerComponent implements OnInit {
  private ifoodMenuService = inject(IfoodMenuService);
  private notificationService = inject(NotificationService);

  private settingsDataService = inject(SettingsDataService);
  hasMerchantId = signal(false);
  isLoadingStatus = signal(true);
  isLoadingInterruptions = signal(true);
  isLoadingHours = signal(true);
  isSaving = signal(false);
  integrationRequest = signal<IfoodIntegrationRequest | null>(null);
  isLoadingIntegrationRequest = signal(false);
  merchantIdInput = '';
  cnpjInput = '';
  canSubmitIntegrationRequest = computed(() => {
    const status = this.integrationRequest()?.status;
    return !status || ['REJECTED', 'CANCELLED', 'NEEDS_INFORMATION'].includes(status);
  });

  status = signal<IfoodMerchantStatus[] | null>(null);
  interruptions = signal<IfoodInterruption[]>([]);
  
  isInterruptionModalOpen = signal(false);
  editingInterruption = signal<{ start: string; end: string; description: string }>({ start: '', end: '', description: '' });

  daysOfWeekMap = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  dayOfWeekApiMap: IfoodOpeningHours['dayOfWeek'][] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

  weeklyHoursForm = signal<WeeklyHoursForm[]>([]);

  isLoading = computed(() => this.isLoadingStatus() || this.isLoadingInterruptions() || this.isLoadingHours());

  storeState = computed(() => {
    const statuses = this.status();
    if (!statuses || statuses.length === 0) {
      return { state: 'DESCONHECIDO', message: 'Carregando...', color: 'bg-surface border border-subtle text-muted' };
    }
    
    // Assume the first status in the array is the primary one for the store.
    const mainStatus = statuses[0];

    // Use the title from the API message object for a more user-friendly status.
    const message = mainStatus.message.title || 'Status não informado.';

    switch (mainStatus.state) {
      case 'OK':
        return { state: 'ABERTA', message: message, color: 'bg-success/10 border border-success/20 text-success' };
      case 'WARNING':
        return { state: 'ALERTA', message: message, color: 'bg-warning/10 border border-warning/20 text-warning' };
      case 'ERROR':
        return { state: 'FECHADA (ERRO)', message: message, color: 'bg-danger/10 border border-danger/20 text-danger' };
      case 'CLOSED':
        return { state: 'FECHADA', message: message, color: 'bg-surface border border-subtle text-muted' };
      default:
        return { state: 'DESCONHECIDO', message: message, color: 'bg-surface border border-subtle text-muted' };
    }
  });

  ngOnInit() {
    void this.loadIntegrationRequest();
  }

  integrationStatusLabel(status: string) {
    const labels: Record<string, string> = {
      SUBMITTED: 'Solicitação recebida',
      ACCESS_REQUESTED: 'Acesso solicitado ao iFood',
      WAITING_MERCHANT_APPROVAL: 'Aguardando aprovação do responsável',
      APPROVED_PENDING_VERIFICATION: 'Aprovação recebida, aguardando ativação',
      CONNECTED: 'Conectada',
      NEEDS_INFORMATION: 'Atualize os dados solicitados pelo suporte',
      REJECTED: 'Solicitação encerrada',
      CANCELLED: 'Solicitação cancelada',
    };
    return labels[status] || status;
  }

  integrationStatusMessage(status: string) {
    const messages: Record<string, string> = {
      SUBMITTED: 'O suporte ChefOS recebeu seu pedido e vai iniciar o processo de conexão.',
      ACCESS_REQUESTED: 'A equipe solicitou o acesso. O responsável pela conta iFood precisa aprovar a integração no Portal do Parceiro.',
      WAITING_MERCHANT_APPROVAL: 'Peça ao responsável pela conta iFood que aprove o ChefOS no Portal do Parceiro.',
      APPROVED_PENDING_VERIFICATION: 'O responsável informou que aprovou o acesso. A equipe ChefOS está confirmando o Merchant ID e ativará a integração manualmente.',
      CONNECTED: 'A conexão foi ativada pela equipe ChefOS. Atualize o painel para carregar os recursos do iFood.',
      NEEDS_INFORMATION: 'A equipe ChefOS pediu dados adicionais. Corrija o Merchant ID ou o CNPJ abaixo e reenvie.',
      REJECTED: 'A solicitação foi encerrada. Confira o chamado de suporte antes de enviar um novo pedido.',
      CANCELLED: 'Esta solicitação foi cancelada.',
    };
    return messages[status] || 'A equipe ChefOS atualizará o andamento pelo chamado de suporte.';
  }

  private async sendIntegrationRequest(payload: Record<string, unknown>) {
    const restaurantId = this.settingsDataService.getActiveUnitId();
    if (!restaurantId) throw new Error('Selecione uma unidade ChefOS antes de solicitar a integração.');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Sua sessão expirou. Entre novamente para solicitar a integração.');
    const response = await fetch(environment.apiBaseUrl.replace(/\/$/, '') + '/api/ifood-integration-requests', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, restaurantId }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error?.message || 'Não foi possível enviar a solicitação iFood.');
    return result;
  }

  async loadIntegrationRequest() {
    this.isLoadingIntegrationRequest.set(true);
    try {
      const result = await this.sendIntegrationRequest({ action: 'status' });
      const wasConnected = this.hasMerchantId();
      this.integrationRequest.set(result.request || null);
      const connected = result.connection?.connected === true && !!result.connection?.merchantId;
      this.hasMerchantId.set(connected);
      if (connected && !wasConnected) void this.loadAllData();
      if (!connected && wasConnected) {
        this.status.set(null);
        this.interruptions.set([]);
        this.weeklyHoursForm.set([]);
      }
      if (result.request?.status === 'NEEDS_INFORMATION') {
        this.merchantIdInput = result.request.claimedMerchantId || '';
        this.cnpjInput = result.request.storeCnpj || '';
      }
    } catch (error: any) {
      this.notificationService.show(error?.message || 'Não foi possível carregar o status da integração iFood.', 'error');
    } finally {
      this.isLoadingIntegrationRequest.set(false);
    }
  }

  async submitIntegrationRequest() {
    const merchantId = this.merchantIdInput.trim();
    const cnpj = this.cnpjInput.replace(/\D/g, '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(merchantId)) {
      this.notificationService.show('Informe o Merchant ID UUID exibido no Portal do Parceiro iFood.', 'warning');
      return;
    }
    if (cnpj && !/^\d{14}$/.test(cnpj)) {
      this.notificationService.show('O CNPJ deve conter 14 números ou ficar em branco.', 'warning');
      return;
    }
    const current = this.integrationRequest();
    if (current && !['REJECTED', 'CANCELLED', 'NEEDS_INFORMATION'].includes(current.status)) {
      this.notificationService.show('Sua solicitação já está em andamento. Atualize o status ou acompanhe o chamado.', 'info');
      return;
    }

    this.isSaving.set(true);
    try {
      const action = current?.status === 'NEEDS_INFORMATION' ? 'clientUpdate' : 'create';
      const payload: Record<string, unknown> = {
        action, merchantId,
        ...(cnpj ? { cnpj } : {}),
        ...(action === 'clientUpdate' ? { requestId: current?.id } : {}),
      };
      const result = await this.sendIntegrationRequest(payload);
      this.integrationRequest.set(result.request || null);
      this.notificationService.show(
        action === 'clientUpdate' ? 'Dados atualizados no chamado. A equipe ChefOS continuará a validação.' : 'Solicitação enviada. Acompanhe o andamento por este painel e pelo chamado de suporte.',
        'success',
      );
    } catch (error: any) {
      this.notificationService.show(error?.message || 'Não foi possível enviar os dados da integração iFood.', 'error');
    } finally {
      this.isSaving.set(false);
    }
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
      if (error.message.includes('No valid token') || error.message.includes('401') || error.message.includes('authorize the app')) {
        this.notificationService.show('A integração está ativada, mas a API do iFood ainda não liberou esta operação. Abra um chamado para o suporte ChefOS.', 'warning');
      } else {
        this.notificationService.show(`Erro ao carregar dados da loja iFood: ${error.message}`, 'error');
      }
    } finally {
      this.isLoadingStatus.set(false);
      this.isLoadingInterruptions.set(false);
      this.isLoadingHours.set(false);
    }
  }

  initializeHoursForm(apiHours: IfoodOpeningHours[]) {
    // Group shifts by day
    const hoursByDay = new Map<IfoodOpeningHours['dayOfWeek'], IfoodOpeningHours[]>();
    for (const shift of apiHours) {
      if (!hoursByDay.has(shift.dayOfWeek)) {
        hoursByDay.set(shift.dayOfWeek, []);
      }
      hoursByDay.get(shift.dayOfWeek)!.push(shift);
    }

    const form = this.dayOfWeekApiMap.map((day, index) => {
      const existingShifts = hoursByDay.get(day);
      if (existingShifts && existingShifts.length > 0) {
        const shifts: ShiftForm[] = existingShifts.map((s, shiftIndex) => {
          const [h, m] = s.start.split(':').map(Number);
          const startDate = new Date(0);
          startDate.setUTCHours(h, m, 0, 0);
          const endDate = new Date(startDate.getTime() + s.duration * 60000); // duration is in minutes
          const closingTime = `${String(endDate.getUTCHours()).padStart(2, '0')}:${String(endDate.getUTCMinutes()).padStart(2, '0')}`;
          return {
            id: `shift-${day}-${shiftIndex}-${Date.now()}`,
            openingTime: s.start.slice(0, 5),
            closingTime: closingTime,
          };
        });

        return {
          dayOfWeek: day,
          dayName: this.daysOfWeekMap[index],
          is_closed: false,
          shifts: shifts,
        };
      } else {
        return {
          dayOfWeek: day,
          dayName: this.daysOfWeekMap[index],
          is_closed: true,
          shifts: [],
        };
      }
    });
    this.weeklyHoursForm.set(form);
  }

  updateWeeklyHours(index: number, field: 'is_closed', value: boolean) {
    this.weeklyHoursForm.update(currentForm => {
      const newForm = [...currentForm];
      const dayToUpdate = { ...newForm[index] };
      dayToUpdate.is_closed = value;

      // If opening a day that has no shifts, add one by default
      if (!value && dayToUpdate.shifts.length === 0) {
        dayToUpdate.shifts.push({ id: `new-shift-${Date.now()}`, openingTime: '09:00', closingTime: '18:00' });
      }
      
      newForm[index] = dayToUpdate;
      return newForm;
    });
  }

  addShift(dayIndex: number) {
    this.weeklyHoursForm.update(currentForm => {
      const newForm = [...currentForm];
      newForm[dayIndex].shifts.push({ id: `new-shift-${Date.now()}`, openingTime: '09:00', closingTime: '18:00' });
      return newForm;
    });
  }

  removeShift(dayIndex: number, shiftId: string) {
    this.weeklyHoursForm.update(currentForm => {
      const newForm = [...currentForm];
      newForm[dayIndex].shifts = newForm[dayIndex].shifts.filter(s => s.id !== shiftId);
      return newForm;
    });
  }

  updateShiftTime(dayIndex: number, shiftId: string, field: 'openingTime' | 'closingTime', value: string) {
    this.weeklyHoursForm.update(currentForm => {
      const newForm = [...currentForm];
      newForm[dayIndex].shifts = newForm[dayIndex].shifts.map(s => 
        s.id === shiftId ? { ...s, [field]: value } : s
      );
      return newForm;
    });
  }

  async saveOpeningHours() {
    this.isSaving.set(true);
    try {
      const formValue = this.weeklyHoursForm();
      const shiftsToSave: IfoodOpeningHours[] = formValue
        .filter(day => !day.is_closed)
        .flatMap(day => 
          day.shifts.map(shift => {
            const [openH, openM] = shift.openingTime.split(':').map(Number);
            const [closeH, closeM] = shift.closingTime.split(':').map(Number);

            const openDate = new Date(0);
            openDate.setUTCHours(openH, openM, 0, 0);

            const closeDate = new Date(0);
            closeDate.setUTCHours(closeH, closeM, 0, 0);
            
            if (closeDate <= openDate) {
              closeDate.setUTCDate(closeDate.getUTCDate() + 1);
            }

            const durationInMinutes = (closeDate.getTime() - openDate.getTime()) / 60000;

            return {
              dayOfWeek: day.dayOfWeek,
              start: `${shift.openingTime}:00`,
              duration: durationInMinutes,
            };
          })
        );

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