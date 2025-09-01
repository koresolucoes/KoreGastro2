import { Component, ChangeDetectionStrategy, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';
import { Recipe } from '../../models/db.models';

interface MenuGroup {
  categoryName: string;
  recipes: Recipe[];
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

    const grouped = availableRecipes.reduce((acc, recipe) => {
      const categoryName = categoryMap.get(recipe.category_id) || 'Outros';
      if (!acc[categoryName]) {
        acc[categoryName] = [];
      }
      acc[categoryName].push(recipe);
      return acc;
    }, {} as Record<string, Recipe[]>);

    return Object.keys(grouped)
      .map(categoryName => ({
        categoryName,
        recipes: grouped[categoryName]
      }))
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName));
  });
}
