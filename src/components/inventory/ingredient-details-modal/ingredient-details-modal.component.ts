import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, input, output, InputSignal, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Ingredient, InventoryLot } from '../../../models/db.models';
import { RecipeStateService } from '../../../services/recipe-state.service';
import { PosStateService } from '../../../services/pos-state.service';

@Component({
  selector: 'app-ingredient-details-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ingredient-details-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IngredientDetailsModalComponent {
  ingredient: InputSignal<Ingredient> = input.required<Ingredient>();
  lots: InputSignal<InventoryLot[]> = input.required<InventoryLot[]>();
  close: OutputEmitterRef<void> = output<void>();
  
  private recipeState = inject(RecipeStateService);
  private posState = inject(PosStateService);

  posCategoryName = computed(() => {
    const ing = this.ingredient();
    if (!ing.pos_category_id) return 'N/A';
    return this.recipeState.categories().find(c => c.id === ing.pos_category_id)?.name || 'Desconhecido';
  });
  
  stationName = computed(() => {
    const ing = this.ingredient();
    if (!ing.station_id) return 'N/A';
    return this.posState.stations().find(s => s.id === ing.station_id)?.name || 'Desconhecido';
  });

  totalStockValue = computed(() => {
    const ing = this.ingredient();
    return ing.stock * ing.cost;
  });
}