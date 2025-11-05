import { Component, ChangeDetectionStrategy, input, output, InputSignal, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
// FIX: Changed import path for ProcessedIfoodOrder to the correct model file.
import { ProcessedIfoodOrder } from '../../../models/app.models';
import { IfoodTrackingData } from '../../../services/ifood-menu.service';

@Component({
  selector: 'app-ifood-tracking-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ifood-tracking-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IfoodTrackingModalComponent {
  order: InputSignal<ProcessedIfoodOrder | null> = input.required<ProcessedIfoodOrder | null>();
  trackingData: InputSignal<IfoodTrackingData | null> = input.required<IfoodTrackingData | null>();
  isLoading: InputSignal<boolean> = input.required<boolean>();
  
  closeModal: OutputEmitterRef<void> = output<void>();
}
