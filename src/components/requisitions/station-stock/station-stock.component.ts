
import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InventoryStateService } from '../../../services/inventory-state.service';
import { PosStateService } from '../../../services/pos-state.service';
import { OperationalAuthService } from '../../../services/operational-auth.service';

@Component({
  selector: 'app-station-stock',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex flex-col h-full gap-4">
      <!-- Filters -->
      <div class="flex flex-col md:flex-row gap-4 bg-gray-800 p-4 rounded-lg border border-gray-700">
        <div class="flex-1">
          <label class="block text-xs font-medium text-gray-400 mb-1">Selecionar Estação</label>
          <select 
            [ngModel]="selectedStationId()" 
            (ngModelChange)="selectedStationId.set($event)" 
            class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option [value]="null">Todas as Estações</option>
            @for(station of stations(); track station.id) {
              <option [value]="station.id">{{ station.name }}</option>
            }
          </select>
        </div>
        <div class="flex-1">
          <label class="block text-xs font-medium text-gray-400 mb-1">Buscar Insumo</label>
          <div class="relative">
            <input 
              type="text" 
              [value]="searchTerm()" 
              (input)="searchTerm.set($any($event.target).value)" 
              placeholder="Nome do ingrediente..." 
              class="w-full bg-gray-700 border border-gray-600 rounded-lg pl-9 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <span class="material-symbols-outlined absolute left-2.5 top-2 text-gray-400 text-lg">search</span>
          </div>
        </div>
      </div>

      <!-- Stock List -->
      <div class="flex-1 overflow-y-auto">
        @if(filteredStock().length === 0) {
          <div class="flex flex-col items-center justify-center h-64 text-gray-500 bg-gray-800 rounded-lg border-2 border-dashed border-gray-700">
            <span class="material-symbols-outlined text-4xl mb-2">inventory_2</span>
            <p>Nenhum estoque encontrado para os filtros selecionados.</p>
          </div>
        } @else {
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            @for(item of filteredStock(); track item.id) {
              <div class="bg-gray-800 border-l-4 border-l-blue-500 rounded-lg p-4 shadow-sm hover:bg-gray-700/50 transition-colors">
                <div class="flex justify-between items-start mb-2">
                  <h3 class="font-bold text-white text-lg truncate" [title]="item.ingredients?.name">{{ item.ingredients?.name }}</h3>
                  <span class="text-xs font-mono text-gray-500 bg-gray-900 px-2 py-1 rounded">{{ item.stations?.name }}</span>
                </div>
                
                <div class="flex items-end gap-2 mt-4">
                  <span class="text-3xl font-bold text-blue-400">{{ item.quantity | number:'1.0-3' }}</span>
                  <span class="text-gray-400 font-medium mb-1">{{ item.ingredients?.unit }}</span>
                </div>
                
                <div class="mt-4 pt-3 border-t border-gray-700/50 flex justify-between items-center text-xs text-gray-400">
                  <span>Última reposição:</span>
                  <span>{{ item.last_restock_date ? (item.last_restock_date | date:'dd/MM HH:mm') : 'N/A' }}</span>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StationStockComponent {
  private inventoryState = inject(InventoryStateService);
  private posState = inject(PosStateService);
  private operationalAuth = inject(OperationalAuthService);

  stations = this.posState.stations;
  stationStocks = this.inventoryState.stationStocks;
  activeEmployee = this.operationalAuth.activeEmployee;

  selectedStationId = signal<string | null>(null);
  searchTerm = signal('');

  constructor() {
    // Auto-select station if the logged-in employee is assigned to one
    effect(() => {
      const employee = this.activeEmployee();
      const allStations = this.stations();
      
      if (employee && allStations.length > 0) {
        const assignedStation = allStations.find(s => s.employee_id === employee.id);
        if (assignedStation) {
          this.selectedStationId.set(assignedStation.id);
        }
      }
    }, { allowSignalWrites: true });
  }

  filteredStock = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const stationId = this.selectedStationId();
    let stocks = this.stationStocks();

    if (stationId) {
      stocks = stocks.filter(s => s.station_id === stationId);
    }

    if (term) {
      stocks = stocks.filter(s => s.ingredients?.name.toLowerCase().includes(term));
    }

    return stocks.sort((a, b) => (a.ingredients?.name || '').localeCompare(b.ingredients?.name || ''));
  });
}
