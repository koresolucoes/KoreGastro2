import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CustomerAuthService, MenuCustomer } from '../../../services/customer-auth.service';
import { LoyaltySettings } from '../../../models/db.models';

@Component({
  selector: 'app-menu-profile',
  imports: [CommonModule],
  template: `
    <div class="p-6 flex flex-col h-full bg-surface">
      <div class="flex items-center justify-between mb-6 shrink-0">
        <h2 class="text-2xl font-black text-title">Meu Perfil</h2>
        <button (click)="close.emit()" class="w-10 h-10 flex items-center justify-center rounded-full bg-surface-elevated text-muted hover:text-title hover:shadow-sm transition-all border border-transparent hover:border-strong">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      @if (customer()) {
        <div class="flex-1 overflow-y-auto no-scrollbar space-y-8">
          
          <div class="bg-surface-elevated border border-strong rounded-3xl p-6 shadow-sm">
            <h3 class="font-bold text-lg text-title">{{ customer()!.name }}</h3>
            <p class="text-muted text-sm">{{ customer()!.phone }} • {{ customer()!.cpf }}</p>
            
            <div class="mt-6 flex items-center justify-between bg-brand/10 p-4 rounded-2xl border border-brand/20">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-brand text-on-brand rounded-xl flex items-center justify-center shadow-md">
                  <span class="material-symbols-outlined !text-xl">stars</span>
                </div>
                <div>
                  <p class="text-xs font-bold text-brand uppercase tracking-wider">Meus Pontos</p>
                  <p class="text-2xl font-black text-title">{{ customer()!.loyalty_points }}</p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 class="font-bold text-lg text-title mb-4 flex items-center gap-2">
              <span class="material-symbols-outlined text-muted">history</span>
              Histórico de Pedidos
            </h3>

            @if (isLoading()) {
              <div class="flex justify-center p-8">
                <span class="material-symbols-outlined animate-spin text-brand !text-3xl">progress_activity</span>
              </div>
            } @else if (orders().length === 0) {
              <div class="text-center py-10 bg-surface-elevated rounded-3xl border border-dashed border-strong">
                <span class="material-symbols-outlined text-muted !text-4xl mb-3">receipt_long</span>
                <p class="text-title font-medium">Nenhum pedido ainda.</p>
                <p class="text-muted text-sm mt-1">Faça seu primeiro pedido e ganhe pontos!</p>
              </div>
            } @else {
              <div class="space-y-3">
                @for (order of orders(); track order.id) {
                  <div class="bg-surface-elevated border border-subtle rounded-2xl p-4 flex justify-between items-center transition-all hover:border-strong">
                    <div>
                      <p class="font-bold text-body text-sm">{{ order.created_at | date:'dd/MM/yyyy HH:mm' }}</p>
                      <p class="text-xs font-medium px-2 py-0.5 rounded-full inline-block mt-1"
                         [ngClass]="order.status === 'COMPLETED' ? 'bg-green-500/10 text-green-600' : (order.status === 'CANCELLED' ? 'bg-red-500/10 text-red-600' : 'bg-yellow-500/10 text-yellow-600')">
                        {{ order.status === 'COMPLETED' ? 'Concluído' : (order.status === 'CANCELLED' ? 'Cancelado' : 'Em Andamento') }}
                      </p>
                    </div>
                    <p class="font-black text-title">{{ order.total | currency:'BRL' }}</p>
                  </div>
                }
              </div>
            }
          </div>
        </div>

        <div class="pt-6 border-t border-subtle mt-auto shrink-0">
          <button (click)="logout()" class="w-full py-4 bg-surface-elevated border-2 border-strong text-muted hover:text-title rounded-2xl font-bold flex items-center justify-center gap-2 transition-all">
            <span class="material-symbols-outlined">logout</span>
            <span>Sair da Conta</span>
          </button>
        </div>
      }
    </div>
  `
})
export class MenuProfileComponent implements OnInit {
  authService = inject(CustomerAuthService);
  close = output<void>();
  storeId = input.required<string>();

  customer = this.authService.customer;
  orders = signal<any[]>([]);
  isLoading = signal(true);

  async ngOnInit() {
    await this.authService.refreshCustomerData(this.storeId());
    this.fetchHistory();
  }

  async fetchHistory() {
    this.isLoading.set(true);
    const history = await this.authService.getOrderHistory(this.storeId());
    this.orders.set(history);
    this.isLoading.set(false);
  }

  logout() {
    this.authService.logout();
    this.close.emit();
  }
}
