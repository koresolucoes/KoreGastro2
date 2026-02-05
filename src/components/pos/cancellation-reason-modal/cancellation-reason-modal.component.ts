
import { Component, ChangeDetectionStrategy, output, signal, input, InputSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-cancellation-reason-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cancellation-reason-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CancellationReasonModalComponent {
  title: InputSignal<string> = input<string>('Confirmar Cancelamento');
  confirm = output<string>();
  close = output<void>();

  reason = signal('');

  onConfirm() {
    if (this.reason().trim()) {
      this.confirm.emit(this.reason().trim());
    }
  }
}
