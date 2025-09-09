import { Component, ChangeDetectionStrategy, input, output, InputSignal, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Table } from '../../../models/db.models';

@Component({
  selector: 'app-move-order-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './move-order-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MoveOrderModalComponent {
  sourceTable: InputSignal<Table | null> = input.required<Table | null>();
  availableTables: InputSignal<Table[]> = input.required<Table[]>();

  closeModal: OutputEmitterRef<void> = output<void>();
  moveOrder: OutputEmitterRef<Table> = output<Table>();

  onMoveOrder(destinationTable: Table) {
    this.moveOrder.emit(destinationTable);
  }

  onClose() {
    this.closeModal.emit();
  }
}
