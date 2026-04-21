
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
    <div class="flex flex-col h-full gap-5">
      
      <!-- Sub-Tabs for Mode -->
      <div class="flex gap-2 bg-surface border border-subtle p-1.5 rounded-xl self-start custom-scrollbar overflow-x-auto">
          <button (click)="viewMode.set('current')" class="px-5 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all focus:outline-none whitespace-nowrap" [class.bg-brand]="viewMode() === 'current'" [class.text-white]="viewMode() === 'current'" [class.shadow-sm]="viewMode() === 'current'" [class.text-muted]="viewMode() !== 'current'" [class.hover:text-title]="viewMode() !== 'current'">
              Estoque Atual
          </button>
          <button (click)="viewMode.set('history')" class="px-5 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all focus:outline-none whitespace-nowrap" [class.bg-brand]="viewMode() === 'history'" [class.text-white]="viewMode() === 'history'" [class.shadow-sm]="viewMode() === 'history'" [class.text-muted]="viewMode() !== 'history'" [class.hover:text-title]="viewMode() !== 'history'">
              Histórico de Entradas
          </button>
      </div>

      <!-- Filters -->
      <div class="flex flex-col md:flex-row gap-5 bg-surface-elevated p-5 rounded-2xl border border-subtle shadow-sm">
        <div class="flex-1">
          <label class="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">Selecionar Estação</label>
          <div class="relative">
            <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[16px]">storefront</span>
            <select 
              [ngModel]="selectedStationId()" 
              (ngModelChange)="selectedStationId.set($event)" 
              class="w-full bg-surface border border-strong rounded-lg pl-9 pr-3 py-2.5 text-sm font-bold text-title focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all appearance-none cursor-pointer">
              <option [value]="null">Todas as Estações</option>
              @for(station of stations(); track station.id) {
                <option [value]="station.id">{{ station.name }}</option>
              }
            </select>
            <span class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none">expand_more</span>
          </div>
        </div>
        <div class="flex-1">
          <label class="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">Buscar</label>
          <div class="relative">
             <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[16px]">search</span>
            <input 
              type="text" 
              [value]="searchTerm()" 
              (input)="searchTerm.set($any($event.target).value)" 
              [placeholder]="viewMode() === 'current' ? 'Nome do ingrediente...' : 'Ingrediente ou ID...'" 
              class="w-full bg-surface border border-strong rounded-lg pl-9 pr-4 py-2.5 text-sm text-title placeholder-muted focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand font-medium transition-all">
          </div>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto custom-scrollbar pb-6 pr-2">
        @if(viewMode() === 'current') {
            <!-- CURRENT STOCK VIEW -->
            @if(filteredStock().length === 0) {
              <div class="flex flex-col items-center justify-center py-20 opacity-70 border border-dashed border-subtle rounded-2xl bg-surface/30">
                 <span class="material-symbols-outlined text-4xl text-muted mb-2">inventory_2</span>
                <p class="text-[11px] font-black uppercase tracking-widest text-muted">Nenhum estoque encontrado.</p>
              </div>
            } @else {
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                @for(item of filteredStock(); track item.id) {
                  <div class="bg-surface-elevated border-l-[3px] border-l-brand border border-subtle border-l-transparent rounded-2xl p-5 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all group">
                    <div class="flex justify-between items-start mb-4">
                      <h3 class="font-black text-title text-base tracking-tight truncate mr-2" [title]="item.ingredients?.name">{{ item.ingredients?.name }}</h3>
                      <span class="text-[10px] font-bold text-muted bg-surface border border-subtle px-2 py-0.5 rounded-lg whitespace-nowrap">{{ item.stations?.name }}</span>
                    </div>
                    
                    <div class="flex flex-col gap-1 mt-2">
                      <div class="flex items-baseline gap-1.5">
                         <span class="text-3xl font-black text-brand tracking-tight">{{ item.quantity | number:'1.0-3' }}</span>
                         <span class="text-[11px] text-muted font-bold">{{ item.ingredients?.unit }}</span>
                      </div>
                    </div>
                    
                    <div class="mt-5 pt-3 border-t border-subtle flex justify-between items-center text-[10px] uppercase font-bold tracking-widest text-muted group-hover:text-title transition-colors">
                      <span>Última reposição</span>
                      <span>{{ item.last_restock_date ? (item.last_restock_date | date:'dd/MM HH:mm') : 'N/A' }}</span>
                    </div>
                  </div>
                }
              </div>
            }
        } @else {
            <!-- HISTORY VIEW -->
            @if(filteredHistory().length === 0) {
                 <div class="flex flex-col items-center justify-center py-20 opacity-70 border border-dashed border-subtle rounded-2xl bg-surface/30">
                    <span class="material-symbols-outlined text-4xl text-muted mb-2">history</span>
                    <p class="text-[11px] font-black uppercase tracking-widest text-muted">Nenhum histórico recente.</p>
                </div>
            } @else {
                <div class="space-y-5">
                    @for(req of filteredHistory(); track req.id) {
                        <div class="bg-surface-elevated border border-subtle rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                            <div class="bg-surface/50 p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-subtle gap-3">
                                <div>
                                    <span class="text-[10px] font-mono text-muted uppercase tracking-widest">#{{ req.id.slice(0,8) }}</span>
                                    <span class="text-sm font-black text-title ml-3 tracking-tight">{{ req.stations?.name }}</span>
                                </div>
                                <div class="text-left sm:text-right">
                                    <p class="text-[11px] text-success font-black uppercase tracking-widest flex items-center gap-1 sm:justify-end"><span class="material-symbols-outlined text-[14px]">check_circle</span> Entregue em {{ req.processed_at | date:'dd/MM HH:mm' }}</p>
                                    <p class="text-[10px] font-bold text-muted mt-0.5">Por: {{ req.processor?.name || 'Sistema' }}</p>
                                </div>
                            </div>
                            <div class="p-5">
                                <table class="w-full text-left text-title">
                                    <thead class="text-[10px] font-black tracking-widest text-muted uppercase border-b border-subtle">
                                        <tr>
                                            <th class="py-2 px-2">Item</th>
                                            <th class="py-2 px-2 text-center">Solicitado</th>
                                            <th class="py-2 px-2 text-right">Recebido</th>
                                        </tr>
                                    </thead>
                                    <tbody class="text-sm">
                                        @for(item of req.requisition_items; track item.id) {
                                            <tr class="border-b border-subtle/50 last:border-0 hover:bg-surface/30 transition-colors">
                                                <td class="py-3 px-2 font-bold">{{ item.ingredients?.name }}</td>
                                                <td class="py-3 px-2 text-center text-muted font-medium">{{ item.quantity_requested }} {{ item.unit }}</td>
                                                <td class="py-3 px-2 text-right font-black" [class.text-success]="item.quantity_delivered === item.quantity_requested" [class.text-warning]="item.quantity_delivered !== item.quantity_requested">
                                                    {{ item.quantity_delivered }} {{ item.unit }}
                                                </td>
                                            </tr>
                                        }
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    }
                </div>
            }
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
  // Requisitions history from global state
  allRequisitions = this.inventoryState.requisitions; 
  activeEmployee = this.operationalAuth.activeEmployee;

  selectedStationId = signal<string | null>(null);
  searchTerm = signal('');
  viewMode = signal<'current' | 'history'>('current');

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

  filteredHistory = computed(() => {
      const stationId = this.selectedStationId();
      const term = this.searchTerm().toLowerCase();
      
      // Filter for DELIVERED requisitions only
      let reqs = this.allRequisitions().filter(r => r.status === 'DELIVERED');

      if (stationId) {
          reqs = reqs.filter(r => r.station_id === stationId);
      }
      
      if (term) {
          reqs = reqs.filter(r => 
              r.id.toLowerCase().includes(term) ||
              r.requisition_items?.some(i => i.ingredients?.name.toLowerCase().includes(term))
          );
      }

      // Sort by processed date (newest first)
      return reqs.sort((a, b) => {
          const dateA = new Date(a.processed_at || 0).getTime();
          const dateB = new Date(b.processed_at || 0).getTime();
          return dateB - dateA;
      });
  });
}
