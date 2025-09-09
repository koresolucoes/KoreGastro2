import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, input, output, InputSignal, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Customer, Order } from '../../../models/db.models';
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

  activeTab = signal<'details' | 'history'>('details');
  isLoadingHistory = signal(false);
  consumptionHistory = signal<Order[]>([]);

  constructor() {
    effect(() => {
      // This effect runs when the customer input changes.
      // We reset the history and if the history tab is already active, we reload the data.
      const cust = this.customer();
      this.consumptionHistory.set([]);
      if (this.activeTab() === 'history') {
        this.loadHistory(cust.id);
      }
    }, { allowSignalWrites: true });

    effect(() => {
        // This effect runs when the active tab changes.
        // It loads the history only when the tab is switched to 'history' for the first time.
        if(this.activeTab() === 'history' && this.consumptionHistory().length === 0) {
            this.loadHistory(this.customer().id);
        }
    });
  }

  async loadHistory(customerId: string) {
    this.isLoadingHistory.set(true);
    const { data, error } = await this.settingsDataService.getConsumptionHistory(customerId);
    if (error) {
      this.notificationService.show('Erro ao carregar histórico.', 'error');
      this.consumptionHistory.set([]);
    } else {
      this.consumptionHistory.set(data || []);
    }
    this.isLoadingHistory.set(false);
  }
  
  getOrderTotal(order: Order): number {
    return order.order_items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }
}