import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, untracked, input, output, InputSignal, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Order, Table, OrderItem, DiscountType, Customer } from '../../../models/db.models';
import { PosDataService, PaymentInfo } from '../../../services/pos-data.service';
import { PrintingService } from '../../../services/printing.service';
import { NotificationService } from '../../../services/notification.service';
import { RedeemRewardModalComponent } from '../../shared/redeem-reward-modal/redeem-reward-modal.component';

type PaymentMethod = 'Dinheiro' | 'Cartão de Crédito' | 'Cartão de Débito' | 'PIX' | 'Vale Refeição';

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
  
  order: InputSignal<Order | null> = input.required<Order | null>();
  table: InputSignal<Table | null> = input.required<Table | null>();
  closeModal: OutputEmitterRef<boolean> = output<boolean>(); // Emits true to revert status
  paymentFinalized: OutputEmitterRef<void> = output<void>();

  paymentSuccess = signal(false);
  serviceFeeApplied = signal(true);
  payments = signal<PaymentInfo[]>([]);
  paymentAmountInput = signal('');
  selectedPaymentMethod = signal<PaymentMethod>('Dinheiro');
  isRedeemModalOpen = signal(false);

  // Discount Modal State
  isDiscountModalOpen = signal(false);
  editingDiscountItem = signal<OrderItem | null>(null);
  discountType = signal<DiscountType>('percentage');
  discountValue = signal<number | null>(null);

  customer = computed(() => this.order()?.customers);

  orderSubtotal = computed(() => this.order()?.order_items.reduce((sum, item) => sum + item.price, 0) ?? 0);
  tipAmount = computed(() => this.serviceFeeApplied() ? this.orderSubtotal() * 0.1 : 0);
  orderTotal = computed(() => this.orderSubtotal() + this.tipAmount());
  totalPaid = computed(() => this.payments().reduce((sum, p) => sum + p.amount, 0));
  balanceDue = computed(() => parseFloat((this.orderTotal() - this.totalPaid()).toFixed(2)));
  isPaymentComplete = computed(() => this.balanceDue() <= 0.001);
  change = computed(() => {
    if (this.selectedPaymentMethod() !== 'Dinheiro') return 0;
    const amount = parseFloat(this.paymentAmountInput());
    if (isNaN(amount) || amount <= this.balanceDue()) return 0;
    return parseFloat((amount - this.balanceDue()).toFixed(2));
  });

  constructor() {
    effect(() => {
        untracked(() => {
            this.payments.set([]);
            const balance = this.balanceDue();
            this.paymentAmountInput.set(balance > 0 ? balance.toFixed(2) : '');
        });
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
    
    if (amount > 0) {
      this.payments.update(p => [...p, { method, amount: parseFloat(amount.toFixed(2)) }]);
    }
    
    const newBalance = this.balanceDue();
    this.paymentAmountInput.set(newBalance > 0 ? newBalance.toFixed(2) : '');
    if (newBalance > 0) {
      this.selectedPaymentMethod.set('Dinheiro');
    }
  }

  removePayment(index: number) {
    this.payments.update(p => p.filter((_, i) => i !== index));
    const newBalance = this.balanceDue();
    this.paymentAmountInput.set(newBalance > 0 ? newBalance.toFixed(2) : '');
  }
  
  async finalizePayment() {
    const order = this.order();
    const table = this.table();
    if (!order || !table || !this.isPaymentComplete()) return;

    const confirmed = await this.notificationService.confirm(
      `Confirmar o pagamento de ${this.orderTotal().toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} para a Mesa ${table.number}? Esta ação é irreversível.`,
      'Confirmar Pagamento'
    );
    if (!confirmed) {
      return;
    }
    
    const { success, error } = await this.posDataService.finalizeOrderPayment(
      order.id, table.id, this.orderTotal(), this.payments(), this.tipAmount()
    );

    if (success) {
      this.paymentSuccess.set(true);
    } else {
      await this.notificationService.alert(`Falha ao registrar pagamento. Erro: ${error?.message}`);
    }
  }

  printReceipt() {
    const order = this.order();
    if (order) {
        this.printingService.printCustomerReceipt(order, this.payments());
    }
  }

  finishAndClose() {
      this.paymentFinalized.emit();
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

    const { success, error } = await this.posDataService.applyDiscountToOrderItems(
      [item.id],
      this.discountValue() !== null && this.discountValue()! > 0 ? this.discountType() : null,
      this.discountValue()
    );

    if (success) {
      this.closeDiscountModal();
    } else {
      await this.notificationService.alert(`Erro ao aplicar desconto: ${error?.message}`);
    }
  }

  async removeDiscount() {
    const item = this.editingDiscountItem();
    if (!item) return;

    const { success, error } = await this.posDataService.applyDiscountToOrderItems([item.id], null, null);

    if (success) {
      this.closeDiscountModal();
    } else {
      await this.notificationService.alert(`Erro ao remover desconto: ${error?.message}`);
    }
  }
}