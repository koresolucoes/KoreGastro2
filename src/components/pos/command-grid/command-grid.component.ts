
import { Component, ChangeDetectionStrategy, inject, signal, computed, output, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PosStateService } from '../../../services/pos-state.service';
import { PosDataService } from '../../../services/pos-data.service';
import { OperationalAuthService } from '../../../services/operational-auth.service';
import { NotificationService } from '../../../services/notification.service';
import { Order } from '../../../models/db.models';

@Component({
  selector: 'app-command-grid',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './command-grid.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommandGridComponent {
  posState = inject(PosStateService);
  posDataService = inject(PosDataService);
  operationalAuth = inject(OperationalAuthService);
  notificationService = inject(NotificationService);

  openTabClicked: OutputEmitterRef<Order> = output<Order>();

  tabs = this.posState.openTabs;
  searchTerm = signal('');
  
  // New Tab Modal
  isNewTabModalOpen = signal(false);
  newTabNumber = signal<number | null>(null);
  newTabName = signal('');
  isCreating = signal(false);

  filteredTabs = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const allTabs = this.tabs();
    
    if (!term) return allTabs.sort((a,b) => (a.command_number || 0) - (b.command_number || 0));

    return allTabs.filter(t => 
        (t.command_number?.toString().includes(term)) || 
        (t.tab_name?.toLowerCase().includes(term))
    ).sort((a,b) => (a.command_number || 0) - (b.command_number || 0));
  });

  getOrderTotal(order: Order): number {
      return order.order_items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  getDuration(timestamp: string): string {
      const start = new Date(timestamp).getTime();
      const now = Date.now();
      const diff = Math.floor((now - start) / 60000); // minutes
      
      if (diff < 60) return `${diff} min`;
      const hours = Math.floor(diff / 60);
      const mins = diff % 60;
      return `${hours}h ${mins}m`;
  }

  onTabClick(order: Order) {
      this.openTabClicked.emit(order);
  }

  openNewTabModal() {
      this.newTabNumber.set(null);
      this.newTabName.set('');
      this.isNewTabModalOpen.set(true);
      // Auto-focus logic can be handled by a directive or simple timeout in ngAfterViewInit if needed
  }

  closeNewTabModal() {
      this.isNewTabModalOpen.set(false);
  }

  async createTab() {
      const num = this.newTabNumber();
      const name = this.newTabName();
      const employee = this.operationalAuth.activeEmployee();

      if (!num || !employee) return;
      
      this.isCreating.set(true);
      const { success, error, data } = await this.posDataService.createTabOrder(num, name, employee.id);
      
      if (success && data) {
          this.closeNewTabModal();
          this.openTabClicked.emit(data);
      } else {
          await this.notificationService.alert(error?.message || 'Erro ao abrir comanda.');
      }
      this.isCreating.set(false);
  }

  // Quick Open by searching: If search is a number and not found, suggest opening
  isSearchNumber = computed(() => {
      const term = this.searchTerm();
      return /^\d+$/.test(term) && term.length > 0;
  });

  notFoundNumber = computed(() => {
     if (!this.isSearchNumber()) return null;
     const num = parseInt(this.searchTerm(), 10);
     const exists = this.tabs().some(t => t.command_number === num);
     return exists ? null : num;
  });

  quickOpenFromSearch() {
      const num = this.notFoundNumber();
      if (num) {
          this.newTabNumber.set(num);
          this.newTabName.set('');
          this.isNewTabModalOpen.set(true);
          this.searchTerm.set('');
      }
  }
}
