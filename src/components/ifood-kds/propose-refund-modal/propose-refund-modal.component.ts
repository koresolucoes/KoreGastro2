import { Component, ChangeDetectionStrategy, input, output, signal, computed, InputSignal, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
// FIX: Changed import path for ProcessedIfoodOrder to the correct model file.
import { ProcessedIfoodOrder } from '../../../models/app.models';

@Component({
  selector: 'app-propose-refund-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './propose-refund-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProposeRefundModalComponent {
  order: InputSignal<ProcessedIfoodOrder | null> = input.required<ProcessedIfoodOrder | null>();
  
  closeModal: OutputEmitterRef<void> = output<void>();
  confirmRefund: OutputEmitterRef<{ amount: number }> = output();

  refundAmount = signal(0);

  maxRefund = computed(() => {
    const refundAlternative = this.order()?.ifood_dispute_details?.alternatives?.find((alt: any) => alt.type === 'REFUND');
    return (refundAlternative?.metadata?.maxAmount?.value || 0) / 100;
  });

  isAmountValid = computed(() => {
    const amount = this.refundAmount();
    return amount > 0 && amount <= this.maxRefund();
  });

  onConfirm() {
    if (this.isAmountValid()) {
      this.confirmRefund.emit({ amount: this.refundAmount() });
    }
  }
}
