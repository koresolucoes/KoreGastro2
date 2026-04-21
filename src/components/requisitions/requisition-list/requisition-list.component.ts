
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
    <div class="flex flex-col h-full gap-5">
       <!-- Filters -->
       <div class="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
          <button (click)="filterStatus.set('PENDING')" class="px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all focus:outline-none" [class.bg-warning]="filterStatus() === 'PENDING'" [class.text-white]="filterStatus() === 'PENDING'" [class.bg-surface]="filterStatus() !== 'PENDING'" [class.text-muted]="filterStatus() !== 'PENDING'" [class.hover:bg-surface-elevated]="filterStatus() !== 'PENDING'">Pendentes</button>
          <button (click)="filterStatus.set('DELIVERED')" class="px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all focus:outline-none" [class.bg-success]="filterStatus() === 'DELIVERED'" [class.text-white]="filterStatus() === 'DELIVERED'" [class.bg-surface]="filterStatus() !== 'DELIVERED'" [class.text-muted]="filterStatus() !== 'DELIVERED'" [class.hover:bg-surface-elevated]="filterStatus() !== 'DELIVERED'">Entregues</button>
          <button (click)="filterStatus.set('REJECTED')" class="px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all focus:outline-none" [class.bg-danger]="filterStatus() === 'REJECTED'" [class.text-white]="filterStatus() === 'REJECTED'" [class.bg-surface]="filterStatus() !== 'REJECTED'" [class.text-muted]="filterStatus() !== 'REJECTED'" [class.hover:bg-surface-elevated]="filterStatus() !== 'REJECTED'">Rejeitadas</button>
       </div>

       <!-- List -->
       <div class="flex-1 overflow-y-auto space-y-4 custom-scrollbar pb-6 pr-2">
          @for (req of filteredRequisitions(); track req.id) {
             <div class="bg-surface-elevated border border-subtle rounded-2xl p-5 shadow-sm transition-all group" [class.border-l-4]="true" [class.border-l-warning]="req.status === 'PENDING'" [class.border-l-success]="req.status === 'DELIVERED'" [class.border-l-danger]="req.status === 'REJECTED'">
                <div class="flex justify-between items-start mb-2 cursor-pointer" (click)="toggleExpand(req.id)">
                   <div>
                      <h3 class="font-black text-title text-lg tracking-tight">{{ req.stations?.name || 'Estação Desconhecida' }}</h3>
                      <p class="text-[11px] font-bold text-muted uppercase tracking-wider mt-1">Solicitado em: {{ req.created_at | date:'dd/MM/yy HH:mm' }} por {{ req.requester?.name || 'Usuário' }}</p>
                      @if(req.notes) {
                         <p class="text-xs text-warning mt-2 italic bg-warning/10 p-2 rounded-lg border border-warning/20">"{{ req.notes }}"</p>
                      }
                   </div>
                   <div class="flex items-center gap-3">
                      <span class="px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg shadow-sm" 
                        [class.bg-warning/20]="req.status === 'PENDING'" [class.text-warning]="req.status === 'PENDING'"
                        [class.bg-success/20]="req.status === 'DELIVERED'" [class.text-success]="req.status === 'DELIVERED'"
                        [class.bg-danger/20]="req.status === 'REJECTED'" [class.text-danger]="req.status === 'REJECTED'">
                        {{ req.status }}
                      </span>
                      <button class="p-1.5 rounded-full hover:bg-surface transition-colors flex items-center justify-center">
                        <span class="material-symbols-outlined text-muted transform transition-transform" [class.rotate-180]="expandedId() === req.id">expand_more</span>
                      </button>
                   </div>
                </div>

                @if (expandedId() === req.id) {
                   <div class="border-t border-subtle mt-4 pt-4 animate-fade-in-down">
                      <table class="w-full text-left text-title mb-6">
                         <thead class="text-[10px] uppercase font-black tracking-widest text-muted border-b border-subtle">
                            <tr>
                               <th class="py-2 px-2">Insumo</th>
                               <th class="py-2 px-2 text-center w-24">Solicitado</th>
                               <th class="py-2 px-2 text-center w-24" *ngIf="req.status === 'PENDING'">Estoque Qtd.</th>
                               <th class="py-2 px-2 text-center w-28" *ngIf="req.status === 'PENDING'">Entregar</th>
                               <th class="py-2 px-2 text-center w-24" *ngIf="req.status !== 'PENDING'">Entregue</th>
                            </tr>
                         </thead>
                         <tbody class="text-sm">
                            @for(item of req.requisition_items; track item.id) {
                               @let stock = getIngredientStock(item.ingredient_id);
                               @let deliveryQty = getDeliveryQty(req.id, item.id, item.quantity_requested);
                               <tr class="border-b border-strong/50 last:border-0 hover:bg-surface/50 transition-colors">
                                  <td class="py-3 px-2 font-bold">{{ item.ingredients?.name }}</td>
                                  <td class="py-3 px-2 text-center font-mono text-muted">{{ item.quantity_requested }} {{ item.unit }}</td>
                                  
                                  <!-- Stock Visibility for Pending -->
                                  <td class="py-3 px-2 text-center" *ngIf="req.status === 'PENDING'">
                                      <span class="font-mono font-bold" [class.text-danger]="stock < item.quantity_requested" [class.text-success]="stock >= item.quantity_requested">
                                          {{ stock | number:'1.0-2' }}
                                      </span>
                                  </td>

                                  <!-- Input for delivery amount if Pending -->
                                  <td class="py-3 px-2 text-center" *ngIf="req.status === 'PENDING'">
                                     <input type="number" [value]="deliveryQty" (input)="updateDeliveryQty(req.id, item.id, $any($event.target).value)" class="w-20 bg-surface border border-strong rounded-lg py-1.5 px-2 text-center text-title focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand font-bold transition-all" min="0">
                                  </td>
                                  
                                  <!-- Display delivered amount if processed -->
                                  <td class="py-3 px-2 text-center" *ngIf="req.status !== 'PENDING'">
                                    <span class="font-mono font-black text-success">{{ item.quantity_delivered || 0 }} {{ item.unit }}</span>
                                  </td>
                               </tr>
                            }
                         </tbody>
                      </table>

                      <div class="flex flex-col sm:flex-row justify-between items-center mt-4 gap-4">
                         <button (click)="printGuide(req)" class="w-full sm:w-auto text-[11px] font-black uppercase tracking-widest text-brand hover:text-brand-hover hover:bg-surface p-2.5 rounded-lg flex items-center justify-center gap-2 transition-all">
                            <span class="material-symbols-outlined text-[16px]">print</span> Imprimir Guia
                         </button>

                         @if (req.status === 'PENDING') {
                             <div class="flex gap-3 w-full sm:w-auto">
                                <button (click)="rejectRequisition(req)" class="flex-1 sm:flex-none py-2.5 px-4 bg-surface hover:bg-danger/10 border border-danger/30 hover:border-danger text-danger rounded-xl text-[11px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 text-center">Rejeitar</button>
                                <button (click)="approveDelivery(req)" class="flex-1 sm:flex-none py-2.5 px-5 bg-success hover:bg-success-hover text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2">
                                   <span class="material-symbols-outlined text-[16px]">check_circle</span> Aprovar
                                </button>
                             </div>
                         } @else if (req.status === 'DELIVERED') {
                              <div class="text-[10px] font-bold uppercase tracking-widest text-muted text-right bg-surface border border-subtle px-3 py-1.5 rounded-lg">
                                 Processado em: {{ req.processed_at | date:'dd/MM/yy HH:mm' }} por <span class="text-title">{{ req.processor?.name || 'Sistema' }}</span>
                              </div>
                         }
                      </div>
                   </div>
                }
             </div>
          } @empty {
             <div class="flex flex-col items-center justify-center py-20 opacity-70 border border-dashed border-subtle rounded-2xl bg-surface/30">
                 <span class="material-symbols-outlined text-4xl text-muted mb-2">inbox</span>
                <p class="text-[11px] font-black uppercase tracking-widest text-muted">Nenhuma requisição encontrada com este status.</p>
             </div>
          }
       </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .animate-fade-in-down { animation: fadeInDown 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
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
