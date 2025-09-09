import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, input, output, InputSignal, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Customer, Order, LoyaltyMovement } from '../../../models/db.models';
import { SettingsDataService } from '../../../services/settings-data.service';
import { NotificationService } from '../../../services/notification.service';

@Component({
  selector: 'app-customer-details-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './customer-details-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerDetailsModalComponent {
  customer: InputSignal<Customer> = input.required<Customer>();
  close: OutputEmitterRef<void> = output<void>();

  private settingsDataService = inject(SettingsDataService);
  private notificationService = inject(NotificationService);

  activeTab = signal<'details' | 'history' | 'loyalty'>('details');
  isLoadingHistory = signal(false);
  consumptionHistory = signal<Order[]>([]);
  loyaltyMovements = signal<LoyaltyMovement[]>([]);

  constructor() {
    effect(() => {
      // This effect runs when the customer input changes.
      const cust = this.customer();
      this.consumptionHistory.set([]);
      this.loyaltyMovements.set([]);
      if (this.activeTab() === 'history') {
        this.loadConsumptionHistory(cust.id);
      }
      if (this.activeTab() === 'loyalty') {
        this.loadLoyaltyHistory(cust.id);
      }
    }, { allowSignalWrites: true });

    effect(() => {
        // This effect runs when the active tab changes.
        const tab = this.activeTab();
        const custId = this.customer().id;
        if (tab === 'history' && this.consumptionHistory().length === 0) {
            this.loadConsumptionHistory(custId);
        }
        if (tab === 'loyalty' && this.loyaltyMovements().length === 0) {
            this.loadLoyaltyHistory(custId);
        }
    });
  }

  async loadConsumptionHistory(customerId: string) {
    this.isLoadingHistory.set(true);
    const { data, error } = await this.settingsDataService.getConsumptionHistory(customerId);
    if (error) {
      this.notificationService.show('Erro ao carregar histórico de consumo.', 'error');
      this.consumptionHistory.set([]);
    } else {
      this.consumptionHistory.set(data || []);
    }
    this.isLoadingHistory.set(false);
  }
  
  async loadLoyaltyHistory(customerId: string) {
    this.isLoadingHistory.set(true);
    const { data, error } = await this.settingsDataService.getLoyaltyMovements(customerId);
    if (error) {
        this.notificationService.show('Erro ao carregar histórico de pontos.', 'error');
        this.loyaltyMovements.set([]);
    } else {
        this.loyaltyMovements.set(data || []);
    }
    this.isLoadingHistory.set(false);
  }
  
  getOrderTotal(order: Order): number {
    return order.order_items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }
}
