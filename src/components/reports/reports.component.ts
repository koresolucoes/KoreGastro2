import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';

type ReportPeriod = 'day' | 'week' | 'month';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './reports.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsComponent implements OnInit {
    private dataService = inject(SupabaseService);

    period = signal<ReportPeriod>('day');
    isLoading = signal(true);
    
    completedOrders = this.dataService.completedOrders;
    transactions = this.dataService.transactions;

    ngOnInit() {
        this.loadData();
    }
    
    async setPeriod(newPeriod: ReportPeriod) {
        this.period.set(newPeriod);
        await this.loadData();
    }
    
    private async loadData() {
        this.isLoading.set(true);
        try {
            const { startDate, endDate } = this.getDateRange();
            await this.dataService.fetchSalesDataForPeriod(startDate, endDate);
        } catch (error) {
            console.error("Error loading report data", error);
        } finally {
            this.isLoading.set(false);
        }
    }
    
    private getDateRange(): { startDate: Date, endDate: Date } {
        const now = new Date();
        const endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        let startDate = new Date(now);
        
        switch (this.period()) {
            case 'day':
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'week':
                // Adjust to get the start of the week (Sunday)
                const dayOfWeek = now.getDay(); // 0 for Sunday, 1 for Monday, etc.
                startDate = new Date(now.setDate(now.getDate() - dayOfWeek));
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                startDate.setHours(0, 0, 0, 0);
                break;
        }
        return { startDate, endDate };
    }
    
    grossRevenue = computed(() => {
        return this.transactions().reduce((sum, t) => sum + t.amount, 0);
    });
    
    totalOrders = computed(() => {
        return this.completedOrders().length;
    });
    
    averageTicket = computed(() => {
        const revenue = this.grossRevenue();
        const orders = this.totalOrders();
        return orders > 0 ? revenue / orders : 0;
    });
    
    bestSellingItems = computed(() => {
        const itemCounts = new Map<string, { name: string, quantity: number, revenue: number }>();
        
        this.completedOrders().flatMap(o => o.order_items).forEach(item => {
            const existing = itemCounts.get(item.recipe_id);
            if (existing) {
                existing.quantity += item.quantity;
                existing.revenue += item.price * item.quantity;
            } else {
                itemCounts.set(item.recipe_id, {
                    name: item.name,
                    quantity: item.quantity,
                    revenue: item.price * item.quantity
                });
            }
        });
        
        return Array.from(itemCounts.values())
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 10); // Top 10
    });

    stats = computed(() => [
      { label: 'Faturamento Bruto', value: this.grossRevenue(), isCurrency: true },
      { label: 'Total de Pedidos', value: this.totalOrders(), isCurrency: false },
      { label: 'Ticket Médio', value: this.averageTicket(), isCurrency: true }
    ]);
}