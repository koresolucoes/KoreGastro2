
import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsDataService } from '../../../services/settings-data.service';
import { NotificationService } from '../../../services/notification.service';
import { StoreManager } from '../../../models/app.models';
import { UnitContextService } from '../../../services/unit-context.service';

@Component({
  selector: 'app-multi-unit-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './multi-unit-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MultiUnitSettingsComponent implements OnInit {
  private settingsDataService = inject(SettingsDataService);
  private notificationService = inject(NotificationService);
  private unitContext = inject(UnitContextService);

  isLoading = signal(true);
  managers = signal<StoreManager[]>([]);
  
  inviteEmail = signal('');
  isInviting = signal(false);

  ngOnInit() {
    this.loadManagers();
  }

  async loadManagers() {
    this.isLoading.set(true);
    const { data, error } = await this.settingsDataService.getStoreManagers();
    if (error) {
      console.error('Erro ao carregar gestores:', error);
    } else {
      this.managers.set(data);
    }
    this.isLoading.set(false);
  }

  async inviteManager() {
    const email = this.inviteEmail().trim();
    if (!email) return;

    // Check if it's a valid email format (basic check)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        this.notificationService.show('Formato de e-mail inválido.', 'warning');
        return;
    }

    this.isInviting.set(true);
    const { success, message } = await this.settingsDataService.inviteManager(email, 'manager');
    
    if (success) {
      this.notificationService.show(message, 'success');
      this.inviteEmail.set('');
      this.loadManagers();
    } else {
      await this.notificationService.alert(`Erro: ${message}`);
    }
    this.isInviting.set(false);
  }

  async removeManager(manager: StoreManager) {
    const confirmed = await this.notificationService.confirm(`Tem certeza que deseja remover o acesso de ${manager.manager_name} (${manager.manager_email})?`);
    if (confirmed) {
      const { success, error } = await this.settingsDataService.removeManager(manager.permission_id);
      if (success) {
        this.notificationService.show('Acesso removido com sucesso.', 'success');
        this.loadManagers();
      } else {
        this.notificationService.show(`Erro ao remover: ${error?.message}`, 'error');
      }
    }
  }

  // Helper for template
  isCurrentUnitOwner(): boolean {
      // Typically, if I can see this screen, I am a manager. 
      // But only the owner or main admin should ideally remove others.
      // For now, we assume anyone with access to Settings > Multi-Unit can manage.
      return true; 
  }
}
