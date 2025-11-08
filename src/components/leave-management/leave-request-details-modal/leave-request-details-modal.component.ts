import { Component, ChangeDetectionStrategy, input, output, computed, signal, InputSignal, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LeaveRequest } from '../../../models/db.models';

@Component({
  selector: 'app-leave-request-details-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './leave-request-details-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeaveRequestDetailsModalComponent {
  request: InputSignal<LeaveRequest | null> = input.required<LeaveRequest | null>();
  close: OutputEmitterRef<void> = output<void>();
  approve: OutputEmitterRef<string | null> = output<string | null>(); // Emits manager notes
  reject: OutputEmitterRef<string | null> = output<string | null>(); // Emits manager notes

  managerNotes = signal('');

  isImage = computed(() => {
    const url = this.request()?.attachment_url;
    if (!url) return false;
    return /\.(jpg|jpeg|png|webp|gif)$/i.test(url);
  });

  formatDateRange(start: string, end: string): string {
    const options: Intl.DateTimeFormatOptions = { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' };
    const startDate = new Date(start).toLocaleDateString('pt-BR', options);
    if (start === end) {
      return startDate;
    }
    const endDate = new Date(end).toLocaleDateString('pt-BR', options);
    return `${startDate} - ${endDate}`;
  }

  onApprove() {
    this.approve.emit(this.managerNotes() || null);
  }

  onReject() {
    this.reject.emit(this.managerNotes() || null);
  }
}
