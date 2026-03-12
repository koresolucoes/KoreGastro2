
import { Component, ChangeDetectionStrategy, output, signal, input, InputSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface CancellationResult {
  reason: string;
  returnToStock: boolean;
}

@Component({
  selector: 'app-cancellation-reason-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cancellation-reason-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CancellationReasonModalComponent {
  title: InputSignal<string> = input<string>('Confirmar Cancelamento');
  confirm = output<CancellationResult>();
  close = output<void>();

  reason = signal('');
  returnToStock = signal(true);

  onConfirm() {
    if (this.reason().trim()) {
      this.confirm.emit({
        reason: this.reason().trim(),
        returnToStock: this.returnToStock()
      });
    }
  }
}

