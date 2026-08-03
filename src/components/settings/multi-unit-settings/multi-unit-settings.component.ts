
import { Component, ChangeDetectionStrategy, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsDataService } from '../../../services/settings-data.service';
import { NotificationService } from '../../../services/notification.service';
import { StoreManager } from '../../../models/app.models';
import { UnitContextService } from '../../../services/unit-context.service';
import { RecipeDataService } from '../../../services/recipe-data.service';
import { SupabaseStateService } from '../../../services/supabase-state.service';

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
  unitContext = inject(UnitContextService);
  private recipeDataService = inject(RecipeDataService);
  private supabaseState = inject(SupabaseStateService);

  isLoading = signal(true);
  managers = signal<StoreManager[]>([]);
  
  inviteEmail = signal('');
  isInviting = signal(false);

  // Menu Cloning
  selectedSourceStoreId = signal('');
  isCloning = signal(false);

  // Store Creation
  newStoreName = signal('');
  isCreatingStore = signal(false);

  otherUnits = computed(() => 
    this.unitContext.availableUnits().filter(u => u.id !== this.unitContext.activeUnitId())
  );

  ngOnInit() {
    this.loadManagers();
  }

  async createStore() {
    const name = this.newStoreName().trim();
    if (!name) {
      this.notificationService.show('Informe o nome da nova unidade.', 'warning');
      return;
    }

    this.isCreatingStore.set(true);
    const res = await this.settingsDataService.createNewStore(name);
    if (res.success) {
      this.notificationService.show(`Unidade "${name}" criada com sucesso!`, 'success');
      this.newStoreName.set('');
      const currentUserId = this.unitContext.activeUnitId();
      if (currentUserId) {
        await this.unitContext.loadContext(currentUserId);
      }
    } else {
      this.notificationService.show(`Erro ao criar unidade: ${res.message || 'Falha na criação'}`, 'error');
    }
    this.isCreatingStore.set(false);
  }

  async cloneMenu() {
    const sourceStoreId = this.selectedSourceStoreId();
    const targetStoreId = this.unitContext.activeUnitId();
    if (!sourceStoreId) {
      this.notificationService.show('Selecione uma loja de origem para clonar.', 'warning');
      return;
    }
    if (!targetStoreId) return;

    const sourceStore = this.unitContext.availableUnits().find(u => u.id === sourceStoreId);
    const confirm = await this.notificationService.confirm(
      `Tem certeza que deseja clonar o cardápio e insumos da unidade "${sourceStore?.name || sourceStoreId}" para esta unidade?`
    );
    if (!confirm) return;

    this.isCloning.set(true);
    const res = await this.recipeDataService.cloneStoreData(sourceStoreId, targetStoreId);
    if (res.success) {
      this.notificationService.show('Cardápio, preparos e insumos clonados com sucesso!', 'success');
      this.selectedSourceStoreId.set('');
      await this.supabaseState.loadEssentialData();
    } else {
      this.notificationService.show(`Erro ao clonar: ${res.message || 'Falha ao duplicar dados'}`, 'error');
    }
    this.isCloning.set(false);
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
