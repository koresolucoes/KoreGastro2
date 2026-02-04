
import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UnitContextService } from '../../../services/unit-context.service';
import { SettingsDataService } from '../../../services/settings-data.service';
import { NotificationService } from '../../../services/notification.service';
import { SubscriptionStateService } from '../../../services/subscription-state.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-store-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './store-management.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoreManagementComponent implements OnInit {
  unitContextService = inject(UnitContextService);
  settingsDataService = inject(SettingsDataService);
  notificationService = inject(NotificationService);
  subscriptionState = inject(SubscriptionStateService);
  authService = inject(AuthService);

  stores = this.unitContextService.availableUnits;
  activeStoreId = this.unitContextService.activeUnitId;
  
  // Computed values from Subscription State
  currentPlan = this.subscriptionState.currentPlan;
  ownerStoreCount = this.subscriptionState.ownerStoreCount;
  
  maxStoresAllowed = computed(() => {
      const plan = this.currentPlan();
      // Default to 1 if no plan or unlimited if high number
      return plan?.max_stores || 1; 
  });

  // Modal State
  isModalOpen = signal(false);
  editingStore = signal<{ id: string, name: string } | null>(null);
  storeNameInput = signal('');
  isSaving = signal(false);

  ngOnInit() {
      // Logic removed: The SubscriptionStateService already has an effect that loads 
      // subscription data whenever the active unit changes. Calling it here manually
      // was causing a race condition/loop.
  }

  switchToStore(storeId: string) {
      this.unitContextService.setUnit(storeId);
  }

  openCreateModal() {
      this.editingStore.set(null);
      this.storeNameInput.set('');
      this.isModalOpen.set(true);
  }

  openEditModal(store: { id: string, name: string }) {
      this.editingStore.set(store);
      this.storeNameInput.set(store.name);
      this.isModalOpen.set(true);
  }

  closeModal() {
      this.isModalOpen.set(false);
  }

  async saveStore() {
      const name = this.storeNameInput().trim();
      if (!name) return;

      this.isSaving.set(true);
      
      try {
          if (this.editingStore()) {
              const { success, error } = await this.settingsDataService.updateCompanyProfile({ company_name: name });
              
              if (success) {
                  this.notificationService.show('Nome da loja atualizado.', 'success');
                  // Reload context to reflect changes
                  await this.unitContextService.loadContext(this.authService.currentUser()?.id!);
                  this.closeModal();
              } else {
                  throw new Error(error?.message);
              }

          } else {
              // Create New
              const { success, message, store_id } = await this.settingsDataService.createNewStore(name);
              
              if (success) {
                  this.notificationService.show('Loja criada com sucesso!', 'success');
                  await this.unitContextService.loadContext(this.authService.currentUser()?.id!);
                  
                  // Optional: Switch to new store
                  if (store_id) {
                      const confirmSwitch = await this.notificationService.confirm('Deseja acessar a nova loja agora?', 'Loja Criada');
                      if (confirmSwitch) {
                          this.switchToStore(store_id);
                      }
                  }
                  this.closeModal();
              } else {
                  throw new Error(message);
              }
          }
      } catch (e: any) {
          this.notificationService.show(`Erro: ${e.message}`, 'error');
      } finally {
          this.isSaving.set(false);
      }
  }

  async deleteStore(store: { id: string, name: string }) {
      const confirmed = await this.notificationService.confirm(
          `Tem certeza que deseja excluir a loja "${store.name}"? Todos os dados (pedidos, estoque, funcionários) serão apagados permanentemente.`, 
          'Excluir Loja'
      );

      if (confirmed) {
          // Double confirmation
          const doubleCheck = await this.notificationService.prompt(
              `Digite o nome da loja ("${store.name}") para confirmar a exclusão.`, 
              'Confirmação de Segurança',
              { placeholder: store.name, confirmText: 'EXCLUIR' }
          );

          if (doubleCheck.confirmed && doubleCheck.value === store.name) {
              const { success, message } = await this.settingsDataService.deleteStore(store.id);
              if (success) {
                  this.notificationService.show('Loja excluída com sucesso.', 'success');
                  // If we deleted the active store, reload context will handle fallback
                  if (this.activeStoreId() === store.id) {
                      localStorage.removeItem('chefos_active_unit');
                      window.location.reload();
                  } else {
                      await this.unitContextService.loadContext(this.authService.currentUser()?.id!);
                  }
              } else {
                  this.notificationService.show(`Erro ao excluir: ${message}`, 'error');
              }
          } else if (doubleCheck.confirmed) {
              this.notificationService.show('Nome incorreto. Ação cancelada.', 'warning');
          }
      }
  }
}
