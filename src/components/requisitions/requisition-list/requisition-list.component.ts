
import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InventoryStateService } from '../../../services/inventory-state.service';
import { RequisitionService } from '../../../services/requisition.service';
import { NotificationService } from '../../../services/notification.service';
import { PrintingService } from '../../../services/printing.service';
import { Requisition, RequisitionItem } from '../../../models/db.models';

@Component({
  selector: 'app-requisition-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex flex-col h-full gap-4">
       <!-- Filters -->
       <div class="flex gap-2 overflow-x-auto pb-2">
          <button (click)="filterStatus.set('PENDING')" class="px-4 py-2 rounded-lg text-sm font-medium transition-colors" [class.bg-yellow-600]="filterStatus() === 'PENDING'" [class.text-white]="filterStatus() === 'PENDING'" [class.bg-gray-700]="filterStatus() !== 'PENDING'">Pendentes</button>
          <button (click)="filterStatus.set('DELIVERED')" class="px-4 py-2 rounded-lg text-sm font-medium transition-colors" [class.bg-green-600]="filterStatus() === 'DELIVERED'" [class.text-white]="filterStatus() === 'DELIVERED'" [class.bg-gray-700]="filterStatus() !== 'DELIVERED'">Entregues</button>
          <button (click)="filterStatus.set('REJECTED')" class="px-4 py-2 rounded-lg text-sm font-medium transition-colors" [class.bg-red-600]="filterStatus() === 'REJECTED'" [class.text-white]="filterStatus() === 'REJECTED'" [class.bg-gray-700]="filterStatus() !== 'REJECTED'">Rejeitadas</button>
       </div>

       <!-- List -->
       <div class="flex-1 overflow-y-auto space-y-4 pr-2">
          @for (req of filteredRequisitions(); track req.id) {
             <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 transition-all" [class.border-l-4]="true" [class.border-l-yellow-500]="req.status === 'PENDING'" [class.border-l-green-500]="req.status === 'DELIVERED'" [class.border-l-red-500]="req.status === 'REJECTED'">
                <div class="flex justify-between items-start mb-3 cursor-pointer" (click)="toggleExpand(req.id)">
                   <div>
                      <h3 class="font-bold text-white text-lg">{{ req.stations?.name || 'Estação Desconhecida' }}</h3>
                      <p class="text-sm text-gray-400">Solicitado em: {{ req.created_at | date:'dd/MM/yyyy HH:mm' }} por {{ req.requester?.name || 'Usuário' }}</p>
                      @if(req.notes) {
                         <p class="text-xs text-yellow-200 mt-1 italic">Obs: "{{ req.notes }}"</p>
                      }
                   </div>
                   <div class="flex items-center gap-2">
                      <span class="px-2 py-1 text-xs font-semibold rounded-full" 
                        [class.bg-yellow-900]="req.status === 'PENDING'" [class.text-yellow-300]="req.status === 'PENDING'"
                        [class.bg-green-900]="req.status === 'DELIVERED'" [class.text-green-300]="req.status === 'DELIVERED'"
                        [class.bg-red-900]="req.status === 'REJECTED'" [class.text-red-300]="req.status === 'REJECTED'">
                        {{ req.status }}
                      </span>
                      <span class="material-symbols-outlined text-gray-400 transform transition-transform" [class.rotate-180]="expandedId() === req.id">expand_more</span>
                   </div>
                </div>

                @if (expandedId() === req.id) {
                   <div class="border-t border-gray-700 pt-3 animate-fade-in-down">
                      <table class="w-full text-sm text-left text-gray-300 mb-4">
                         <thead class="text-xs uppercase bg-gray-700/50 text-gray-400">
                            <tr>
                               <th class="px-2 py-1">Insumo</th>
                               <th class="px-2 py-1 text-center">Solicitado</th>
                               <th class="px-2 py-1 text-center" *ngIf="req.status === 'PENDING'">Estoque Central</th>
                               <th class="px-2 py-1 text-center" *ngIf="req.status === 'PENDING'">Entregar</th>
                               <th class="px-2 py-1 text-center" *ngIf="req.status !== 'PENDING'">Entregue</th>
                            </tr>
                         </thead>
                         <tbody>
                            @for(item of req.requisition_items; track item.id) {
                               @let stock = getIngredientStock(item.ingredient_id);
                               @let deliveryQty = getDeliveryQty(req.id, item.id, item.quantity_requested);
                               <tr class="border-b border-gray-700/30">
                                  <td class="px-2 py-2">{{ item.ingredients?.name }}</td>
                                  <td class="px-2 py-2 text-center font-mono">{{ item.quantity_requested }} {{ item.unit }}</td>
                                  
                                  <!-- Stock Visibility for Pending -->
                                  <td class="px-2 py-2 text-center" *ngIf="req.status === 'PENDING'">
                                      <span class="font-mono font-bold" [class.text-red-400]="stock < item.quantity_requested" [class.text-green-400]="stock >= item.quantity_requested">
                                          {{ stock | number:'1.0-2' }}
                                      </span>
                                  </td>

                                  <!-- Input for delivery amount if Pending -->
                                  <td class="px-2 py-2 text-center" *ngIf="req.status === 'PENDING'">
                                     <input type="number" [value]="deliveryQty" (input)="updateDeliveryQty(req.id, item.id, $any($event.target).value)" class="w-20 bg-gray-900 border border-gray-600 rounded px-1 text-center text-white focus:outline-none focus:border-blue-500" min="0">
                                  </td>
                                  
                                  <!-- Display delivered amount if processed -->
                                  <td class="px-2 py-2 text-center font-mono font-bold text-green-400" *ngIf="req.status !== 'PENDING'">
                                     {{ item.quantity_delivered || 0 }} {{ item.unit }}
                                  </td>
                               </tr>
                            }
                         </tbody>
                      </table>

                      <div class="flex justify-between items-center mt-4">
                         <button (click)="printGuide(req)" class="text-blue-400 hover:text-white flex items-center gap-1 text-sm font-medium">
                            <span class="material-symbols-outlined text-base">print</span> Imprimir Guia
                         </button>

                         @if (req.status === 'PENDING') {
                             <div class="flex gap-3">
                                <button (click)="rejectRequisition(req)" class="px-4 py-2 bg-red-900/50 hover:bg-red-900 text-red-200 rounded-lg text-sm font-semibold transition-colors">Rejeitar</button>
                                <button (click)="approveDelivery(req)" class="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2">
                                   <span class="material-symbols-outlined text-sm">check</span> Confirmar Entrega
                                </button>
                             </div>
                         } @else if (req.status === 'DELIVERED') {
                              <div class="text-xs text-right text-gray-500">
                                 Processado em: {{ req.processed_at | date:'dd/MM/yyyy HH:mm' }} por {{ req.processor?.name || 'Sistema' }}
                              </div>
                         }
                      </div>
                   </div>
                }
             </div>
          } @empty {
             <div class="text-center py-20 bg-gray-800 rounded-lg text-gray-500">
                Nenhuma requisição encontrada com este status.
             </div>
          }
       </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .animate-fade-in-down { animation: fadeInDown 0.3s ease-out; }
    @keyframes fadeInDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
  `]
})
export class RequisitionListComponent {
  inventoryState = inject(InventoryStateService);
  requisitionService = inject(RequisitionService);
  notificationService = inject(NotificationService);
  printingService = inject(PrintingService);

  requisitions = this.inventoryState.requisitions;
  ingredients = this.inventoryState.ingredients;
  
  filterStatus = signal<'PENDING' | 'APPROVED' | 'REJECTED' | 'DELIVERED'>('PENDING');
  expandedId = signal<string | null>(null);

  // Local state to track "Quantity to Deliver" inputs before saving
  // Map<RequisitionID, Map<ItemID, Quantity>>
  deliveryQuantities = signal<Map<string, Map<string, number>>>(new Map());

  filteredRequisitions = computed(() => {
    return this.requisitions().filter(r => r.status === this.filterStatus());
  });

  toggleExpand(id: string) {
    if (this.expandedId() === id) {
      this.expandedId.set(null);
    } else {
      this.expandedId.set(id);
    }
  }
  
  getIngredientStock(ingredientId: string): number {
      const ing = this.ingredients().find(i => i.id === ingredientId);
      return ing ? ing.stock : 0;
  }

  getDeliveryQty(reqId: string, itemId: string, defaultQty: number): number {
    const reqMap = this.deliveryQuantities().get(reqId);
    if (reqMap && reqMap.has(itemId)) {
        return reqMap.get(itemId)!;
    }
    return defaultQty; // Default to requested quantity
  }

  updateDeliveryQty(reqId: string, itemId: string, value: string) {
    const qty = parseFloat(value);
    this.deliveryQuantities.update(map => {
        const newMap = new Map<string, Map<string, number>>(map);
        if (!newMap.has(reqId)) newMap.set(reqId, new Map<string, number>());
        const itemMap = newMap.get(reqId);
        if (itemMap) {
            itemMap.set(itemId, isNaN(qty) ? 0 : qty);
        }
        return newMap;
    });
  }

  async rejectRequisition(req: Requisition) {
    if (!confirm('Tem certeza que deseja rejeitar esta requisição?')) return;
    
    const { success, error } = await this.requisitionService.updateRequisitionStatus(req.id, 'REJECTED');
    if (success) {
        this.notificationService.show('Requisição rejeitada.', 'info');
    } else {
        this.notificationService.show('Erro ao rejeitar.', 'error');
    }
  }

  async approveDelivery(req: Requisition) {
      const itemsToDeliver: { id: string, quantity_delivered: number }[] = [];
      const backorderItems: { ingredientId: string, quantity: number, unit: string }[] = [];
      
      let hasChange = false;

      // Prepare items payload and check for backorders
      for (const item of (req.requisition_items || [])) {
          const qtyToDeliver = this.getDeliveryQty(req.id, item.id, item.quantity_requested);
          
          itemsToDeliver.push({
              id: item.id,
              quantity_delivered: qtyToDeliver
          });
          
          if (qtyToDeliver < item.quantity_requested) {
              hasChange = true;
              const remaining = item.quantity_requested - qtyToDeliver;
              if (remaining > 0) {
                  backorderItems.push({
                      ingredientId: item.ingredient_id,
                      quantity: remaining,
                      unit: item.unit
                  });
              }
          }
      }

      const confirmed = await this.notificationService.confirm(
          `Confirmar a entrega de ${itemsToDeliver.length} itens para ${req.stations?.name}? Isso irá baixar o estoque central.`,
          'Confirmar Entrega'
      );

      if (!confirmed) return;

      const { success, error } = await this.requisitionService.updateRequisitionStatus(req.id, 'DELIVERED', itemsToDeliver);
      
      if (success) {
          this.notificationService.show('Estoque transferido com sucesso!', 'success');
          
          // Logic for Backorder (Partial Delivery)
          if (backorderItems.length > 0) {
              const createBackorder = await this.notificationService.confirm(
                  `Existem itens pendentes nesta requisição. Deseja criar uma nova requisição (Pendência/Backorder) para os itens restantes?`,
                  'Criar Pendência?'
              );
              
              if (createBackorder && req.station_id) {
                  const note = `Pendência da Requisição #${req.id.slice(0,8)}. ${req.notes ? `(${req.notes})` : ''}`;
                  await this.requisitionService.createRequisition(req.station_id, backorderItems, note);
                  this.notificationService.show('Nova requisição de pendência criada.', 'info');
              }
          }

          // Clear local state for this req
          this.deliveryQuantities.update(map => {
              const newMap = new Map(map);
              newMap.delete(req.id);
              return newMap;
          });
      } else {
          this.notificationService.show(`Erro na entrega: ${error?.message}`, 'error');
      }
  }

  printGuide(req: Requisition) {
      this.printingService.printRequisition(req);
  }
}
