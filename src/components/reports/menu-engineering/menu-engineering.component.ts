import { Component, ChangeDetectionStrategy, inject, input, computed, signal, effect } from '@angular/core';
import { CommonModule, CurrencyPipe, PercentPipe, DecimalPipe } from '@angular/common';
import { CashierDataService } from '../../../services/cashier-data.service';
import { RecipeStateService } from '../../../services/recipe-state.service';
import { NotificationService } from '../../../services/notification.service';

interface MenuEngineeringItem {
  id: string;
  name: string;
  quantity: number;
  totalRevenue: number;
  totalCost: number;
  unitPrice: number;
  unitCost: number;
  profitMargin: number; // percentage (Profit / Revenue)
  contributionMargin: number; // (Unit Price - Unit Cost) * quantity
  popularityPercentage: number;
  category: 'Estrela' | 'Vaca Leiteira' | 'Quebra-Cabeça' | 'Cachorro';
}

@Component({
  selector: 'app-menu-engineering',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, PercentPipe, DecimalPipe],
  templateUrl: './menu-engineering.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuEngineeringComponent {
  private cashierDataService = inject(CashierDataService);
  private recipeState = inject(RecipeStateService);
  private notificationService = inject(NotificationService);

  startDate = input.required<string>();
  endDate = input.required<string>();

  isLoading = signal(false);
  matrixData = signal<MenuEngineeringItem[]>([]);
  
  // Sort state
  sortColumn = signal<keyof MenuEngineeringItem>('totalRevenue');
  sortDirection = signal<'asc' | 'desc'>('desc');

  constructor() {
    effect(() => {
      const start = this.startDate();
      const end = this.endDate();
      if (start && end) {
        this.loadData(start, end);
      }
    });
  }

  async loadData(startDate: string, endDate: string) {
    this.isLoading.set(true);
    try {
      // Reusing logic similar to reports or cashier data to get items sold and their costs.
      const report = await this.cashierDataService.generateReportData(startDate, endDate, 'items');
      
      if (!report.bestSellingItems) {
        this.matrixData.set([]);
        return;
      }

      // Calculate totals for averages
      const totalItemsSold = report.bestSellingItems.reduce((acc, item) => acc + item.quantity, 0);
      const totalMenuCategories = report.bestSellingItems.length; // Approximate "menu size"
      
      // Calculate Thresholds
      const averagePopularity = totalMenuCategories > 0 ? (1 / totalMenuCategories) * 0.7 : 0; // The threshold is often 70% of the average expected sales (if all items sold equally).
      
      // Let's use a standard BCG model definition:
      // A threshold for Popularity can be: Total Quantity / Number of unique items * 70%
      const popularityThreshold = totalMenuCategories > 0 ? (totalItemsSold / totalMenuCategories) * 0.7 : 0;
      
      const itemsWithContribution = report.bestSellingItems.map(item => {
        const unitCost = item.quantity > 0 ? item.totalCost / item.quantity : 0;
        const unitPrice = item.quantity > 0 ? item.revenue / item.quantity : 0;
        const profitMargin = item.revenue > 0 ? (item.totalProfit / item.revenue) : 0;
        const contributionMargin = item.totalProfit; // Total contribution to margin
        
        return {
          id: item.name, // using name as id since we don't have recipe_id directly on this structure
          name: item.name,
          quantity: item.quantity,
          totalRevenue: item.revenue,
          totalCost: item.totalCost,
          unitPrice,
          unitCost,
          profitMargin,
          contributionMargin,
          popularityPercentage: totalItemsSold > 0 ? item.quantity / totalItemsSold : 0,
          category: 'Cachorro' as const // Placeholder, evaluated next
        };
      });

      // Calculate Average Contribution Margin
      const averageContributionMargin = itemsWithContribution.length > 0
        ? itemsWithContribution.reduce((acc, item) => acc + item.contributionMargin, 0) / itemsWithContribution.length
        : 0;

      const matrixItems: MenuEngineeringItem[] = itemsWithContribution.map(item => {
        // High/Low Popularity
        const isHighPopularity = item.quantity >= popularityThreshold;
        // High/Low Margin (Using Total Contribution Margin instead of % is standard for Menu Engineering)
        const isHighMargin = item.contributionMargin >= averageContributionMargin;

        let category: MenuEngineeringItem['category'] = 'Cachorro';
        if (isHighPopularity && isHighMargin) category = 'Estrela';
        else if (isHighPopularity && !isHighMargin) category = 'Vaca Leiteira';
        else if (!isHighPopularity && isHighMargin) category = 'Quebra-Cabeça';
        
        return { ...item, category };
      });

      this.matrixData.set(matrixItems);

    } catch (e) {
      console.error(e);
      this.notificationService.show('Failed to generate Menu Engineering data', 'error');
    } finally {
      this.isLoading.set(false);
    }
  }
  
  sortBy(column: keyof MenuEngineeringItem) {
    if (this.sortColumn() === column) {
        this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
        this.sortColumn.set(column);
        this.sortDirection.set('desc');
    }
  }

  sortedData = computed(() => {
     const data = [...this.matrixData()];
     const column = this.sortColumn();
     const direction = this.sortDirection() === 'asc' ? 1 : -1;
     
     return data.sort((a, b) => {
         const valA = a[column];
         const valB = b[column];
         
         if (typeof valA === 'string' && typeof valB === 'string') {
             return valA.localeCompare(valB) * direction;
         }
         
         if (typeof valA === 'number' && typeof valB === 'number') {
             return (valA - valB) * direction;
         }
         
         return 0;
     });
  });

  getCategoryColor(category: string) {
    switch(category) {
      case 'Estrela': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';
      case 'Vaca Leiteira': return 'bg-blue-500/10 text-blue-500 border-blue-500/30';
      case 'Quebra-Cabeça': return 'bg-amber-500/10 text-amber-500 border-amber-500/30';
      case 'Cachorro': return 'bg-rose-500/10 text-rose-500 border-rose-500/30';
      default: return 'bg-surface border-subtle';
    }
  }
  
  getCategoryIcon(category: string) {
    switch(category) {
      case 'Estrela': return 'star';
      case 'Vaca Leiteira': return 'payments';
      case 'Quebra-Cabeça': return 'extension';
      case 'Cachorro': return 'delete';
      default: return 'circle';
    }
  }
}
