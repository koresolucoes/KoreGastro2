import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SystemAdminService } from '../../services/system-admin.service';

interface IfoodRequestRow {
  id: string;
  store_id: string;
  support_ticket_id: string;
  store_name: string;
  store_cnpj: string;
  status: string;
  created_at: string;
}

@Component({
  selector: 'app-admin-ifood-requests',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule],
  template: \`
    <div class="animate-fade-in-up">
      <div class="mb-6 flex items-center justify-between gap-4">
        <div>
          <h2 class="text-2xl font-bold text-white">Conexões iFood</h2>
          <p class="mt-1 text-sm text-gray-400">Acompanhe os pedidos das lojas e confirme o acesso liberado pelo iFood.</p>
        </div>
        <button type="button" (click)="loadRequests()" [disabled]="isLoading()" class="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-50">Atualizar</button>
      </div>
      @if (errorMessage()) { <div class="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{{ errorMessage() }}</div> }
      @if (successMessage()) { <div class="mb-5 rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-300">{{ successMessage() }}</div> }
      @if (requests().length === 0 && !isLoading()) {
        <div class="rounded-xl border border-gray-800 bg-gray-900 p-10 text-center text-gray-400">Não há pedidos de conexão pendentes.</div>
      }
      <div class="space-y-4">
        @for (request of requests(); track request.id) {
          <article class="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-lg font-semibold text-white">{{ request.store_name }}</h3>
                  <span class="rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-xs font-medium text-purple-300">{{ statusLabel(request.status) }}</span>
                </div>
                <p class="mt-2 text-sm text-gray-400">CNPJ: {{ formatCnpj(request.store_cnpj) }}</p>
                <p class="mt-1 text-xs text-gray-500">Solicitado em {{ request.created_at | date:'dd/MM/yyyy HH:mm' }} · Chamado #{{ request.support_ticket_id?.slice(0, 8) }}</p>
              </div>
              <div class="flex flex-wrap gap-2">
                <button type="button" (click)="updateStatus(request, 'ACCESS_REQUESTED')" [disabled]="isSaving()" class="rounded-lg bg-gray-800 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-700 disabled:opacity-50">Pedido enviado ao iFood</button>
                <button type="button" (click)="updateStatus(request, 'WAITING_MERCHANT_APPROVAL')" [disabled]="isSaving()" class="rounded-lg bg-gray-800 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-700 disabled:opacity-50">Aguardando aprovação</button>
                <button type="button" (click)="updateStatus(request, 'APPROVED_PENDING_VERIFICATION')" [disabled]="isSaving()" class="rounded-lg bg-gray-800 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-700 disabled:opacity-50">Aprovação recebida</button>
              </div>
            </div>
            <div class="mt-5 grid grid-cols-1 gap-3 border-t border-gray-800 pt-4 lg:grid-cols-[minmax(240px,1fr)_minmax(240px,1fr)_auto]">
              <input [(ngModel)]="merchantIds[request.id]" class="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-purple-500" placeholder="ID da loja confirmado no iFood">
              <input [(ngModel)]="messages[request.id]" class="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-purple-500" placeholder="Mensagem ao restaurante (opcional)">
              <button type="button" (click)="connect(request)" [disabled]="isSaving() || !merchantIds[request.id]?.trim()" class="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50">Validar e conectar</button>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <button type="button" (click)="requestInformation(request)" [disabled]="isSaving() || !messages[request.id]?.trim()" class="rounded-lg border border-yellow-700/60 px-3 py-2 text-xs text-yellow-300 hover:bg-yellow-500/10 disabled:opacity-50">Pedir informação</button>
              <button type="button" (click)="reject(request)" [disabled]="isSaving() || !messages[request.id]?.trim()" class="rounded-lg border border-red-700/60 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50">Encerrar pedido</button>
            </div>
          </article>
        }
      </div>
    </div>
  \`,
})
export class AdminIfoodRequestsComponent implements OnInit {
  private readonly admin = inject(SystemAdminService);
  readonly requests = signal<IfoodRequestRow[]>([]);
  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  merchantIds: Record<string, string> = {};
  messages: Record<string, string> = {};
  ngOnInit() { void this.loadRequests(); }
  async loadRequests() {
    this.isLoading.set(true);
    this.errorMessage.set('');
    const result = await this.admin.getIfoodIntegrationRequests();
    if (result.error) this.errorMessage.set('Não foi possível carregar os pedidos. Tente novamente.');
    else this.requests.set(result.data || []);
    this.isLoading.set(false);
  }
  statusLabel(status: string) {
    const labels: Record<string, string> = {
      SUBMITTED: 'Recebido', ACCESS_REQUESTED: 'Acesso solicitado',
      WAITING_MERCHANT_APPROVAL: 'Aguardando loja',
      APPROVED_PENDING_VERIFICATION: 'Pronto para validar', NEEDS_INFORMATION: 'Aguardando informação',
    };
    return labels[status] || status;
  }
  formatCnpj(value: string) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length === 14 ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : value;
  }
  async updateStatus(request: IfoodRequestRow, status: string, message?: string) {
    this.isSaving.set(true); this.errorMessage.set(''); this.successMessage.set('');
    const result = await this.admin.updateIfoodIntegrationRequest(request.id, status, message);
    this.isSaving.set(false);
    if (result.error) this.errorMessage.set('Não foi possível atualizar o pedido. Confira a conexão e tente novamente.');
    else { this.successMessage.set('Etapa atualizada e registrada no chamado do restaurante.'); await this.loadRequests(); }
  }
  requestInformation(request: IfoodRequestRow) { return this.updateStatus(request, 'NEEDS_INFORMATION', this.messages[request.id]); }
  reject(request: IfoodRequestRow) { return this.updateStatus(request, 'REJECTED', this.messages[request.id]); }
  async connect(request: IfoodRequestRow) {
    this.isSaving.set(true); this.errorMessage.set(''); this.successMessage.set('');
    const result = await this.admin.connectIfoodIntegrationRequest(request.id, this.merchantIds[request.id].trim());
    this.isSaving.set(false);
    if (result.error) this.errorMessage.set('Não foi possível validar a loja autorizada. Confira o ID e se a aprovação já chegou ao iFood.');
    else { this.successMessage.set('Loja confirmada e conectada à unidade ChefOS. O chamado foi atualizado.'); await this.loadRequests(); }
  }
}
