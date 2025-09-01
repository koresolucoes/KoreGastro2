import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './inventory.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryComponent {
    dataService = inject(SupabaseService);
    ingredients = this.dataService.ingredients;

    isLowStock(stock: number, minStock: number): boolean {
        return stock < minStock;
    }
}