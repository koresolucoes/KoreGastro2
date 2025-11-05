import { Component, ChangeDetectionStrategy, input, output, computed, InputSignal, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProcessedIfoodOrder } from '../ifood-kds.component';

@Component({
  selector: 'app-order-details-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './order-details-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderDetailsModalComponent {
  order: InputSignal<ProcessedIfoodOrder | null> = input.required<ProcessedIfoodOrder | null>();
  closeModal: OutputEmitterRef<void> = output<void>();

  orderTotal = computed(() => {
    const currentOrder = this.order();
    if (!currentOrder) return 0;
    return currentOrder.order_items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  });

  orderBenefitsTotal = computed(() => {
    const currentOrder = this.order();
    if (!currentOrder?.ifood_benefits || !Array.isArray(currentOrder.ifood_benefits)) {
      return 0;
    }
    return currentOrder.ifood_benefits.reduce((acc: number, benefit: any) => acc + (benefit.value || 0), 0);
  });

  formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
}
