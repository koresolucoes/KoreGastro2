
import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, untracked, input, output, InputSignal, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Order, Table, OrderItem, DiscountType, Customer } from '../../../models/db.models';
import { PosDataService, PaymentInfo } from '../../../services/pos-data.service';
import { PrintingService } from '../../../services/printing.service';
import { NotificationService } from '../../../services/notification.service';
import { RedeemRewardModalComponent } from '../../shared/redeem-reward-modal/redeem-reward-modal.component';
import { v4 as uuidv4 } from 'uuid';
import { FocusNFeService } from '../../../services/focus-nfe.service';
import { OperationalAuthService } from '../../../services/operational-auth.service';

type PaymentMethod = 'Dinheiro' | 'Cartão de Crédito' | 'Cartão de Débito' | 'PIX' | 'Vale Refeição';

interface ItemGroup {
  id: string;
  name: string;
  items: OrderItem[];
  total: number;
  isPaid: boolean;
  payments: PaymentInfo[];
  serviceFeeApplied: boolean;
  splitCount: number;
}

@Component({
  selector: 'app-payment-modal',
  standalone: true,
  imports: [CommonModule, RedeemRewardModalComponent],
  templateUrl: './payment-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentModalComponent {
  posDataService = inject(PosDataService);
  printingService = inject(PrintingService);
  notificationService = inject(NotificationService);
  focusNFeService = inject(FocusNFeService);
  private operationalAuthService = inject(OperationalAuthService);
  
  order: InputSignal<Order | null> = input.required<Order | null>();
  table: InputSignal<Table | null> = input.required<Table | null>();
  closeModal: OutputEmitterRef<boolean> = output<boolean>(); 
  paymentFinalized: OutputEmitterRef<void> = output<void>();

  lastKnownOrder = signal<Order | null>(null);

  splitMode = signal<'total' | 'item'>('total');
  paymentSuccess = signal(false);
  serviceFeeApplied = signal(true);
  splitCount = signal(1);
  payments = signal<PaymentInfo[]>([]);
  paymentAmountInput = signal('');
  selectedPaymentMethod = signal<PaymentMethod>('Dinheiro');
  isRedeemModalOpen = signal(false);
  isEmittingNfce = signal(false);
  showKeypad = signal(true); // Control visibility of virtual keypad

  // Discount signals
  isAddingDiscount = signal(false);
  localDiscountType = signal<DiscountType>('percentage');
  localDiscountValue = signal<number>(0);
  
  // Global Discount
  globalDiscountType = signal<DiscountType>('percentage');
  globalDiscountValue = signal<number | null>(null);

  itemGroups = signal<ItemGroup[]>([]);
  unassignedItems = signal<OrderItem[]>([]);
  selectedGroupId = signal<string | null>(null);
  
  Math = Math; // To use in template

  customer = computed(() => this.lastKnownOrder()?.customers);

  selectedGroup = computed(() => {
    if (this.splitMode() !== 'item') return null;
    const groupId = this.selectedGroupId();
    if (!groupId) return null;
    return this.itemGroups().find(g => g.id === groupId) ?? null;
  });

  isServiceFeeToggleOn = computed(() => {
    if (this.splitMode() === 'item') {
      return this.selectedGroup()?.serviceFeeApplied ?? false;
    }
    return this.serviceFeeApplied();
  });
  
  orderSubtotalBeforeDiscount = computed(() => this.lastKnownOrder()?.order_items.reduce((sum, item) => sum + (item.price * item.quantity), 0) ?? 0);

  globalDiscountAmount = computed(() => {
    const order = this.lastKnownOrder();
    if (!order || !order.discount_type || !order.discount_value) {
      return 0;
    }
    if (order.discount_type === 'percentage') {
      return this.orderSubtotalBeforeDiscount() * (order.discount_value / 100);
    }
    return order.discount_value;
  });

  orderSubtotal = computed(() => {
    return this.orderSubtotalBeforeDiscount() - this.globalDiscountAmount();
  });
  
  tipAmount = computed(() => this.serviceFeeApplied() ? this.orderSubtotal() * 0.1 : 0);
  orderTotal = computed(() => this.orderSubtotal() + this.tipAmount());

  splitTotalPerPerson = computed(() => {
    if (this.splitMode() === 'total') {
        const total = this.orderTotal();
        const count = this.splitCount();
        if (!total || !count || count <= 0) return 0;
        return total / count;
    } else {
        const group = this.selectedGroup();
        if (!group || group.splitCount <= 0) return 0;
        const groupTotalWithTip = group.total + (group.serviceFeeApplied ? group.total * 0.1 : 0);
        return groupTotalWithTip / group.splitCount;
    }
  });

  totalPaid = computed(() => this.payments().reduce((sum, p) => sum + p.amount, 0));

  displaySubtotal = computed(() => {
    if (this.splitMode() === 'item') {
      return this.selectedGroup()?.total ?? 0;
    }
    return this.orderSubtotal();
  });

  displayTipAmount = computed(() => {
    if (this.splitMode() === 'item') {
      const group = this.selectedGroup();
      return group?.serviceFeeApplied ? (group.total * 0.1) : 0;
    }
    return this.tipAmount();
  });

  displayTotal = computed(() => this.displaySubtotal() + this.displayTipAmount());

  balanceDue = computed(() => {
    const totalToPay = this.displayTotal();
    const paidForThisEntity = this.splitMode() === 'item' 
        ? (this.selectedGroup()?.payments.reduce((sum, p) => sum + p.amount, 0) ?? 0)
        : this.totalPaid();
    return parseFloat((totalToPay - paidForThisEntity).toFixed(2));
  });

  isPaymentComplete = computed(() => {
    if (this.splitMode() === 'item') {
      return this.itemGroups().length > 0 && this.itemGroups().every(g => g.isPaid) && this.unassignedItems().length === 0;
    }
    return this.balanceDue() <= 0.001;
  });

  change = computed(() => {
    if (this.selectedPaymentMethod() !== 'Dinheiro' || this.isPaymentComplete()) return 0;
    const amount = parseFloat(this.paymentAmountInput());
    const balance = this.balanceDue();
    if (isNaN(amount) || amount <= balance) return 0;
    return parseFloat((amount - balance).toFixed(2));
  });
  
  suggestedAmounts = computed(() => {
      const balance = this.balanceDue();
      if (balance <= 0) return [];
      
      const suggestions = new Set<number>();
      suggestions.add(balance);
      
      if (balance % 5 !== 0) suggestions.add(Math.ceil(balance / 5) * 5);
      if (balance % 10 !== 0) suggestions.add(Math.ceil(balance / 10) * 10);
      if (balance < 50) suggestions.add(50);
      if (balance < 100) suggestions.add(100);
      if (balance > 100) suggestions.add(Math.ceil(balance / 100) * 100);

      return Array.from(suggestions).sort((a,b) => a - b);
  });

  constructor() {
    effect(() => {
      const currentOrder = this.order();
      if (currentOrder) {
        this.lastKnownOrder.set(currentOrder);
      }
    }, { allowSignalWrites: true });

    effect(() => {
      this.splitMode(); 
      this.resetPaymentState();
    });

    effect(() => {
      const ord = this.lastKnownOrder();
      if (this.splitMode() === 'item' && ord) {
        if (this.itemGroups().length === 0 && this.unassignedItems().length === 0) {
            this.itemGroups.set([]);
            this.unassignedItems.set([...ord.order_items]);
            this.selectedGroupId.set(null);
        }
      }
    });

    effect(() => {
      const groupId = this.selectedGroupId();
      const group = this.itemGroups().find(g => g.id === groupId);
      untracked(() => {
        this.payments.set(group?.payments || []);
        const groupBalance = group ? (group.total + (group.serviceFeeApplied ? group.total * 0.1 : 0)) - (group.payments.reduce((s,p) => s + p.amount, 0)) : 0;
        this.paymentAmountInput.set(groupBalance > 0 ? groupBalance.toFixed(2) : '');
      });
    });
  }

  private resetPaymentState() {
    untracked(() => {
        this.payments.set([]);
        const balance = this.balanceDue();
        this.paymentAmountInput.set(balance > 0 ? balance.toFixed(2) : '');
    });
  }
  
  // Input Handling
  handleManualInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    // Replace comma with dot for standard parsing if typed manually
    const sanitized = value.replace(',', '.').replace(/[^0-9.]/g, '');
    
    // Check for multiple dots
    const parts = sanitized.split('.');
    if (parts.length > 2) return; // invalid
    
    this.paymentAmountInput.set(sanitized);
  }

  // Calculator Methods
  appendDigit(digit: string) {
      this.paymentAmountInput.update(val => {
          if (val === '0' && digit !== '.') return digit;
          if (val === '' && digit === '.') return '0.';
          // Prevent multiple decimals
          if (digit === '.' && val.includes('.')) return val;
          // Limit decimal places to 2
          if (val.includes('.') && val.split('.')[1].length >= 2) return val;
          return val + digit;
      });
  }
  
  clearInput() {
      this.paymentAmountInput.set('');
  }
  
  backspace() {
      this.paymentAmountInput.update(val => val.slice(0, -1));
  }

  // Discount Logic
  async applyDiscount() {
    const order = this.lastKnownOrder();
    if (!order) return;
    
    const value = this.localDiscountValue();
    const type = this.localDiscountType();
    
    const finalValue = (value === null || value <= 0) ? null : value;
    const finalType = finalValue === null ? null : type;

    // Apply via Service
    const { success, error } = await this.posDataService.applyGlobalOrderDiscount(
      order.id,
      finalType,
      finalValue
    );

    if (success) {
      // Refresh local state by simulating order update since signal propagates
      // Ideally the parent component updates 'order' input, triggering the effect.
      // We manually update local state for immediate feedback
      this.lastKnownOrder.update(o => o ? ({...o, discount_type: finalType, discount_value: finalValue}) : null);
      this.isAddingDiscount.set(false);
      this.localDiscountValue.set(0);
      
      // Recalculate balance for input
      setTimeout(() => {
           const balance = this.balanceDue();
           this.paymentAmountInput.set(balance > 0 ? balance.toFixed(2) : '');
      }, 50);

    } else {
      await this.notificationService.alert(`Erro ao aplicar desconto: ${error?.message}`);
    }
  }

  addGroup() {
    const newGroup: ItemGroup = {
      id: uuidv4(),
      name: `Pessoa ${this.itemGroups().length + 1}`,
      items: [],
      total: 0,
      isPaid: false,
      payments: [],
      serviceFeeApplied: true,
      splitCount: 1,
    };
    this.itemGroups.update(groups => [...groups, newGroup]);
    this.selectedGroupId.set(newGroup.id);
  }

  toggleServiceFee() {
    if (this.splitMode() === 'item') {
      const groupId = this.selectedGroupId();
      if (!groupId) return;
      this.itemGroups.update(groups =>
        groups.map(g =>
          g.id === groupId ? { ...g, serviceFeeApplied: !g.serviceFeeApplied } : g
        )
      );
    } else {
      this.serviceFeeApplied.update(v => !v);
    }
  }

  addPayment() {
    const method = this.selectedPaymentMethod();
    const balance = this.balanceDue();
    let amount = parseFloat(this.paymentAmountInput());

    if (isNaN(amount) || amount <= 0) {
      return;
    }

    const paymentAmount = (method === 'Dinheiro' && amount > balance) ? balance : amount;
    
    if (method !== 'Dinheiro' && amount > balance + 0.01) {
        alert('Valor acima do saldo devedor.');
        return;
    }

    const newPayment: PaymentInfo = { method, amount: parseFloat(paymentAmount.toFixed(2)) };

    if (this.splitMode() === 'item') {
      const groupId = this.selectedGroupId();
      if (!groupId) return;
      this.itemGroups.update(groups => groups.map(g => {
        if (g.id === groupId) {
          const updatedPayments = [...g.payments, newPayment];
          const paidAmount = updatedPayments.reduce((sum, p) => sum + p.amount, 0);
          const groupTotal = g.total + (g.serviceFeeApplied ? g.total * 0.1 : 0);
          return { ...g, payments: updatedPayments, isPaid: paidAmount >= groupTotal - 0.01 };
        }
        return g;
      }));
    } else {
      this.payments.update(p => [...p, newPayment]);
    }
    
    const remaining = this.balanceDue() - paymentAmount;
    this.paymentAmountInput.set(remaining > 0 ? remaining.toFixed(2) : '');
  }

  removePayment(index: number) {
    if (this.splitMode() === 'item') {
      const groupId = this.selectedGroupId();
      if (!groupId) return;
      this.itemGroups.update(groups => groups.map(g => {
        if (g.id === groupId) {
          const updatedPayments = g.payments.filter((_, i) => i !== index);
          return { ...g, payments: updatedPayments, isPaid: false };
        }
        return g;
      }));
    } else {
      this.payments.update(p => p.filter((_, i) => i !== index));
    }
  }

  async finalizePayment() {
    const order = this.lastKnownOrder();
    const table = this.table();
    const closingEmployee = this.operationalAuthService.activeEmployee();

    if (!order || !closingEmployee) return;

    const tableId = table ? table.id : null; 
    
    const allPayments = this.splitMode() === 'item' ? this.itemGroups().flatMap(g => g.payments) : this.payments();
    
    const finalOrderTotal = this.splitMode() === 'item'
      ? this.itemGroups().reduce((sum, group) => sum + group.total + (group.serviceFeeApplied ? group.total * 0.1 : 0), 0)
      : this.orderTotal();

    const finalTipAmount = this.splitMode() === 'item'
      ? this.itemGroups().reduce((sum, group) => sum + (group.serviceFeeApplied ? group.total * 0.1 : 0), 0)
      : this.tipAmount();

    const result = await this.posDataService.finalizeOrderPayment(
        order.id, 
        tableId, 
        finalOrderTotal, 
        allPayments, 
        finalTipAmount, 
        closingEmployee.id
    );

    if (result.success) {
      this.paymentSuccess.set(true);
    } else {
      alert(`Falha ao registrar pagamento. Erro: ${result.error?.message}`);
    }
  }

  printReceipt() {
    const order = this.lastKnownOrder();
    const allPayments = this.splitMode() === 'item' ? this.itemGroups().flatMap(g => g.payments) : this.payments();
    if (order) {
      this.printingService.printCustomerReceipt(order, allPayments);
    }
  }

  async emitNfce() {
    const order = this.lastKnownOrder();
    if (!order) return;
    
    this.isEmittingNfce.set(true);
    const { success, error, data } = await this.focusNFeService.emitNfce(order.id);
    
    if (success) {
        this.notificationService.show(`NFC-e enviada! Status: ${data?.status}`, 'success');
    } else {
        this.notificationService.show(`Erro ao emitir NFC-e: ${error?.message}`, 'error');
    }
    this.isEmittingNfce.set(false);
  }

  finishAndClose() {
      this.paymentFinalized.emit();
      this.closeModal.emit(true);
  }

  selectGroup(groupId: string) {
    const group = this.itemGroups().find(g => g.id === groupId);
    if (group && !group.isPaid) this.selectedGroupId.set(groupId);
  }

  assignItemToGroup(item: OrderItem) {
     const groupId = this.selectedGroupId();
     if (!groupId) {
         if (this.itemGroups().length === 0) this.addGroup();
         else return;
     }
     const targetId = groupId || this.selectedGroupId();
     if(!targetId) return;

     this.unassignedItems.update(items => items.filter(i => i.id !== item.id));
     this.itemGroups.update(groups => groups.map(g => {
         if (g.id === targetId) {
             const newItems = [...g.items, item];
             const newTotal = newItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
             return { ...g, items: newItems, total: newTotal };
         }
         return g;
     }));
  }

  moveItemToUnassigned(item: OrderItem, fromGroupId: string) {
      this.itemGroups.update(groups => groups.map(g => {
          if (g.id === fromGroupId) {
              const newItems = g.items.filter(i => i.id !== item.id);
              const newTotal = newItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
              return { ...g, items: newItems, total: newTotal };
          }
          return g;
      }));
      this.unassignedItems.update(items => [...items, item]);
  }
}
