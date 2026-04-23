import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RequisitionService } from '../../../services/requisition.service';
import { NotificationService } from '../../../services/notification.service';
import { RequisitionStatus } from '../../../models/db.models';

@Component({
  selector: 'app-requisition-inbox',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="bg-surface border border-subtle rounded-3xl p-6">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-xl font-bold tracking-tight text-title">Central de Pedidos (Cozinha Matriz)</h2>
          <p class="text-xs font-medium text-muted mt-1">Gerencie requisições enviadas por outras filiais para o seu estoque.</p>
        </div>
      </div>

      <!-- State: Loading -->
      @if (loading()) {
        <div class="py-12 flex justify-center">
            <span class="material-symbols-outlined animate-spin text-brand text-4xl">autorenew</span>
        </div>
      } 
      <!-- State: Empty -->
      @else if (inboxItems().length === 0) {
        <div class="py-12 flex flex-col items-center text-center">
          <div class="w-16 h-16 rounded-2xl bg-surface-hover flex items-center justify-center mb-4">
              <span class="material-symbols-outlined text-3xl text-muted">inbox</span>
          </div>
          <h3 class="text-sm font-bold text-title">Nenhum pedido externo recebido</h3>
          <p class="text-xs text-muted max-w-sm mt-1">Nenhuma filial enviou solicitações de transferência para a sua unidade neste período.</p>
        </div>
      }
      <!-- State: List -->
      @else {
        <div class="space-y-4">
          @for (req of inboxItems(); track req.id) {
            <div class="border border-subtle rounded-2xl p-4 transition-colors hover:border-brand/30">
              <div class="flex justify-between items-start mb-4">
                <div>
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-xs font-black bg-brand/10 text-brand px-2 py-0.5 rounded-full uppercase tracking-wider">
                      {{ req.origin_store?.name || 'Filial Desconhecida' }}
                    </span>
                    <span class="text-xs font-medium text-muted">{{ req.created_at | date:'short' }}</span>
                  </div>
                  <div class="text-sm font-bold text-title">
                    Req #{{ req.id.split('-')[0] | uppercase }}
                  </div>
                </div>
                <div>
                  <span class="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
                        [ngClass]="{
                          'bg-amber-500/10 text-amber-500': req.status === 'PENDING',
                          'bg-emerald-500/10 text-emerald-500': req.status === 'DELIVERED',
                          'bg-blue-500/10 text-blue-500': req.status === 'IN_TRANSIT',
                          'bg-red-500/10 text-red-500': req.status === 'REJECTED'
                        }">
                    {{ req.status === 'IN_TRANSIT' ? 'EM TRÂNSITO' : req.status === 'DELIVERED' ? 'ENTREGUE' : req.status === 'PENDING' ? 'PENDENTE' : req.status === 'REJECTED' ? 'REJEITADO' : req.status }}
                  </span>
                </div>
              </div>

              <div class="bg-surface-hover rounded-xl p-3 mb-4">
                <table class="w-full text-left border-collapse">
                  <thead>
                    <tr class="border-b border-subtle">
                      <th class="py-2 text-[10px] uppercase tracking-wider font-extrabold text-muted">Item</th>
                      <th class="py-2 text-[10px] uppercase tracking-wider font-extrabold text-muted text-right">Solicitado</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-subtle">
                    @for (item of req.requisition_items; track item.id) {
                      <tr>
                        <td class="py-2 text-xs font-medium text-title">{{ item.ingredients?.name || 'Item Removido' }}</td>
                        <td class="py-2 text-xs font-bold text-brand text-right">{{ item.quantity_requested }} {{ item.unit }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>

              <div class="flex justify-end gap-2">
                @if (req.status === 'PENDING') {
                   <button (click)="rejectRequest(req)" class="px-4 py-2 border border-danger text-danger hover:bg-danger hover:text-white rounded-xl text-xs font-bold transition-colors">
                     Rejeitar
                   </button>
                   <button (click)="dispatchRequest(req)" class="px-4 py-2 border border-brand text-brand hover:bg-brand hover:text-white rounded-xl text-xs font-bold transition-colors">
                     Aprovar e Expedir (Carregar Caminhão)
                   </button>
                } @else if (req.status === 'IN_TRANSIT') {
                   <span class="text-xs text-muted italic flex items-center gap-1">
                     <span class="material-symbols-outlined text-[14px]">local_shipping</span>
                     Aguardando filial confirmar recebimento
                   </span>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RequisitionInboxComponent implements OnInit {
  private requisitionService = inject(RequisitionService);
  private notificationService = inject(NotificationService);

  loading = signal(true);
  inboxItems = signal<any[]>([]);

  async ngOnInit() {
    await this.loadInbox();
  }

  async loadInbox() {
    this.loading.set(true);
    // Fetch last 30 days
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const { data } = await this.requisitionService.getInboxRequisitions(startDate, endDate);
    if (data) {
        this.inboxItems.set(data);
    }
    this.loading.set(false);
  }

  async dispatchRequest(req: any) {
    const confirmed = await this.notificationService.confirm(
       `Confirma a expedição do pedido ${req.id.split('-')[0].toUpperCase()} para ${req.origin_store?.name}? O status mudará para EM TRÂNSITO. O estoque atual da matriz será debitado.`,
       'Confirma Despacho'
    );
    if (!confirmed) return;

    // We assume Matrix dispatches exactly what was requested for now.
    // A more complex UI could allow partial dispatches.
    const itemsToDispatch = req.requisition_items.map((item: any) => ({
        id: item.id,
        quantity_delivered: item.quantity_requested
    }));

    this.loading.set(true);
    const { success, error } = await this.requisitionService.updateRequisitionStatus(req.id, 'IN_TRANSIT', itemsToDispatch);
    if (success) {
       this.notificationService.show('Pedido expedido e estoque debitado da Matriz!', 'success');
       await this.loadInbox();
    } else {
       this.notificationService.show(`Erro ao expedir pedido: ${error?.message}`, 'error');
       this.loading.set(false);
    }
  }

  async rejectRequest(req: any) {
    const confirmed = await this.notificationService.confirm(
       `Tem certeza que deseja rejeitar o pedido da filial ${req.origin_store?.name}?`
    );
    if (!confirmed) return;

    this.loading.set(true);
    const { success, error } = await this.requisitionService.updateRequisitionStatus(req.id, 'REJECTED');
    if (success) {
       this.notificationService.show('Pedido rejeitado.', 'success');
       await this.loadInbox();
    } else {
       this.notificationService.show(`Erro ao rejeitar pedido: ${error?.message}`, 'error');
       this.loading.set(false);
    }
  }
}
