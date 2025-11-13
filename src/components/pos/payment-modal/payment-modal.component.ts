import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, untracked, input, output, InputSignal, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Order, Table, OrderItem, DiscountType, Customer } from '../../../models/db.models';
import { PosDataService, PaymentInfo } from '../../../services/pos-data.service';
import { PrintingService } from '../../../services/printing.service';
import { NotificationService } from '../../../services/notification.service';
import { RedeemRewardModalComponent } from '../../shared/redeem-reward-modal/redeem-reward-modal.component';
import { v4 as uuidv4 } from 'uuid';
import { FocusNFeService } from '../../../services/focus-nfe.service';

type PaymentMethod = 'Dinheiro' | 'Cartão de Crédito' | 'Cartão de Débito' | 'PIX' | 'Vale Refeição';

interface ItemGroup {
  id: string;
  name: string;
  items: OrderItem[];
  total: number;
  isPaid: boolean;
  payments: PaymentInfo[];
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
  
  order: InputSignal<Order | null> = input.required<Order | null>();
  table: InputSignal<Table | null> = input.required<Table | null>();
  closeModal: OutputEmitterRef<boolean> = output<boolean>(); // Emits true to revert status
  paymentFinalized: OutputEmitterRef<void> = output<void>();

  splitMode = signal<'total' | 'item'>('total');
  paymentSuccess = signal(false);
  serviceFeeApplied = signal(true);
  payments = signal<PaymentInfo[]>([]);
  paymentAmountInput = signal('');
  selectedPaymentMethod = signal<PaymentMethod>('Dinheiro');
  isRedeemModalOpen = signal(false);
  isEmittingNfce = signal(false);

  // Discount Modal State
  isDiscountModalOpen = signal(false);
  editingDiscountItem = signal<OrderItem | null>(null);
  discountType = signal<DiscountType>('percentage');
  discountValue = signal<number | null>(null);

  // Split by Item State
  itemGroups = signal<ItemGroup[]>([]);
  unassignedItems = signal<OrderItem[]>([]);
  selectedGroupId = signal<string | null>(null);

  customer = computed(() => this.order()?.customers);

  // --- Computed Properties ---
  
  // Total of the entire order
  orderSubtotal = computed(() => this.order()?.order_items.reduce((sum, item) => sum + (item.price * item.quantity), 0) ?? 0);
  tipAmount = computed(() => this.serviceFeeApplied() ? this.orderSubtotal() * 0.1 : 0);
  orderTotal = computed(() => this.orderSubtotal() + this.tipAmount());

  // Total paid across all payments (in both modes)
  totalPaid = computed(() => this.payments().reduce((sum, p) => sum + p.amount, 0));

  // The final total to be displayed, depending on the split mode and selection
  displayTotal = computed(() => {
    if (this.splitMode() === 'item') {
      const group = this.itemGroups().find(g => g.id === this.selectedGroupId());
      return group ? group.total : 0;
    }
    return this.orderTotal();
  });
  displaySubtotal = computed(() => {
    if (this.splitMode() === 'item') {
      const group = this.itemGroups().find(g => g.id === this.selectedGroupId());
      return group ? group.total : 0;
    }
    return this.orderSubtotal();
  });
  displayTipAmount = computed(() => this.serviceFeeApplied() && this.splitMode() === 'total' ? this.tipAmount() : 0);

  balanceDue = computed(() => parseFloat((this.displayTotal() - this.totalPaid()).toFixed(2)));
  isPaymentComplete = computed(() => this.balanceDue() <= 0.001);
  
  change = computed(() => {
    if (this.selectedPaymentMethod() !== 'Dinheiro' || this.isPaymentComplete()) return 0;
    const amount = parseFloat(this.paymentAmountInput());
    if (isNaN(amount) || amount <= this.balanceDue()) return 0;
    return parseFloat((amount - this.balanceDue()).toFixed(2));
  });

