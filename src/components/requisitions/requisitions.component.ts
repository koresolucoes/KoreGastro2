
import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RequisitionCreateComponent } from './requisition-create/requisition-create.component';
import { RequisitionListComponent } from './requisition-list/requisition-list.component';
import { StationStockComponent } from './station-stock/station-stock.component';
import { RequisitionReportsComponent } from './requisition-reports/requisition-reports.component';
import { SupabaseStateService } from '../../services/supabase-state.service';

@Component({
  selector: 'app-requisitions',
  standalone: true,
  imports: [CommonModule, RequisitionCreateComponent, RequisitionListComponent, StationStockComponent, RequisitionReportsComponent],
  template: `
    <div class="px-6 py-6 pb-20 md:pb-6">
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 class="text-3xl font-black text-title tracking-tight">Requisições & Estoque de Praça</h1>
          <p class="text-[11px] font-bold uppercase tracking-widest text-muted mt-1">Solicite insumos, gerencie entregas e controle custos por setor.</p>
        </div>
      </div>

      <!-- Tab Navigation -->
      <div class="mb-6 border-b border-subtle">
        <nav class="-mb-px flex space-x-6 overflow-x-auto custom-scrollbar">
            <button (click)="activeTab.set('create')" 
                    class="py-3 px-1 border-b-2 text-[11px] font-black uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap outline-none"
                    [class.border-brand]="activeTab() === 'create'"
                    [class.text-title]="activeTab() === 'create'"
                    [class.border-transparent]="activeTab() !== 'create'"
                    [class.text-muted]="activeTab() !== 'create'"
                    [class.hover:text-title]="activeTab() !== 'create'">
                <span class="material-symbols-outlined text-[16px]">add_shopping_cart</span>
                Nova Requisição
            </button>
            <button (click)="activeTab.set('stock')" 
                    class="py-3 px-1 border-b-2 text-[11px] font-black uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap outline-none"
                    [class.border-brand]="activeTab() === 'stock'"
                    [class.text-title]="activeTab() === 'stock'"
                    [class.border-transparent]="activeTab() !== 'stock'"
                    [class.text-muted]="activeTab() !== 'stock'"
                    [class.hover:text-title]="activeTab() !== 'stock'">
                <span class="material-symbols-outlined text-[16px]">shelves</span>
                Estoque da Praça
            </button>
            <button (click)="activeTab.set('manage')" 
                    class="py-3 px-1 border-b-2 text-[11px] font-black uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap outline-none"
                    [class.border-brand]="activeTab() === 'manage'"
                    [class.text-title]="activeTab() === 'manage'"
                    [class.border-transparent]="activeTab() !== 'manage'"
                    [class.text-muted]="activeTab() !== 'manage'"
                    [class.hover:text-title]="activeTab() !== 'manage'">
                <span class="material-symbols-outlined text-[16px]">manage_search</span>
                Gerenciar Pedidos
            </button>
            <button (click)="activeTab.set('reports')" 
                    class="py-3 px-1 border-b-2 text-[11px] font-black uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap outline-none"
                    [class.border-brand]="activeTab() === 'reports'"
                    [class.text-title]="activeTab() === 'reports'"
                    [class.border-transparent]="activeTab() !== 'reports'"
                    [class.text-muted]="activeTab() !== 'reports'"
                    [class.hover:text-title]="activeTab() !== 'reports'">
                <span class="material-symbols-outlined text-[16px]">pie_chart</span>
                Custos por Setor
            </button>
        </nav>
      </div>

      <div class="flex-1">
         @switch (activeTab()) {
            @case ('create') {
                <app-requisition-create></app-requisition-create>
            }
            @case ('stock') {
                <app-station-stock></app-station-stock>
            }
            @case ('manage') {
                <app-requisition-list></app-requisition-list>
            }
            @case ('reports') {
                <app-requisition-reports></app-requisition-reports>
            }
         }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequisitionsComponent implements OnInit {
  private supabaseState = inject(SupabaseStateService);
  
  activeTab = signal<'create' | 'manage' | 'stock' | 'reports'>('create');

  ngOnInit() {
      // Force load of historical data (requisitions, logs) when entering this module
      this.supabaseState.loadBackOfficeData();
  }
}

