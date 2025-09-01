import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private dataService = inject(SupabaseService);
  
  totalSales = computed(() => {
    return this.dataService.orders()
        .filter(o => o.is_completed)
        .flatMap(o => o.order_items || [])
        .reduce((sum, item) => sum + (item.price * item.quantity), 0);
  });
  
  openTables = computed(() => this.dataService.tables().filter(t => t.status === 'OCUPADA').length);
  
  lowStockItems = computed(() => this.dataService.ingredients().filter(i => i.stock < i.min_stock).length);

  pendingKdsItems = computed(() => {
    return this.dataService.openOrders()
        .flatMap(o => o.order_items || [])
        .filter(item => item.status === 'PENDENTE' || item.status === 'EM_PREPARO').length;
  });

  stats = computed(() => [
    { label: 'Vendas Totais (Hoje)', value: this.totalSales().toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01' },
    { label: 'Mesas Ocupadas', value: this.openTables(), icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a3.001 3.001 0 015.658 0M9 9a3 3 0 11-6 0 3 3 0 016 0zm12 0a3 3 0 11-6 0 3 3 0 016 0zM9 9h6' },
    { label: 'Itens em Estoque Baixo', value: this.lowStockItems(), icon: 'M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z' },
    { label: 'Pedidos na Cozinha', value: this.pendingKdsItems(), icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  ]);

}