  constructor() {
    effect(() => {
        this.resetPaymentState();
    });

    effect(() => {
      // Initialize or reset split-by-item state when mode changes or order loads
      const mode = this.splitMode();
      const ord = this.order();
      if (mode === 'item' && ord) {
        this.itemGroups.set([]);
        this.unassignedItems.set([...ord.order_items]);
        this.selectedGroupId.set(null);
      }
    });

    effect(() => {
      // When a group is selected, update payment details for that group
      const groupId = this.selectedGroupId();
      const groups = this.itemGroups();
      const group = groups.find(g => g.id === groupId);
      untracked(() => {
        this.payments.set(group?.payments || []);
        const balance = group ? group.total - (group.payments.reduce((sum, p) => sum + p.amount, 0)) : 0;
        this.paymentAmountInput.set(balance > 0 ? balance.toFixed(2) : '');
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

  async addPayment() {
    const method = this.selectedPaymentMethod();
    const balance = this.balanceDue();
    let amount = parseFloat(this.paymentAmountInput());

    if (isNaN(amount) || amount <= 0) {
      await this.notificationService.alert('O valor inserido é inválido.');
      return;
    }

    if (method !== 'Dinheiro' && amount > balance + 0.001) {
      await this.notificationService.alert(`O valor para ${method} não pode ser maior que o saldo restante de ${balance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`);
      return;
    }
    
    const paymentAmount = (method === 'Dinheiro' && amount > balance) ? balance : amount;
    
    if (paymentAmount > 0) {
      const newPayment: PaymentInfo = { method, amount: parseFloat(paymentAmount.toFixed(2)) };
      
      if (this.splitMode() === 'item') {
        const groupId = this.selectedGroupId();
        if (!groupId) return;
        this.itemGroups.update(groups => groups.map(g => {
          if (g.id === groupId) {
            const updatedPayments = [...g.payments, newPayment];
            const paidAmount = updatedPayments.reduce((sum, p) => sum + p.amount, 0);
            return { ...g, payments: updatedPayments, isPaid: paidAmount >= g.total - 0.001 };
          }
          return g;
        }));
      } else {
        this.payments.update(p => [...p, newPayment]);
      }
    }
    
    const newBalance = this.balanceDue();
    this.paymentAmountInput.set(newBalance > 0 ? newBalance.toFixed(2) : '');
  }

  removePayment(index: number) {
    if (this.splitMode() === 'item') {
      const groupId = this.selectedGroupId();
      if (!groupId) return;
      this.itemGroups.update(groups => groups.map(g => {
        if (g.id === groupId) {
          const updatedPayments = g.payments.filter((_, i) => i !== index);
          return { ...g, payments: updatedPayments, isPaid: false }; // Re-open group for payment
        }
        return g;
      }));
    } else {
      this.payments.update(p => p.filter((_, i) => i !== index));
    }
    
    const newBalance = this.balanceDue();
    this.paymentAmountInput.set(newBalance > 0 ? newBalance.toFixed(2) : '');
  }
  
  async finalizePayment() {
    const order = this.order();
    const table = this.table();
    if (!order || !table) return;

    // Aggregate payments from all groups if in item split mode
    const allPayments = this.splitMode() === 'item' 
      ? this.itemGroups().flatMap(g => g.payments) 
      : this.payments();
    
    const totalPaid = allPayments.reduce((sum, p) => sum + p.amount, 0);
    const orderTotal = this.orderTotal();

    if (totalPaid < orderTotal - 0.001) {
      await this.notificationService.alert('O valor total pago é menor que o total da conta.');
      return;
    }
    
    const confirmed = await this.notificationService.confirm(
      `Confirmar o pagamento de ${orderTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} para a Mesa ${table.number}? Esta ação é irreversível.`,
      'Confirmar Pagamento'
    );
    if (!confirmed) return;
    
    const { success, error } = await this.posDataService.finalizeOrderPayment(order.id, table.id, orderTotal, allPayments, this.tipAmount());

    if (success) {
      this.paymentSuccess.set(true);
    } else {
      await this.notificationService.alert(`Falha ao registrar pagamento. Erro: ${error?.message}`);
    }
  }

  printReceipt() {
    const order = this.order();
    const allPayments = this.splitMode() === 'item' ? this.itemGroups().flatMap(g => g.payments) : this.payments();
    if (order) {
        this.printingService.printCustomerReceipt(order, allPayments);
    }
  }

  finishAndClose() {
      this.paymentFinalized.emit();
  }

  // --- Item Split Logic ---
  addGroup() {
    const newGroup: ItemGroup = {
      id: uuidv4(),
      name: `Pessoa ${this.itemGroups().length + 1}`,
      items: [],
      total: 0,
      isPaid: false,
      payments: []
    };
    this.itemGroups.update(groups => [...groups, newGroup]);
    this.selectedGroupId.set(newGroup.id);
  }

  selectGroup(groupId: string) {
    const group = this.itemGroups().find(g => g.id === groupId);
    if (group && !group.isPaid) {
      this.selectedGroupId.set(groupId);
    }
  }

  assignItemToGroup(item: OrderItem, groupId?: string) {
    const targetGroupId = groupId ?? this.selectedGroupId();
    if (!targetGroupId) {
      if(this.itemGroups().length === 0) this.addGroup();
      else {
        this.notificationService.show('Selecione um grupo para adicionar o item.', 'warning');
        return;
      }
    }

    this.unassignedItems.update(items => items.filter(i => i.id !== item.id));
    this.itemGroups.update(groups => groups.map(g => {
      if (g.id === (groupId ?? this.selectedGroupId())) {
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

  // --- Discount Methods ---
  openDiscountModal(item: OrderItem) {
    this.editingDiscountItem.set(item);
    this.discountType.set(item.discount_type || 'percentage');
    this.discountValue.set(item.discount_value || null);
    this.isDiscountModalOpen.set(true);
  }

  closeDiscountModal() {
    this.isDiscountModalOpen.set(false);
  }

  async saveDiscount() {
    const item = this.editingDiscountItem();
    if (!item) return;
    const { success, error } = await this.posDataService.applyDiscountToOrderItems([item.id], this.discountValue() !== null && this.discountValue()! > 0 ? this.discountType() : null, this.discountValue());
    if (success) this.closeDiscountModal();
    else await this.notificationService.alert(`Erro ao aplicar desconto: ${error?.message}`);
  }

  async removeDiscount() {
    const item = this.editingDiscountItem();
    if (!item) return;
    const { success, error } = await this.posDataService.applyDiscountToOrderItems([item.id], null, null);
    if (success) this.closeDiscountModal();
    else await this.notificationService.alert(`Erro ao remover desconto: ${error?.message}`);
  }
  
  async emitNfce() {
    const order = this.order();
    if (!order) return;

    this.isEmittingNfce.set(true);

    const { success, error, data } = await this.focusNFeService.emitNfce(order.id);

    if (success) {
        if (data.status === 'autorizado') {
            this.notificationService.show('NFC-e autorizada com sucesso!', 'success');
        } else {
            const statusMessage = data.mensagem_sefaz || data.status;
            this.notificationService.show(`Status NFC-e: ${statusMessage}`, 'info');
        }
    } else {
        const errorMessage = (error as any)?.message || 'Erro desconhecido.';
        await this.notificationService.alert(`Falha ao emitir NFC-e: ${errorMessage}`, 'Erro');
    }

    this.isEmittingNfce.set(false);
  }
}