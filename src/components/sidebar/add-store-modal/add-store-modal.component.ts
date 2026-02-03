
import { Component, ChangeDetectionStrategy, output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../services/auth.service';
import { SettingsDataService } from '../../../services/settings-data.service';
import { NotificationService } from '../../../services/notification.service';
import { UnitContextService } from '../../../services/unit-context.service';

@Component({
  selector: 'app-add-store-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './add-store-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddStoreModalComponent {
  authService = inject(AuthService);
  settingsDataService = inject(SettingsDataService);
  notificationService = inject(NotificationService);
  unitContextService = inject(UnitContextService);
  
  closeModal = output<void>();

  currentUserEmail = this.authService.currentUser()?.email || '';
  activeTab = signal<'create' | 'link'>('create');
  
  newStoreName = signal('');
  isCreating = signal(false);

  copyEmail() {
    navigator.clipboard.writeText(this.currentUserEmail);
    this.notificationService.show('E-mail copiado!', 'success');
  }

  async createStore() {
      const name = this.newStoreName().trim();
      if (!name) return;

      this.isCreating.set(true);
      const { success, message, store_id } = await this.settingsDataService.createNewStore(name);
      
      if (success && store_id) {
          this.notificationService.show('Loja criada com sucesso!', 'success');
          // Reload context to see the new store immediately
          await this.unitContextService.loadContext(this.authService.currentUser()?.id!);
          
          // Switch to new store? Optional. Let's just close modal.
          this.closeModal.emit();
      } else {
          await this.notificationService.alert(`Erro ao criar loja: ${message}`);
      }
      this.isCreating.set(false);
  }
}
