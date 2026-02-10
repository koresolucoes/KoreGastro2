
import { Component, ChangeDetectionStrategy, inject, signal, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InventoryDataService } from '../../../services/inventory-data.service';
import { InventoryStateService } from '../../../services/inventory-state.service';
import { InventoryLog } from '../../../models/db.models';

@Component({
  selector: 'app-inventory-logs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inventory-logs.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryLogsComponent {
  private inventoryDataService = inject(InventoryDataService);
  private inventoryState = inject(InventoryStateService);

  ingredients = this.inventoryState.ingredients;
  
  // Filters
  startDate = signal(new Date().toISOString().split('T')[0]);
  endDate = signal(new Date().toISOString().split('T')[0]);
  selectedIngredientId = signal<string | null>(null);

  isLoading = signal(false);
  logs = signal<InventoryLog[]>([]);

  constructor() {
      // Load logs automatically when filters change
      effect(() => {
          const start = this.startDate();
          const end = this.endDate();
          const ingredientId = this.selectedIngredientId();
          this.loadLogs(start, end, ingredientId);
      }, { allowSignalWrites: true });
  }

  async loadLogs(start: string, end: string, ingredientId: string | null) {
      this.isLoading.set(true);
      const { data, error } = await this.inventoryDataService.getInventoryLogs(start, end, ingredientId);
      if (!error) {
          this.logs.set(data);
      } else {
          console.error("Failed to load inventory logs", error);
      }
      this.isLoading.set(false);
  }
}
