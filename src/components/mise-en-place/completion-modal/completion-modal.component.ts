
import { Component, ChangeDetectionStrategy, input, output, signal, computed, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductionTask, Recipe } from '../../../models/db.models';

export interface CompletionData {
  quantityProduced: number;
  lotNumber: string;
  expirationDate: string;
  notes: string | null;
  printLabel: boolean;
}

@Component({
  selector: 'app-mise-en-place-completion-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './completion-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DatePipe]
})
export class MiseEnPlaceCompletionModalComponent implements OnInit {
  task = input.required<ProductionTask>();
  recipe = input<Recipe | null>(null); // Optional, for shelf life calculation

  close = output<void>();
  save = output<CompletionData>();

  producedQuantity = signal(0);
  lotNumber = signal('');
  expirationDate = signal('');
  notes = signal('');
  printLabel = signal(true);

  taskName = computed(() => {
    const t = this.task();
    return t.recipes?.name || t.custom_task_name || 'Tarefa sem nome';
  });

  ngOnInit() {
    const t = this.task();
    const r = this.recipe();
    const now = new Date();
    
    // Set default quantity
    this.producedQuantity.set(t.quantity_to_produce);

    // Generate Lot Number: YYYYMMDD-HHMM
    const lot = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
    this.lotNumber.set(lot);

    // Calculate Expiration
    let daysToAdd = 3; // Default 3 days
    if (r && r.shelf_life_prepared_days) {
        daysToAdd = r.shelf_life_prepared_days;
    }
    
    const expDate = new Date(now);
    expDate.setDate(expDate.getDate() + daysToAdd);
    this.expirationDate.set(expDate.toISOString().split('T')[0]); // YYYY-MM-DD for input
  }

  confirm() {
    if (this.producedQuantity() <= 0) {
        alert('A quantidade produzida deve ser maior que zero.');
        return;
    }
    if (!this.expirationDate()) {
        alert('A data de validade é obrigatória.');
        return;
    }

    this.save.emit({
        quantityProduced: this.producedQuantity(),
        lotNumber: this.lotNumber(),
        expirationDate: this.expirationDate(),
        notes: this.notes() || null,
        printLabel: this.printLabel()
    });
  }
}
