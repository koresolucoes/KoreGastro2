import { Component, ChangeDetectionStrategy, inject, computed, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Recipe, Category, Promotion, PromotionRecipe, LoyaltySettings, LoyaltyReward, CompanyProfile, ReservationSettings } from '../../models/db.models';
import { PricingService } from '../../services/pricing.service';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { ActivatedRoute, Router } from '@angular/router';
import { PublicDataService } from '../../services/public-data.service';
import { AuthService } from '../../services/auth.service';
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
  private authService = inject(AuthService);
  private routeSub: Subscription | undefined;

  // View state
  searchTerm = signal('');
  isPublicView = signal(false);
  isLoading = signal(true);
  view = signal<'cover' | 'menu' | 'info'>('cover');
  activeCategorySlug = signal<string | null>(null);
  
  // For template display
  daysOfWeek = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  
  // Signals for public data
  publicCompanyProfile = signal<Partial<CompanyProfile> | null>(null);
  private publicRecipes = signal<Recipe[]>([]);
  private publicCategories = signal<Category[]>([]);
  publicLoyaltySettings = signal<LoyaltySettings | null>(null);
  private publicLoyaltyRewards = signal<LoyaltyReward[]>([]);
  publicReservationSettings = signal<ReservationSettings | null>(null);

  ngOnInit() {
    this.routeSub = this.route.paramMap.subscribe(params => {
      const userId = params.get('userId');
      if (userId) {
        // Public View
        document.body.classList.remove('bg-gray-900');
        document.body.classList.add('bg-white');
        this.isPublicView.set(true);
        this.view.set('cover'); // Start with the cover page for public
        this.loadPublicData(userId);
      } else {
        // Internal View
        this.isPublicView.set(false);
        this.view.set('menu'); // Start directly on the menu for internal
        this.isLoading.set(this.stateService.isDataLoaded() === false);
      }
    });
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
    // Revert body class if it was changed for the public view
    if (this.isPublicView()) {
        document.body.classList.add('bg-gray-900');
        document.body.classList.remove('bg-white');
    }
  }

  async loadPublicData(userId: string) {
    this.isLoading.set(true);
    const [companyProfile, recipes, categories, promotions, promotionRecipes, loyaltySettings, loyaltyRewards, reservationSettings] = await Promise.all([
      this.publicDataService.getPublicCompanyProfile(userId),
      this.publicDataService.getPublicRecipes(userId),
      this.publicDataService.getPublicCategories(userId),
      this.publicDataService.getPublicPromotions(userId),
      this.publicDataService.getPublicPromotionRecipes(userId),
      this.publicDataService.getPublicLoyaltySettings(userId),
      this.publicDataService.getPublicLoyaltyRewards(userId),
      this.publicDataService.getPublicReservationSettings(userId),
    ]);
    
    // Set data for pricing service to use
    this.pricingService.promotions.set(promotions);
    this.pricingService.promotionRecipes.set(promotionRecipes);

    this.publicCompanyProfile.set(companyProfile);
    this.publicRecipes.set(recipes);
    this.publicCategories.set(categories);
    this.publicLoyaltySettings.set(loyaltySettings);
    this.publicLoyaltyRewards.set(loyaltyRewards);
    this.publicReservationSettings.set(reservationSettings);
    
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

  companyProfile = computed(() => {
    return this.isPublicView() ? this.publicCompanyProfile() : this.stateService.companyProfile();
  });

  reservationSettings = computed(() => {
    return this.isPublicView() ? this.publicReservationSettings() : this.stateService.reservationSettings();
  });

  sortedWeeklyHours = computed(() => {
    const settings = this.reservationSettings();
    if (!settings || !settings.weekly_hours) return [];
    // Sort so Sunday (0) is first.
    return [...settings.weekly_hours].sort((a, b) => a.day_of_week - b.day_of_week);
  });

  publicBookingUrl = computed(() => {
// FIX: Use the public `authService.currentUser` signal instead of the private one on `stateService`.
    const userId = this.isPublicView() ? this.route.snapshot.paramMap.get('userId') : this.authService.currentUser()?.id;
    if (!userId) return '#';
    return `https://gastro.koresolucoes.com.br/#/book/${userId}`;
  });

  isRestaurantOpen = computed(() => {
    const settings = this.reservationSettings();
    if (!settings || !settings.is_enabled || !settings.weekly_hours) return false;

    const now = new Date();
    const currentDayOfWeek = now.getDay(); // 0 for Sunday
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Check today's schedule
    const todaySettings = settings.weekly_hours.find(d => d.day_of_week === currentDayOfWeek);
    if (todaySettings && !todaySettings.is_closed) {
      const [openH, openM] = todaySettings.opening_time.split(':').map(Number);
      const [closeH, closeM] = todaySettings.closing_time.split(':').map(Number);
      const openMinutes = openH * 60 + openM;
      const closeMinutes = closeH * 60 + closeM;

      if (closeMinutes > openMinutes) { // Same day
        if (currentMinutes >= openMinutes && currentMinutes <= closeMinutes) {
          return true;
        }
      } else { // Overnight
        if (currentMinutes >= openMinutes) { // After opening on the same day
          return true;
        }
      }
    }

    // Check yesterday's schedule for overnight closing
    const yesterdayDayOfWeek = (currentDayOfWeek - 1 + 7) % 7;
    const yesterdaySettings = settings.weekly_hours.find(d => d.day_of_week === yesterdayDayOfWeek);
    if (yesterdaySettings && !yesterdaySettings.is_closed) {
      const [openH, openM] = yesterdaySettings.opening_time.split(':').map(Number);
      const [closeH, closeM] = yesterdaySettings.closing_time.split(':').map(Number);
      const openMinutes = openH * 60 + openM;
      const closeMinutes = closeH * 60 + closeM;

      if (closeMinutes <= openMinutes) { // Is overnight
        if (currentMinutes <= closeMinutes) { // Before closing on the next day
          return true;
        }
      }
    }
    
    return false;
  });
  
  setView(newView: 'cover' | 'menu' | 'info') {
    this.view.set(newView);
  }
  
  setSelectedCategory(slug: string | null) {
    this.activeCategorySlug.set(slug);
  }

  createSlug(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  }
}
