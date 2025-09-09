
import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseStateService } from '../../services/supabase-state.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private stateService = inject(SupabaseStateService);
  
  isLoading = computed(() => !this.stateService.isDataLoaded());

  totalSales = computed(() => {
    return this.stateService.dashboardTransactions()
        .filter(t => t.type === 'Receita')
        .reduce((sum, item) => sum + item.amount, 0);
  });
  
  cogsToday = computed(() => {
    const recipeCosts = this.stateService.recipeCosts();
    return this.stateService.dashboardCompletedOrders()
      .flatMap(o => o.order_items)
      .reduce((sum, item) => {
        const cost = recipeCosts.get(item.recipe_id)?.totalCost ?? 0;
        return sum + (cost * item.quantity);
      }, 0);
  });

  grossProfitToday = computed(() => this.totalSales() - this.cogsToday());

  averageTicketToday = computed(() => {
      const totalOrders = this.stateService.dashboardCompletedOrders().length;
      return totalOrders > 0 ? this.totalSales() / totalOrders : 0;
  });

  openTables = computed(() => this.stateService.tables().filter(t => t.status === 'OCUPADA').length);
  
  lowStockItems = computed(() => this.stateService.ingredients().filter(i => i.stock < i.min_stock).length);

  pendingKdsItems = computed(() => {
    return this.stateService.openOrders()
        .flatMap(o => o.order_items || [])
        .filter(item => item.status === 'PENDENTE' || item.status === 'EM_PREPARO').length;
  });

  stats = computed(() => [
    { label: 'Vendas Totais (Hoje)', value: this.totalSales().toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01' },
    { label: 'Lucro Bruto (Hoje)', value: this.grossProfitToday().toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), icon: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125-1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0z' },
    { label: 'Ticket Médio (Hoje)', value: this.averageTicketToday().toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z' },
    { label: 'Mesas Ocupadas', value: this.openTables(), icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a3.001 3.001 0 015.658 0M9 9a3 3 0 11-6 0 3 3 0 016 0zm12 0a3 3 0 11-6 0 3 3 0 016 0zM9 9h6' },
    { label: 'Itens em Estoque Baixo', value: this.lowStockItems(), icon: 'M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z' },
    { label: 'Pedidos na Cozinha', value: this.pendingKdsItems(), icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  ]);

  bestSellingItems = computed(() => {
    const itemCounts = new Map<string, { name: string, quantity: number, revenue: number, cost: number }>();
    const recipeCosts = this.stateService.recipeCosts();
    
    this.stateService.dashboardCompletedOrders().flatMap(o => o.order_items).forEach(item => {
        const existing = itemCounts.get(item.recipe_id);
        const itemCost = (recipeCosts.get(item.recipe_id)?.totalCost ?? 0) * item.quantity;
        const itemRevenue = item.price * item.quantity;

        if (existing) {
            existing.quantity += item.quantity;
            existing.revenue += itemRevenue;
            existing.cost += itemCost;
        } else {
            itemCounts.set(item.recipe_id, {
                name: item.name,
                quantity: item.quantity,
                revenue: itemRevenue,
                cost: itemCost,
            });
        }
    });
    
    return Array.from(itemCounts.values())
        .map(item => {
            const profit = item.revenue - item.cost;
            const profitMargin = item.revenue > 0 ? (profit / item.revenue) * 100 : 0;
            return { ...item, profit, profitMargin };
        })
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5); // Top 5 by revenue
  });

  recentTransactions = computed(() => {
    return this.stateService.dashboardTransactions()
      .filter(t => t.type === 'Receita')
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  });
}
