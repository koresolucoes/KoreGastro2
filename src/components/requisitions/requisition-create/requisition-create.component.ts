
import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PosStateService } from '../../../services/pos-state.service';
import { InventoryStateService } from '../../../services/inventory-state.service';
import { RequisitionService } from '../../../services/requisition.service';
import { NotificationService } from '../../../services/notification.service';
import { Ingredient } from '../../../models/db.models';

interface RequestItem {
  ingredient: Ingredient;
  quantity: number;
}

@Component({
  selector: 'app-requisition-create',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="bg-gray-800 rounded-lg p-6 h-full flex flex-col">
      <h2 class="text-xl font-bold text-white mb-4">Nova Requisição para Praça</h2>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">Selecione a Estação (Destino)</label>
          <select [ngModel]="selectedStationId()" (ngModelChange)="selectedStationId.set($event)" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option [value]="null">Selecione...</option>
            @for(station of stations(); track station.id) {
              <option [value]="station.id">{{ station.name }}</option>
            }
          </select>
        </div>
        <div>
           <label class="block text-sm font-medium text-gray-300 mb-1">Buscar Insumo</label>
           <div class="relative">
             <input 
                type="text" 
                [value]="searchTerm()" 
                (input)="searchTerm.set($any($event.target).value)" 
                placeholder="Digite para buscar..."
                class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                
                @if(searchTerm().length > 0 && filteredIngredients().length > 0) {
                   <div class="absolute top-full left-0 right-0 bg-gray-600 border border-gray-500 rounded-lg mt-1 z-10 max-h-48 overflow-y-auto shadow-xl">
                      <ul>
                        @for(ing of filteredIngredients(); track ing.id) {
                           <li (click)="addItem(ing)" class="p-3 hover:bg-gray-500 cursor-pointer text-white flex justify-between">
                              <span>{{ ing.name }}</span>
                              <span class="text-xs text-gray-300">{{ ing.stock }} {{ ing.unit }} (Estoque Central)</span>
                           </li>
                        }
                      </ul>
                   </div>
                }
           </div>
        </div>
      </div>

      <!-- Items List -->
      <div class="flex-1 overflow-y-auto bg-gray-900/50 rounded-lg p-4 mb-4 border border-gray-700">
         @if(cartItems().length === 0) {
            <p class="text-center text-gray-500 py-10">Nenhum item adicionado à requisição.</p>
         } @else {
            <table class="w-full text-left text-sm text-gray-300">
               <thead>
                  <tr class="border-b border-gray-700 text-xs uppercase">
                     <th class="py-2">Item</th>
                     <th class="py-2 w-32 text-center">Quantidade</th>
                     <th class="py-2 w-16">Unid.</th>
                     <th class="py-2 w-10"></th>
                  </tr>
               </thead>
               <tbody>
                  @for(item of cartItems(); track item.ingredient.id; let i = $index) {
                     <tr class="border-b border-gray-700/50">
                        <td class="py-2 font-medium text-white">{{ item.ingredient.name }}</td>
                        <td class="py-2">
                           <input type="number" [(ngModel)]="item.quantity" class="w-full bg-gray-700 text-center text-white rounded p-1" min="0">
                        </td>
                        <td class="py-2">{{ item.ingredient.unit }}</td>
                        <td class="py-2 text-right">
                           <button (click)="removeItem(i)" class="text-red-400 hover:text-red-300">
                              <span class="material-symbols-outlined text-lg">delete</span>
                           </button>
                        </td>
                     </tr>
                  }
               </tbody>
            </table>
         }
      </div>

      <div class="mb-4">
         <label class="block text-sm font-medium text-gray-300 mb-1">Observações (Opcional)</label>
         <textarea [ngModel]="notes()" (ngModelChange)="notes.set($event)" rows="2" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white"></textarea>
      </div>

      <div class="flex justify-end">
         <button (click)="submitRequisition()" [disabled]="!canSubmit() || isSubmitting()" class="bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-6 rounded-lg transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center gap-2">
            @if(isSubmitting()) {
                <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            }
            Solicitar
         </button>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequisitionCreateComponent {
  posState = inject(PosStateService);
  inventoryState = inject(InventoryStateService);
  requisitionService = inject(RequisitionService);
  notificationService = inject(NotificationService);

  stations = this.posState.stations;
  ingredients = this.inventoryState.ingredients;
  
  selectedStationId = signal<string | null>(null);
  searchTerm = signal('');
  cartItems = signal<RequestItem[]>([]);
  notes = signal('');
  isSubmitting = signal(false);

  filteredIngredients = computed(() => {
    const term = this.searchTerm().toLowerCase();
    if (term.length < 2) return [];
    
    // Filter out items already in cart
    const inCartIds = new Set(this.cartItems().map(i => i.ingredient.id));
    
    return this.ingredients()
      .filter(i => i.name.toLowerCase().includes(term) && !inCartIds.has(i.id))
      .slice(0, 10);
  });

  addItem(ingredient: Ingredient) {
    this.cartItems.update(items => [...items, { ingredient, quantity: 1 }]);
    this.searchTerm.set('');
  }

  removeItem(index: number) {
    this.cartItems.update(items => items.filter((_, i) => i !== index));
  }

  canSubmit = computed(() => !!this.selectedStationId() && this.cartItems().length > 0 && this.cartItems().every(i => i.quantity > 0));

  async submitRequisition() {
    if (!this.canSubmit()) return;
    
    this.isSubmitting.set(true);
    const payload = this.cartItems().map(i => ({
        ingredientId: i.ingredient.id,
        quantity: i.quantity,
        unit: i.ingredient.unit
    }));

    const { success, error } = await this.requisitionService.createRequisition(this.selectedStationId()!, payload, this.notes());

    if (success) {
        this.notificationService.show('Requisição enviada com sucesso!', 'success');
        this.cartItems.set([]);
        this.notes.set('');
        this.selectedStationId.set(null);
    } else {
        this.notificationService.show(`Erro ao enviar: ${error?.message}`, 'error');
    }
    this.isSubmitting.set(false);
  }
}
