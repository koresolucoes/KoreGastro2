import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, input, output, InputSignal, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Order, Table } from '../../../models/db.models';
import { PrintingService } from '../../../services/printing.service';

@Component({
  selector: 'app-pre-bill-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pre-bill-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PreBillModalComponent {
  private printingService = inject(PrintingService);
  
  order: InputSignal<Order | null> = input.required<Order | null>();
  table: InputSignal<Table | null> = input.required<Table | null>();
  closeModal: OutputEmitterRef<void> = output<void>();

  serviceFeeApplied = signal(true);
  splitCount = signal(1);

  constructor() {
    effect(() => {
      // Automatically set the split count based on the number of customers at the table
      const customerCount = this.table()?.customer_count;
      if (customerCount && customerCount > 0) {
        this.splitCount.set(customerCount);
      } else {
        this.splitCount.set(1);
      }
    });
  }

  orderSubtotalBeforeDiscount = computed(() => this.order()?.order_items.reduce((sum, item) => sum + (item.price * item.quantity), 0) ?? 0);

  globalDiscountAmount = computed(() => {
    const order = this.order();
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
  
  splitTotal = computed(() => {
    const total = this.orderTotal();
    const count = this.splitCount();
    if (!total || !count || count <= 0) {
      return 0;
    }
    return total / count;
  });

  onSplitCountChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value) && value > 0) {
      this.splitCount.set(value);
    }
  }

  printPreBill() {
    const orderToPrint = this.order();
    if (orderToPrint) {
      this.printingService.printPreBill(orderToPrint, {
        includeServiceFee: this.serviceFeeApplied(),
        splitBy: this.splitCount(),
        total: this.orderTotal()
      });
    }
  }
}
