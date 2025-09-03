


import { Component, ChangeDetectionStrategy, inject, signal, computed, WritableSignal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Hall, Table, Order, Employee } from '../../models/db.models';

import { OrderPanelComponent } from './order-panel/order-panel.component';
import { HallManagerModalComponent } from './hall-manager-modal/hall-manager-modal.component';
import { TableLayoutComponent } from './table-layout/table-layout.component';

import { AuthService } from '../../services/auth.service';
import { OperationalAuthService } from '../../services/operational-auth.service';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { PosDataService } from '../../services/pos-data.service';
import { PrintingService } from '../../services/printing.service';

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [
    CommonModule,
    OrderPanelComponent,
    HallManagerModalComponent,
    TableLayoutComponent,
  ],
  templateUrl: './pos.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PosComponent {
  stateService = inject(SupabaseStateService);
  posDataService = inject(PosDataService);
  authService = inject(AuthService);
  operationalAuthService = inject(OperationalAuthService);
  printingService = inject(PrintingService);
  
  // Data Signals from State Service
  halls = this.stateService.halls;
  tables = this.stateService.tables;
  employees = this.stateService.employees;

  // Component State
  activeEmployee = this.operationalAuthService.activeEmployee;
  selectedHall: WritableSignal<Hall | null> = signal(null);
  selectedTable: WritableSignal<Table | null> = signal(null);
  orderError = signal<string | null>(null);
  
  // Modal/Panel Visibility State
  isOrderPanelOpen = signal(false);
  isEditMode = signal(false);
  isMoveModalOpen = signal(false);
  isHallManagerOpen = signal(false);

  // Context Menu State
  isContextMenuOpen = signal(false);
  contextMenuPosition = signal({ x: 0, y: 0 });
  contextMenuTable = signal<Table | null>(null);
  
  currentOrder = computed(() => {
    const table = this.selectedTable() ?? this.contextMenuTable();
    if (!table) return null;
    return this.posDataService.getOrderByTableNumber(table.number) ?? null;
  });

  employeeNameMap = computed(() => {
    return new Map(this.employees().map(e => [e.id, e.name]));
  });
  
  availableTablesForMove = computed(() => {
    const hallId = this.selectedHall()?.id;
    const currentTableId = this.selectedTable()?.id;
    return this.tables().filter(t => t.hall_id === hallId && t.status === 'LIVRE' && t.id !== currentTableId);
  });

  selectedHallIndex = computed(() => {
    const hall = this.selectedHall();
    if (!hall) return -1;
    return this.halls().findIndex(h => h.id === hall.id);
  });

  constructor() {
    // Effect to auto-select the first hall if none is selected
    effect(() => {
        const allHalls = this.halls();
        const currentHall = this.selectedHall();
        if (allHalls.length > 0) {
            const isSelectedHallValid = currentHall && allHalls.some(h => h.id === currentHall.id);
            if (!isSelectedHallValid) {
                this.selectedHall.set(allHalls[0]);
            }
        } else {
            this.selectedHall.set(null);
        }
    });
  }

  // --- Event Handlers from Child Components ---

  async handleTableClicked(table: Table) {
    if (this.isEditMode() || !this.activeEmployee()) return;

    this.isContextMenuOpen.set(false);
    this.selectedTable.set(table);
    this.orderError.set(null);
    const orderExists = this.posDataService.getOrderByTableNumber(table.number);

    if (!orderExists && table.status === 'LIVRE') {
      const result = await this.posDataService.createOrderForTable(table);
      if (!result.success) { 
        this.orderError.set(result.error?.message ?? 'Erro desconhecido ao criar pedido.');
        return;
      }
    }
    
    this.isOrderPanelOpen.set(true);
  }

  handleTableRightClick(event: { event: MouseEvent, table: Table }) {
    if (this.isEditMode() || event.table.status === 'LIVRE') return;
    event.event.preventDefault();
    this.contextMenuTable.set(event.table);
    this.contextMenuPosition.set({ x: event.event.clientX, y: event.event.clientY });
    this.isContextMenuOpen.set(true);
  }
  
  async handleCheckoutStarted() {
    const table = this.selectedTable();
    if (!table || !this.currentOrder() || this.currentOrder()?.order_items.length === 0) return;
    
    const { success, error } = await this.posDataService.updateTableStatus(table.id, 'PAGANDO');
    if (success) { 
        this.closeOrderPanel();
        alert(`Mesa ${table.number} enviada para o Caixa.`);
    } else {
        alert(`Falha ao iniciar o fechamento da conta. Erro: ${error?.message}`);
    }
  }

  async handleCustomerCountChanged(count: number) {
      const table = this.selectedTable();
      if (table) {
          await this.posDataService.updateTableCustomerCount(table.id, count);
      }
  }
  
  async moveOrder(destinationTable: Table) {
    const order = this.currentOrder(), sourceTable = this.selectedTable();
    if (order && sourceTable && destinationTable) {
        await this.posDataService.moveOrderToTable(order, sourceTable, destinationTable);
        this.closeMoveModal();
        this.closeOrderPanel();
    }
  }
  
  async closeOrderPanel() {
    const order = this.currentOrder();
    const table = this.selectedTable();

    if (order && table && table.status === 'LIVRE' && order.order_items.length === 0) {
        await this.posDataService.deleteEmptyOrder(order.id);
    }

    this.isOrderPanelOpen.set(false);
    this.selectedTable.set(null);
    this.orderError.set(null);
  }

  async handleReleaseTable() {
    const order = this.currentOrder();
    const table = this.selectedTable();

    if (order && table && table.status === 'OCUPADA' && order.order_items.length === 0) {
        const { success, error } = await this.posDataService.releaseTable(table.id, order.id);
        if (success) {
            this.closeOrderPanel();
        } else {
            alert(`Falha ao liberar a mesa: ${error?.message}`);
        }
    }
  }
  
  // --- UI State Changers ---
  
  selectHall(hall: Hall) {
    this.selectedHall.set(hall);
    this.isContextMenuOpen.set(false);
  }
  
  openMoveModal() { this.isMoveModalOpen.set(true); this.isContextMenuOpen.set(false); }
  closeMoveModal() { this.isMoveModalOpen.set(false); }
  closeContextMenu() { this.isContextMenuOpen.set(false); this.contextMenuTable.set(null); }

  handlePrintPreBill() {
    const order = this.currentOrder();
    if (order) {
        this.printingService.printPreBill(order);
    }
    this.closeContextMenu();
  }
}