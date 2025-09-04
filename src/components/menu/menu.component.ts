
import { Component, ChangeDetectionStrategy, inject, computed, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Recipe, Category, Promotion, PromotionRecipe } from '../../models/db.models';
import { PricingService } from '../../services/pricing.service';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { ActivatedRoute } from '@angular/router';
import { PublicDataService } from '../../services/public-data.service';
import { Subscription } from 'rxjs';

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
export class MenuComponent implements OnInit, OnDestroy {
  private stateService = inject(SupabaseStateService);
  private pricingService = inject(PricingService);
  private route = inject(ActivatedRoute);
  private publicDataService = inject(PublicDataService);
  private routeSub: Subscription | undefined;

  searchTerm = signal('');
  isPublicView = signal(false);
  isLoading = signal(true);
  
  // Signals for public data
  private publicRecipes = signal<Recipe[]>([]);
  private publicCategories = signal<Category[]>([]);

  ngOnInit() {
    this.routeSub = this.route.paramMap.subscribe(params => {
      const userId = params.get('userId');
      if (userId) {
        document.body.classList.remove('bg-gray-900');
        document.body.classList.add('bg-gray-100');
        this.isPublicView.set(true);
        this.loadPublicData(userId);
      } else {
        this.isPublicView.set(false);
        this.isLoading.set(this.stateService.isDataLoaded() === false);
      }
    });
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
    // Revert body class if it was changed for the public view
    if (this.isPublicView()) {
        document.body.classList.add('bg-gray-900');
        document.body.classList.remove('bg-gray-100');
    }
  }

  async loadPublicData(userId: string) {
    this.isLoading.set(true);
    const [recipes, categories, promotions, promotionRecipes] = await Promise.all([
      this.publicDataService.getPublicRecipes(userId),
      this.publicDataService.getPublicCategories(userId),
      this.publicDataService.getPublicPromotions(userId),
      this.publicDataService.getPublicPromotionRecipes(userId),
    ]);
    
    // Set data for pricing service to use
    this.pricingService.promotions.set(promotions);
    this.pricingService.promotionRecipes.set(promotionRecipes);

    this.publicRecipes.set(recipes);
    this.publicCategories.set(categories);
    
    this.isLoading.set(false);
  }

  onlineMenu = computed<MenuGroup[]>(() => {
    const term = this.searchTerm().toLowerCase();
    
    let recipesSource: Recipe[];
    let categoriesSource: Category[];
    
    if (this.isPublicView()) {
      recipesSource = this.publicRecipes();
      categoriesSource = this.publicCategories();
    } else {
      recipesSource = this.stateService.recipesWithStockStatus()
        .filter(recipe => recipe.is_available && recipe.hasStock && !recipe.is_sub_recipe && !recipe.source_ingredient_id);
      categoriesSource = this.stateService.categories();
    }

    if (term) {
      recipesSource = recipesSource.filter(recipe => 
        recipe.name.toLowerCase().includes(term) ||
        recipe.description?.toLowerCase().includes(term)
      );
    }
    
    const categoryMap = new Map(categoriesSource.map(c => [c.id, c.name]));

    const recipesWithPrice = recipesSource.map(recipe => ({
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
