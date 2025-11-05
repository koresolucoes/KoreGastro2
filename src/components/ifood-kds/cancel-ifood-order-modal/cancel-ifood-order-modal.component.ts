import { Component, ChangeDetectionStrategy, inject, signal, input, output, InputSignal, OutputEmitterRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IfoodCancellationReason } from '../../../services/ifood-menu.service';
// FIX: Changed import path for ProcessedIfoodOrder to the correct model file.
import { ProcessedIfoodOrder } from '../../../models/app.models';

@Component({
  selector: 'app-cancel-ifood-order-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cancel-ifood-order-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CancelIfoodOrderModalComponent implements OnInit {
  order: InputSignal<ProcessedIfoodOrder | null> = input.required<ProcessedIfoodOrder | null>();
  reasons: InputSignal<IfoodCancellationReason[]> = input.required<IfoodCancellationReason[]>();
  
  closeModal: OutputEmitterRef<void> = output<void>();
  confirmCancellation: OutputEmitterRef<{ code: string; reason: string; }> = output();

  selectedReasonCode = signal<string>('');
  comments = signal('');

  ngOnInit() {
    // Pre-select the first reason
    if (this.reasons().length > 0) {
      this.selectedReasonCode.set(this.reasons()[0].code);
    }
  }

  onConfirm() {
    const selectedCode = this.selectedReasonCode();
    const reason = this.reasons().find(r => r.code === selectedCode);
    if (!reason) return;

    let fullReason = reason.description;
    if (this.comments().trim()) {
      fullReason += ` | Obs: ${this.comments().trim()}`;
    }

    this.confirmCancellation.emit({
      code: reason.code,
      reason: fullReason,
    });
  }
}
