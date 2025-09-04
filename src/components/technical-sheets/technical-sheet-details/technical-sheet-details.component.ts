import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FullRecipe } from '../../../models/app.models';
import { SupabaseStateService } from '../../../services/supabase-state.service';
import { inject } from '@angular/core';

@Component({
  selector: 'app-technical-sheet-details',
  standalone: true,
  imports: [CommonModule, CurrencyPipe],
  templateUrl: './technical-sheet-details.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TechnicalSheetDetailsComponent {
  private stateService = inject(SupabaseStateService);
  
  recipe = input.required<FullRecipe>();
  
  edit = output<void>();
  close = output<void>();

  stations = this.stateService.stations;

  getStationName(stationId: string): string {
    return this.stations().find(s => s.id === stationId)?.name || 'N/A';
  }

  get profitMargin(): number {
    const price = this.recipe().price ?? 0;
    const cost = this.recipe().cost.totalCost;
    if (price === 0) return 0;
    return ((price - cost) / price) * 100;
  }
}
