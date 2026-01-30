
import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RequisitionCreateComponent } from './requisition-create/requisition-create.component';
import { RequisitionListComponent } from './requisition-list/requisition-list.component';

@Component({
  selector: 'app-requisitions',
  standalone: true,
  imports: [CommonModule, RequisitionCreateComponent, RequisitionListComponent],
  template: `
    <div class="container mx-auto h-full flex flex-col">
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 class="text-3xl font-bold text-white">Requisições Internas</h1>
          <p class="text-gray-400 mt-1">Solicite insumos para sua praça ou gerencie as entregas do estoque central.</p>
        </div>
      </div>

      <!-- Tab Navigation -->
      <div class="mb-4 border-b border-gray-700">
        <nav class="-mb-px flex space-x-6">
            <button (click)="activeTab.set('create')" 
                    class="py-3 px-1 border-b-2 text-sm font-medium transition-colors flex items-center gap-2"
                    [class.border-blue-500]="activeTab() === 'create'"
                    [class.text-white]="activeTab() === 'create'"
                    [class.border-transparent]="activeTab() !== 'create'"
                    [class.text-gray-400]="activeTab() !== 'create'">
                <span class="material-symbols-outlined text-lg">add_shopping_cart</span>
                Nova Requisição
            </button>
            <button (click)="activeTab.set('manage')" 
                    class="py-3 px-1 border-b-2 text-sm font-medium transition-colors flex items-center gap-2"
                    [class.border-blue-500]="activeTab() === 'manage'"
                    [class.text-white]="activeTab() === 'manage'"
                    [class.border-transparent]="activeTab() !== 'manage'"
                    [class.text-gray-400]="activeTab() !== 'manage'">
                <span class="material-symbols-outlined text-lg">manage_search</span>
                Gerenciar Pedidos
            </button>
        </nav>
      </div>

      <div class="flex-1 overflow-hidden">
         @if(activeTab() === 'create') {
            <app-requisition-create></app-requisition-create>
         } @else {
            <app-requisition-list></app-requisition-list>
         }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequisitionsComponent {
  activeTab = signal<'create' | 'manage'>('create');
}
