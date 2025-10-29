import { Component, ChangeDetectionStrategy, input, output, signal, computed, InputSignal, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProcessedIfoodOrder } from '../ifood-kds.component';

@Component({
  selector: 'app-verify-code-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './verify-code-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerifyCodeModalComponent {
  order: InputSignal<ProcessedIfoodOrder | null> = input.required<ProcessedIfoodOrder | null>();
  codeType: InputSignal<'pickup' | 'delivery' | null> = input.required<'pickup' | 'delivery' | null>();
  
  closeModal: OutputEmitterRef<void> = output<void>();
  confirmVerification: OutputEmitterRef<string> = output<string>();

  verificationCode = signal('');

  title = computed(() => {
    return this.codeType() === 'pickup' ? 'Validar Código de Retirada' : 'Confirmar Código de Entrega';
  });

  description = computed(() => {
    return this.codeType() === 'pickup'
      ? 'Peça ao cliente o código de 4 dígitos para confirmar a retirada do pedido.'
      : 'Peça ao cliente o código de 4 dígitos para confirmar a entrega do pedido.';
  });

  onConfirm() {
    const code = this.verificationCode().trim();
    if (code.length === 4) {
      this.confirmVerification.emit(code);
    }
  }
}
