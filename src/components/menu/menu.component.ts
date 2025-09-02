
import { Component, ChangeDetectionStrategy, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';
import { Recipe } from '../../models/db.models';
import { PricingService } from '../../services/pricing.service';

interface MenuGroup {
  categoryName: string;
  recipes: (Recipe & { effectivePrice: number })[];
}

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuComponent {
  private dataService = inject(SupabaseService);
  private pricingService = inject(PricingService);

  searchTerm = signal('');

  onlineMenu = computed(() => {
    const term = this.searchTerm().toLowerCase();
    
    let availableRecipes = this.dataService.recipesWithStockStatus()
      .filter(recipe => recipe.is_available && recipe.hasStock);

    if (term) {
      availableRecipes = availableRecipes.filter(recipe => 
        recipe.name.toLowerCase().includes(term) ||
        recipe.description?.toLowerCase().includes(term)
      );
    }
    
    const categories = this.dataService.categories();
    const categoryMap = new Map(categories.map(c => [c.id, c.name]));

    const recipesWithPrice = availableRecipes.map(recipe => ({
        ...recipe,
        effectivePrice: this.pricingService.getEffectivePrice(recipe)
    }));

    const grouped = recipesWithPrice.reduce((acc, recipe) => {
      const categoryName = categoryMap.get(recipe.category_id) || 'Outros';
      if (!acc[categoryName]) {
        acc[categoryName] = [];
      }
      acc[categoryName].push(recipe);
      return acc;
    }, {} as Record<string, (Recipe & { effectivePrice: number })[]>);

    return Object.keys(grouped)
      .map(categoryName => ({
        categoryName,
        recipes: grouped[categoryName]
      }))
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName));
  });
}
