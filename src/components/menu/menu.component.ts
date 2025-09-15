import { Component, ChangeDetectionStrategy, inject, computed, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Recipe, Category, Promotion, PromotionRecipe, LoyaltySettings, LoyaltyReward, CompanyProfile } from '../../models/db.models';
import { PricingService } from '../../services/pricing.service';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { ActivatedRoute, Router } from '@angular/router';
import { PublicDataService } from '../../services/public-data.service';
import { Subscription } from 'rxjs';

interface MenuGroup {
  category: Category;
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
  private router = inject(Router);
  private publicDataService = inject(PublicDataService);
  private routeSub: Subscription | undefined;

  searchTerm = signal('');
  isPublicView = signal(false);
  isLoading = signal(true);
  activeTab = signal<'menu' | 'rewards'>('menu');
  activeCategorySlug = signal<string | null>(null);
  
  // Signals for public data
  publicCompanyProfile = signal<Partial<CompanyProfile> | null>(null);
  private publicRecipes = signal<Recipe[]>([]);
  private publicCategories = signal<Category[]>([]);
  publicLoyaltySettings = signal<LoyaltySettings | null>(null);
  private publicLoyaltyRewards = signal<LoyaltyReward[]>([]);

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
    const [companyProfile, recipes, categories, promotions, promotionRecipes, loyaltySettings, loyaltyRewards] = await Promise.all([
      this.publicDataService.getPublicCompanyProfile(userId),
      this.publicDataService.getPublicRecipes(userId),
      this.publicDataService.getPublicCategories(userId),
      this.publicDataService.getPublicPromotions(userId),
      this.publicDataService.getPublicPromotionRecipes(userId),
      this.publicDataService.getPublicLoyaltySettings(userId),
      this.publicDataService.getPublicLoyaltyRewards(userId),
    ]);
    
    // Set data for pricing service to use
    this.pricingService.promotions.set(promotions);
    this.pricingService.promotionRecipes.set(promotionRecipes);

    this.publicCompanyProfile.set(companyProfile);
    this.publicRecipes.set(recipes);
    this.publicCategories.set(categories);
    this.publicLoyaltySettings.set(loyaltySettings);
    this.publicLoyaltyRewards.set(loyaltyRewards);
    
    this.isLoading.set(false);
  }

  baseMenu = computed<MenuGroup[]>(() => {
    let recipesSource: Recipe[];
    let categoriesSource: Category[];
    
    if (this.isPublicView()) {
      recipesSource = this.publicRecipes();
      categoriesSource = this.publicCategories();
    } else {
      recipesSource = this.stateService.recipesWithStockStatus()
        .filter(recipe => recipe.is_available && recipe.hasStock && !recipe.is_sub_recipe);
      categoriesSource = this.stateService.categories();
    }

    const recipesWithPrice = recipesSource.map(recipe => ({
        ...recipe,
        effectivePrice: this.pricingService.getEffectivePrice(recipe)
    }));

    const groupedByCategory = new Map<string, (Recipe & { effectivePrice: number })[]>();
    for (const recipe of recipesWithPrice) {
        if (!groupedByCategory.has(recipe.category_id)) {
            groupedByCategory.set(recipe.category_id, []);
        }
        groupedByCategory.get(recipe.category_id)!.push(recipe);
    }
    
    return categoriesSource
      .map(category => ({
        category,
        recipes: groupedByCategory.get(category.id) || []
      }))
      .filter(group => group.recipes.length > 0)
      .sort((a, b) => a.category.name.localeCompare(b.category.name));
  });

  menuCategories = computed(() => this.baseMenu().map(group => group.category));
  
  filteredMenu = computed(() => {
    const menu = this.baseMenu();
    const activeSlug = this.activeCategorySlug();
    const term = this.searchTerm().toLowerCase();

    let categoryFilteredMenu = menu;
    if (activeSlug) {
        categoryFilteredMenu = menu.filter(group => this.createSlug(group.category.name) === activeSlug);
    }
    
    if (!term) {
        return categoryFilteredMenu;
    }
    
    return categoryFilteredMenu.map(group => ({
        ...group,
        recipes: group.recipes.filter(recipe => 
            recipe.name.toLowerCase().includes(term) ||
            recipe.description?.toLowerCase().includes(term)
        )
    })).filter(group => group.recipes.length > 0);
  });
  
  loyaltyRewardsDisplay = computed(() => {
    const rewards = this.publicLoyaltyRewards();
    const recipesMap = new Map(this.publicRecipes().map(r => [r.id, r.name]));

    return rewards.map(reward => {
      let valueLabel = '';
      switch (reward.reward_type) {
        case 'free_item':
          valueLabel = `Item Grátis: ${recipesMap.get(reward.reward_value) || 'Item especial'}`;
          break;
        case 'discount_percentage':
          valueLabel = `${reward.reward_value}% de desconto`;
          break;
        case 'discount_fixed':
          valueLabel = `R$ ${reward.reward_value} de desconto`;
          break;
      }
      return {
        ...reward,
        valueLabel
      };
    });
  });
  
  setSelectedCategory(slug: string | null) {
    this.activeCategorySlug.set(slug);
  }

  createSlug(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  }
}