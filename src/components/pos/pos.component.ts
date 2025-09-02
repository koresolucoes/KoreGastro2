

import { Component, ChangeDetectionStrategy, inject, signal, computed, WritableSignal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Hall, Table, Order, Category, OrderItemStatus, OrderItem, Employee } from '../../models/db.models';
import { OrderPanelComponent } from './order-panel/order-panel.component';
import { AuthService } from '../../services/auth.service';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { PosDataService } from '../../services/pos-data.service';

type DragAction = 'move' | 'resize';
interface DragState {
  action: DragAction;
  tableId: string;
  startX: number;
  startY: number;
  originalX: number;
  originalY: number;
  originalWidth: number;
  originalHeight: number;
}

export type PaymentMethod = 'Dinheiro' | 'Cartão de Crédito' | 'Cartão de Débito' | 'PIX' | 'Vale Refeição';

export interface Payment {
  method: PaymentMethod;
  amount: number;
}


@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CommonModule, OrderPanelComponent],
  templateUrl: './pos.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PosComponent {
  stateService = inject(SupabaseStateService);
  posDataService = inject(PosDataService);
  authService = inject(AuthService);
  
  halls = this.stateService.halls;
  tables = this.stateService.tables;
  employees = this.stateService.employees;

  // Employee Session
  activeEmployee = signal<Employee | null>(null);
  isEmployeeLoginModalOpen = signal(true);
  selectedEmployeeForLogin = signal<Employee | null>(null);
  enteredPin = signal('');
  pinError = signal('');

  selectedHall: WritableSignal<Hall | null> = signal(null);
  selectedTable: WritableSignal<Table | null> = signal(null);
  orderError = signal<string | null>(null);
  
  isOrderModalOpen = signal(false);
  isEditMode = signal(false);
  tablesInEdit: WritableSignal<Table[]> = signal([]);
  dragState = signal<DragState | null>(null);

  isMoveModalOpen = signal(false);

  // Hall Management Signals
  isHallManagerOpen = signal(false);
  newHallName = signal('');
  editingHall = signal<{ id: string; name: string } | null>(null);
  hallPendingDeletion = signal<Hall['id'] | null>(null);

  // Payment Modal Signals
  isPaymentModalOpen = signal(false);
  payments = signal<Payment[]>([]);
  paymentAmountInput = signal(''); // Use string for easier input handling
  selectedPaymentMethod = signal<PaymentMethod>('Dinheiro');
  tipAmount = signal(0);
  
  criticalKeywords = ['alergia', 'sem glúten', 'sem lactose', 'celíaco', 'nozes', 'amendoim', 'vegetariano', 'vegano'];
  
  currentOrder = computed(() => {
    const table = this.selectedTable();
    if (!table) return null;
    return this.posDataService.getOrderByTableNumber(table.number) ?? null;
  });

  employeeNameMap = computed(() => {
    return new Map(this.employees().map(e => [e.id, e.name]));
  });

  editModeCanvasSize = signal({ width: 100, height: 100 }); // in percentages

  canvasSize = computed(() => {
    if (this.isEditMode()) {
        return this.editModeCanvasSize();
    }
    const tables = this.filteredTables();
    if (tables.length === 0) {
        return { width: 100, height: 100 };
    }
    const requiredWidth = tables.reduce((max, t) => Math.max(max, t.x + t.width), 0);
    const requiredHeight = tables.reduce((max, t) => Math.max(max, t.y + t.height), 0);
    return {
        width: Math.max(100, Math.ceil(requiredWidth / 10) * 10),
        height: Math.max(100, Math.ceil(requiredHeight / 10) * 10)
    };
  });

  constructor() {
    effect(() => {
        const allHalls = this.halls();
        const currentHall = this.selectedHall();
        if (allHalls.length > 0) {
            const isSelectedHallValid = currentHall && allHalls.some(h => h.id === currentHall.id);
            if (!isSelectedHallValid) {
                this.selectHall(allHalls[0]);
            }
        } else {
            this.selectedHall.set(null);
        }
    });
  }

  // --- Employee Login Methods ---
  selectEmployeeForLogin(employee: Employee) {
    this.selectedEmployeeForLogin.set(employee);
    this.enteredPin.set('');
    this.pinError.set('');
  }

  enterPinDigit(digit: string) {
    if (this.enteredPin().length < 4) {
      this.enteredPin.update(pin => pin + digit);
      if (this.enteredPin().length === 4) {
        this.checkPin();
      }
    }
  }
  
  clearPin() { this.enteredPin.set(''); this.pinError.set(''); }
  backspacePin() { this.enteredPin.update(pin => pin.slice(0, -1)); this.pinError.set(''); }

  checkPin() {
    const employee = this.selectedEmployeeForLogin();
    if (employee && employee.pin === this.enteredPin()) {
      this.activeEmployee.set(employee);
      this.isEmployeeLoginModalOpen.set(false);
      this.selectedEmployeeForLogin.set(null);
      this.enteredPin.set('');
      this.pinError.set('');
    } else {
      this.pinError.set('PIN incorreto. Tente novamente.');
      setTimeout(() => this.clearPin(), 1000);
    }
  }

  logoutEmployee() {
    this.activeEmployee.set(null);
    this.isEmployeeLoginModalOpen.set(true);
  }


  isItemCritical(item: OrderItem): boolean {
    const note = item.notes?.toLowerCase() ?? '';
    if (!note) return false;
    return this.criticalKeywords.some(keyword => note.includes(keyword));
  }

  getUnacknowledgedCriticalItemsCount(tableNumber: number): number {
    const order = this.posDataService.getOrderByTableNumber(tableNumber);
    if (!order || !order.order_items) return 0;

    return order.order_items.filter(item => 
      this.isItemCritical(item) && !item.status_timestamps?.['ATTENTION_ACKNOWLEDGED']
    ).length;
  }
  
  filteredTables = computed(() => {
    const hall = this.selectedHall();
    if (!hall) return [];
    return this.tables().filter(t => t.hall_id === hall.id);
  });

  tablesToDisplay = computed(() => {
    return this.isEditMode() ? this.tablesInEdit() : this.filteredTables();
  });
  
  orderTotal = computed(() => {
    return this.currentOrder()?.order_items.reduce((sum, item) => sum + (item.price * item.quantity), 0) ?? 0;
  });

  orderTotalWithTip = computed(() => this.orderTotal() + this.tipAmount());

  availableTablesForMove = computed(() => {
    const hallId = this.selectedHall()?.id;
    const currentTableId = this.selectedTable()?.id;
    return this.tables().filter(t => t.hall_id === hallId && t.status === 'LIVRE' && t.id !== currentTableId);
  });

  // Payment Modal Computeds
  totalPaid = computed(() => this.payments().reduce((sum, p) => sum + p.amount, 0));

  balanceDue = computed(() => {
      const total = this.orderTotalWithTip();
      const paid = this.totalPaid();
      return parseFloat((total - paid).toFixed(2));
  });

  change = computed(() => {
      const balance = this.balanceDue();
      const cashInput = parseFloat(this.paymentAmountInput());
      if (this.selectedPaymentMethod() !== 'Dinheiro' || isNaN(cashInput) || cashInput < balance) {
          return 0;
      }
      return parseFloat((cashInput - balance).toFixed(2));
  });

  isPaymentComplete = computed(() => this.balanceDue() <= 0.001);

  openHallManager() { this.isHallManagerOpen.set(true); }
  closeHallManager() {
    this.isHallManagerOpen.set(false);
    this.editingHall.set(null);
    this.newHallName.set('');
    this.hallPendingDeletion.set(null);
  }
  startEditingHall(hall: Hall) {
    this.editingHall.set({ ...hall });
    this.hallPendingDeletion.set(null);
  }
  cancelEditingHall() { this.editingHall.set(null); }
  updateEditingHallName(event: Event) {
      const target = event.target as HTMLInputElement;
      this.editingHall.update(hall => hall ? { ...hall, name: target.value } : null);
  }
  async saveHallName() {
    const hall = this.editingHall();
    if (hall && hall.name.trim()) {
      const { success, error } = await this.posDataService.updateHall(hall.id, hall.name.trim());
      if (success) { this.cancelEditingHall(); } else {
        alert(`Falha ao salvar o nome do salão. Erro: ${error?.message}`);
      }
    }
  }
  async handleAddHall() {
    const name = this.newHallName().trim();
    if (name) {
      const { success, error } = await this.posDataService.addHall(name);
      if (success) { this.newHallName.set(''); } else {
        alert(`Falha ao adicionar o salão. Erro: ${error?.message}`);
      }
    }
  }
  requestDeleteHall(hall: Hall) {
    this.editingHall.set(null);
    this.hallPendingDeletion.set(hall.id);
  }
  cancelDeleteHall() { this.hallPendingDeletion.set(null); }
  async confirmDeleteHall(hall: Hall) {
    if (this.tables().filter(t => t.hall_id === hall.id).length > 0) {
      const { success, error } = await this.posDataService.deleteTablesByHallId(hall.id);
      if (!success) {
        alert(`Falha ao deletar as mesas do salão. Erro: ${error?.message}`);
        this.hallPendingDeletion.set(null);
        return;
      }
    }
    const { success, error } = await this.posDataService.deleteHall(hall.id);
    if (!success) {
      alert(`Falha ao deletar o salão. Erro: ${error?.message}`);
    }
    this.hallPendingDeletion.set(null);
  }
  tablesInHallCount(hallId: string): number { return this.tables().filter(t => t.hall_id === hallId).length; }

  toggleEditMode() {
    this.isEditMode.update(value => !value);
    if (this.isEditMode()) {
      const tables = this.filteredTables();
      const requiredWidth = tables.reduce((max, t) => Math.max(max, t.x + t.width), 0);
      const requiredHeight = tables.reduce((max, t) => Math.max(max, t.y + t.height), 0);
      this.editModeCanvasSize.set({
          width: Math.max(100, Math.ceil(requiredWidth / 10) * 10),
          height: Math.max(100, Math.ceil(requiredHeight / 10) * 10)
      });
      this.tablesInEdit.set(JSON.parse(JSON.stringify(tables)));
    } else {
      this.tablesInEdit.set([]);
    }
  }
  addTable() {
    const hall = this.selectedHall();
    if (!hall) return;
    const userId = this.authService.currentUser()?.id;
    if (!userId) return;

    const allHalls = this.halls();
    const hallIndex = allHalls.findIndex(h => h.id === hall.id);
    const startNumber = ((hallIndex >= 0 ? hallIndex : 0) * 100) + 101;
    const existingNumbersInHall = new Set(this.tablesInEdit().map(t => t.number));
    let nextAvailableNumber = startNumber;
    while (existingNumbersInHall.has(nextAvailableNumber)) { nextAvailableNumber++; }
    const newTableWidth = 15, newTableHeight = 15, step = 5, gap = 2;
    let newX = 5, newY = 5, positionFound = false;
    const collides = (r1: any, r2: any) => (r1.x < r2.x + r2.width + gap && r1.x + r1.width + gap > r2.x && r1.y < r2.y + r2.height + gap && r1.y + r1.height + gap > r2.y);
    const currentCanvas = this.editModeCanvasSize();
    for (let y = step; y <= currentCanvas.height - newTableHeight; y += step) {
      for (let x = step; x <= currentCanvas.width - newTableWidth; x += step) {
        if (!this.tablesInEdit().some(table => collides({ x, y, width: newTableWidth, height: newTableHeight }, table))) {
          newX = x; newY = y; positionFound = true; break;
        }
      }
      if (positionFound) break;
    }
    if (!positionFound) {
      newX = step; newY = currentCanvas.height + gap;
      this.editModeCanvasSize.update(size => ({ ...size, height: size.height + newTableHeight + gap + step }));
    }
    const newTable: Table = { id: `temp-${Date.now()}`, number: nextAvailableNumber, hall_id: hall.id, status: 'LIVRE', x: newX, y: newY, width: newTableWidth, height: newTableHeight, created_at: new Date().toISOString(), user_id: userId };
    this.tablesInEdit.update(tables => [...tables, newTable]);
  }
  deleteTable(e: MouseEvent, tableId: string) {
    e.stopPropagation();
    this.tablesInEdit.update(tables => tables.filter(t => t.id !== tableId));
  }
  async saveLayout() {
    const tablesToUpsert = this.tablesInEdit();
    const editTableIds = new Set(tablesToUpsert.map(t => t.id));
    const tablesToDelete = this.filteredTables().filter(t => !editTableIds.has(t.id));
    if (tablesToDelete.length > 0) {
      const results = await Promise.all(tablesToDelete.map(t => this.posDataService.deleteTable(t.id)));
      if (results.some(res => !res.success)) { alert(`Falha ao deletar uma ou mais mesas.`); return; }
    }
    if (tablesToUpsert.length > 0) {
      const { success, error } = await this.posDataService.upsertTables(tablesToUpsert);
      if (!success) { alert(`Falha ao salvar o layout das mesas. Erro: ${error?.message}`); return; }
    }
    this.isEditMode.set(false);
  }
  cancelEdit() {
    this.isEditMode.set(false);
    this.tablesInEdit.set([]);
  }
  startDrag(event: MouseEvent, table: Table, action: DragAction) {
    if (!this.isEditMode()) return;
    event.preventDefault(); event.stopPropagation();
    this.dragState.set({ action, tableId: table.id, startX: event.clientX, startY: event.clientY, originalX: table.x, originalY: table.y, originalWidth: table.width, originalHeight: table.height });
  }
  onMouseMove(event: MouseEvent) {
    const state = this.dragState();
    if (!state) return;
    const grid = 1, container = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const dx = ((event.clientX - state.startX) / container.width) * 100, dy = ((event.clientY - state.startY) / container.height) * 100;
    const tableToUpdate = this.tablesInEdit().find(t => t.id === state.tableId);
    if (!tableToUpdate) return;
    let newX = tableToUpdate.x, newY = tableToUpdate.y, newW = tableToUpdate.width, newH = tableToUpdate.height;
    if (state.action === 'move') {
      newX = Math.round((state.originalX + dx) / grid) * grid; newY = Math.round((state.originalY + dy) / grid) * grid;
    } else {
      newW = Math.max(5, Math.round((state.originalWidth + dx) / grid) * grid); newH = Math.max(5, Math.round((state.originalHeight + dy) / grid) * grid);
    }
    const expansionBuffer = 10;
    const requiredWidth = Math.ceil((newX + newW + expansionBuffer) / 10) * 10, requiredHeight = Math.ceil((newY + newH + expansionBuffer) / 10) * 10;
    this.editModeCanvasSize.update(size => ({ width: Math.max(size.width, requiredWidth), height: Math.max(size.height, requiredHeight) }));
    const currentCanvas = this.editModeCanvasSize();
    newX = Math.max(0, Math.min(newX, currentCanvas.width - newW)); newY = Math.max(0, Math.min(newY, currentCanvas.height - newH));
    this.tablesInEdit.update(tables => tables.map(t => t.id === state.tableId ? { ...t, x: newX, y: newY, width: newW, height: newH } : t));
  }
  stopDrag() { this.dragState.set(null); }
  
  selectHall(hall: Hall) {
    this.selectedHall.set(hall);
    if (this.isEditMode()) { this.tablesInEdit.set(JSON.parse(JSON.stringify(this.filteredTables()))); }
  }
  
  async selectTable(table: Table) {
    if (this.isEditMode() || !this.activeEmployee()) return;

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
    
    this.isOrderModalOpen.set(true);
  }
  
  async handleCheckoutStarted() {
    const table = this.selectedTable();
    if (!table || !this.currentOrder() || this.currentOrder()?.order_items.length === 0) return;
    const { success, error } = await this.posDataService.updateTableStatus(table.id, 'PAGANDO');
    if (success) { 
        this.isOrderModalOpen.set(false);
        this.openPaymentModal(); 
    } else {
        alert(`Falha ao iniciar o fechamento da conta. Erro: ${error?.message}`);
    }
  }

  openPaymentModal() {
    this.payments.set([]);
    this.tipAmount.set(0);
    this.paymentAmountInput.set(this.balanceDue() > 0 ? this.balanceDue().toString() : '');
    this.selectedPaymentMethod.set('Dinheiro');
    this.isPaymentModalOpen.set(true);
  }
  async closePaymentModal(revertStatus: boolean = false) {
    this.isPaymentModalOpen.set(false);
    if (revertStatus) {
        const table = this.selectedTable();
        if (table && table.status === 'PAGANDO') {
            await this.posDataService.updateTableStatus(table.id, 'OCUPADA');
        }
    }
  }
  addPayment() {
    const method = this.selectedPaymentMethod(), balance = this.balanceDue();
    let amount = parseFloat(this.paymentAmountInput());
    if (isNaN(amount) || amount <= 0) { alert('Por favor, insira um valor de pagamento válido.'); return; }
    if (method === 'Dinheiro') {
        if (amount < balance) { alert('O valor recebido em dinheiro é menor que o saldo devedor.'); return; }
        amount = balance;
    } else {
        if (amount > balance + 0.001) { alert(`O valor para ${method} não pode exceder o saldo devedor.`); return; }
    }
    if (amount > 0) { this.payments.update(p => [...p, { method, amount: parseFloat(amount.toFixed(2)) }]); }
    const newBalance = this.balanceDue();
    this.paymentAmountInput.set(newBalance > 0 ? newBalance.toString() : '');
    this.selectedPaymentMethod.set('Dinheiro');
  }
  removePayment(index: number) {
      this.payments.update(p => p.filter((_, i) => i !== index));
      const newBalance = this.balanceDue();
      this.paymentAmountInput.set(newBalance > 0 ? newBalance.toString() : '');
  }
  async finalizePayment() {
    const order = this.currentOrder(), table = this.selectedTable(), total = this.orderTotal(), currentPayments = this.payments(), tip = this.tipAmount();
    if (!order || !table || !this.isPaymentComplete()) return;
    const { success, error } = await this.posDataService.finalizeOrderPayment(order.id, table.id, total, currentPayments, tip);
    if (success) {
        alert('Pagamento registrado e mesa liberada com sucesso!');
        this.closePaymentModal(false);
        this.closeOrderModal();
    } else {
        alert(`Falha ao finalizar o pagamento. Erro: ${error?.message}`);
    }
  }
  async moveOrder(destinationTable: Table) {
    const order = this.currentOrder(), sourceTable = this.selectedTable();
    if (order && sourceTable && destinationTable) {
        await this.posDataService.moveOrderToTable(order, sourceTable, destinationTable);
        this.closeMoveModal();
        this.closeOrderModal();
    }
  }
  openMoveModal() { this.isMoveModalOpen.set(true); }
  closeMoveModal() { this.isMoveModalOpen.set(false); }
  
  async closeOrderModal() {
    const order = this.currentOrder();
    const table = this.selectedTable();

    if (order && table && table.status === 'LIVRE' && order.order_items.length === 0) {
        await this.posDataService.deleteEmptyOrder(order.id);
    }

    this.isOrderModalOpen.set(false);
    this.selectedTable.set(null);
    this.orderError.set(null);
    this.tipAmount.set(0);
  }

  async handleReleaseTable() {
    const order = this.currentOrder();
    const table = this.selectedTable();

    if (order && table && table.status === 'OCUPADA' && order.order_items.length === 0) {
        const { success, error } = await this.posDataService.releaseTable(table.id, order.id);
        if (success) {
            this.closeOrderModal();
        } else {
            alert(`Falha ao liberar a mesa: ${error?.message}`);
        }
    }
  }

  getProductionStatusForTable(tableNumber: number): { ready: number, total: number } {
    const order = this.posDataService.getOrderByTableNumber(tableNumber);
    if (!order || !order.order_items || order.order_items.length === 0) {
      return { ready: 0, total: 0 };
    }

    const itemsInProduction = order.order_items.filter(item => item.status !== 'AGUARDANDO');
    const readyItems = itemsInProduction.filter(item => item.status === 'PRONTO');

    return {
      ready: readyItems.length,
      total: itemsInProduction.length,
    };
  }

  getOrderItemStatusClass(status: OrderItemStatus): string {
    switch (status) {
      case 'PENDENTE': return 'text-yellow-400';
      case 'EM_PREPARO': return 'text-blue-400';
      case 'PRONTO': return 'text-green-400 font-bold';
      case 'AGUARDANDO': return 'text-gray-400';
      default: return 'text-gray-500';
    }
  }

  getTableStatusClass(status: Table['status']): string {
    switch (status) {
      case 'LIVRE': return 'bg-green-500 hover:bg-green-400 border-green-300 shadow-lg shadow-green-500/20';
      case 'OCUPADA': return 'bg-yellow-500 hover:bg-yellow-400 border-yellow-300 shadow-lg shadow-yellow-500/20';
      case 'PAGANDO': return 'bg-red-500 hover:bg-red-400 border-red-300 shadow-lg shadow-red-500/20';
      default: return 'bg-gray-500';
    }
  }
}