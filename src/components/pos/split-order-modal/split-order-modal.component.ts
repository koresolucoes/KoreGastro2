import { Component, ChangeDetectionStrategy, input, output, InputSignal, OutputEmitterRef, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Table, Order, OrderItem } from '../../../models/db.models';

@Component({
  selector: 'app-split-order-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './split-order-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SplitOrderModalComponent {
  sourceOrder: InputSignal<Order | null> = input.required<Order | null>();
  sourceTable: InputSignal<Table | null> = input.required<Table | null>();
  availableTables: InputSignal<Table[]> = input.required<Table[]>();

  closeModal: OutputEmitterRef<void> = output<void>();
  splitOrder: OutputEmitterRef<{ destinationTable: Table, itemsToMove: { itemId: string, quantity: number }[] }> = output();

  splitQuantities = signal<Record<string, number>>({});
  selectedDestination = signal<Table | null>(null);

  orderItems = computed(() => {
    const order = this.sourceOrder();
    if (!order) return [];
    return order.order_items || [];
  });

  canIncrement(item: OrderItem) {
    const current = this.splitQuantities()[item.id] || 0;
    return current < item.quantity;
  }

  canDecrement(item: OrderItem) {
    const current = this.splitQuantities()[item.id] || 0;
    return current > 0;
  }

  increment(item: OrderItem) {
    if (!this.canIncrement(item)) return;
    this.splitQuantities.update(q => ({ ...q, [item.id]: (q[item.id] || 0) + 1 }));
  }

  decrement(item: OrderItem) {
    if (!this.canDecrement(item)) return;
    this.splitQuantities.update(q => ({ ...q, [item.id]: (q[item.id] || 0) - 1 }));
  }

  getSplitQuantity(itemId: string) {
    return this.splitQuantities()[itemId] || 0;
  }

  selectDestination(table: Table) {
    this.selectedDestination.set(table);
  }

  canConfirm() {
    const hasItems = Object.values(this.splitQuantities()).some(q => q > 0);
    const hasDest = this.selectedDestination() !== null;
    return hasItems && hasDest;
  }

  onConfirm() {
    if (!this.canConfirm()) return;
    
    const itemsToMove = Object.entries(this.splitQuantities())
      .filter(([id, q]) => q > 0)
      .map(([id, q]) => ({ itemId: id, quantity: q }));

    this.splitOrder.emit({
      destinationTable: this.selectedDestination()!,
      itemsToMove
    });
  }

  onClose() {
    this.closeModal.emit();
  }
}
