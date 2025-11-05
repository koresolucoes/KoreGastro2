import { Component, ChangeDetectionStrategy, input, output, signal, InputSignal, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProcessedIfoodOrder } from '../ifood-kds.component';

@Component({
  selector: 'app-reject-dispute-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reject-dispute-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RejectDisputeModalComponent {
  order: InputSignal<ProcessedIfoodOrder | null> = input.required<ProcessedIfoodOrder | null>();
  
  closeModal: OutputEmitterRef<void> = output<void>();
  confirmRejection: OutputEmitterRef<string> = output<string>();

  rejectionReason = signal('');

  onConfirm() {
    if (this.rejectionReason().trim()) {
      this.confirmRejection.emit(this.rejectionReason().trim());
    }
  }
}