import { Component, ChangeDetectionStrategy, inject, computed, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, ViewportScroller } from '@angular/common';
import { Recipe, Category, Promotion, PromotionRecipe, LoyaltySettings, LoyaltyReward, CompanyProfile, ReservationSettings, Order, OrderItem, Station, IfoodOptionGroup, IfoodOption, RecipeIfoodOptionGroup } from '../../models/db.models';
import { PricingService } from '../../services/pricing.service';
import { ActivatedRoute, Router } from '@angular/router';
import { PublicDataService } from '../../services/public-data.service';
import { AuthService } from '../../services/auth.service';
import { Subscription } from 'rxjs';
import { DemoService } from '../../services/demo.service';
import { CartService } from '../../services/cart.service';
import { supabase } from '../../services/supabase-client';
import { FormsModule } from '@angular/forms';

// Import state services
import { SupabaseStateService } from '../../services/supabase-state.service';
import { RecipeStateService } from '../../services/recipe-state.service';
import { SettingsStateService } from '../../services/settings-state.service';
import { PosStateService } from '../../services/pos-state.service';

interface MenuGroup {
  category: Category;
  recipes: (Recipe & { effectivePrice: number })[];
}

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuComponent implements OnInit, OnDestroy {
  private supabaseStateService = inject(SupabaseStateService);
  private recipeState = inject(RecipeStateService);
  private settingsState = inject(SettingsStateService);
  private posState = inject(PosStateService);
  private pricingService = inject(PricingService);
  private route: ActivatedRoute = inject(ActivatedRoute);
  private router: Router = inject(Router);
  private publicDataService = inject(PublicDataService);
  private authService = inject(AuthService);
  private demoService = inject(DemoService);
  private viewportScroller = inject(ViewportScroller);
  public cartService = inject(CartService);
  
  private routeSub: Subscription | undefined;

  // View state
  searchTerm = signal('');
  isPublicView = signal(false);
  isLoading = signal(true);
  view = signal<'cover' | 'menu' | 'info' | 'loyalty' | 'cart' | 'checkout' | 'reservations'>('cover');
  activeCategorySlug = signal<string | null>(null);
  
  // Checkout state
  orderType = signal<'External-Delivery' | 'Pickup'>('External-Delivery');
  customerName = signal('');
  customerPhone = signal('');
  deliveryAddress = signal('');
  isSubmittingOrder = signal(false);
  orderSuccess = signal(false);
  
  // For template display
  daysOfWeek = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  
  // Signals for public data
  publicCompanyProfile = signal<Partial<CompanyProfile> | null>(null);
  private publicRecipes = signal<Recipe[]>([]);
  private publicCategories = signal<Category[]>([]);
  publicLoyaltySettings = signal<LoyaltySettings | null>(null);
  private publicLoyaltyRewards = signal<LoyaltyReward[]>([]);
  publicReservationSettings = signal<ReservationSettings | null>(null);
  private publicStations = signal<Station[]>([]);

  // Customization state
  publicOptionGroups = signal<IfoodOptionGroup[]>([]);
  publicRecipeOptionGroups = signal<RecipeIfoodOptionGroup[]>([]);
  customizingRecipe = signal<Recipe | null>(null);
  selectedOptions = signal<IfoodOption[]>([]);
  customizationNotes = signal('');

  // Integrated Booking View State (simplified or linking)
  userId = signal<string | null>(null);

  ngOnInit() {
    this.routeSub = this.route.paramMap.subscribe(params => {
      const userId = params.get('userId');
      if (userId) {
        // Public View
        this.userId.set(userId);
        this.isPublicView.set(true);
        this.view.set('cover'); // Start with the cover page for public
        this.loadPublicData(userId);
      } else {
        // Internal View
        this.isPublicView.set(false);
        this.view.set('menu'); // Start directly on the menu for internal
        this.isLoading.set(this.supabaseStateService.isDataLoaded() === false);
      }
    });
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
  }

  async loadPublicData(userId: string) {
    this.isLoading.set(true);
    try {
      const [companyProfile, recipes, categories, promotions, promotionRecipes, loyaltySettings, loyaltyRewards, reservationSettings, stations, optionGroups, recipeOptionGroups] = await Promise.all([
        this.publicDataService.getPublicCompanyProfile(userId),
        this.publicDataService.getPublicRecipes(userId),
        this.publicDataService.getPublicCategories(userId),
        this.publicDataService.getPublicPromotions(userId),
        this.publicDataService.getPublicPromotionRecipes(userId),
        this.publicDataService.getPublicLoyaltySettings(userId),
        this.publicDataService.getPublicLoyaltyRewards(userId),
        this.publicDataService.getPublicReservationSettings(userId),
        this.publicDataService.getPublicStations(userId),
        this.publicDataService.getPublicOptionGroups(userId),
        this.publicDataService.getPublicRecipeOptionGroups(userId),
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
      this.publicStations.set(stations);
      this.publicOptionGroups.set(optionGroups);
      this.publicRecipeOptionGroups.set(recipeOptionGroups);
    } catch (error) {
      console.error('Error loading public menu data:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  baseMenu = computed<MenuGroup[]>(() => {
    let recipesSource: Recipe[];
    let categoriesSource: Category[];
    
    if (this.isPublicView()) {
      recipesSource = this.publicRecipes();
      categoriesSource = this.publicCategories();
    } else {
      recipesSource = this.recipeState.recipesWithStockStatus()
        .filter(recipe => recipe.is_available && recipe.hasStock && !recipe.is_sub_recipe);
      categoriesSource = this.recipeState.categories();
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
    // When searching, we want to search across ALL categories, ignoring the selected category filter
    const term = this.searchTerm().toLowerCase();
    
    if (term) {
         return menu.map(group => ({
            ...group,
            recipes: group.recipes.filter(recipe => 
                recipe.name.toLowerCase().includes(term) ||
                recipe.description?.toLowerCase().includes(term)
            )
        })).filter(group => group.recipes.length > 0);
    }
    
    // If not searching, respect category filter
    const activeSlug = this.activeCategorySlug();
    if (activeSlug) {
        return menu.filter(group => this.createSlug(group.category.name) === activeSlug);
    }
    
    return menu;
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
    return this.isPublicView() ? this.publicCompanyProfile() : this.settingsState.companyProfile();
  });

  reservationSettings = computed(() => {
    return this.isPublicView() ? this.publicReservationSettings() : this.settingsState.reservationSettings();
  });

  sortedWeeklyHours = computed(() => {
    const settings = this.reservationSettings();
    if (!settings || !settings.weekly_hours) return [];
    // Sort so Sunday (0) is first.
    return [...settings.weekly_hours].sort((a, b) => a.day_of_week - b.day_of_week);
  });

  publicBookingUrl = computed(() => {
    const userId = this.userId();
    if (!userId) return '#';
    // Use local relative path for better reliability
    return `/book/${userId}`;
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
      let closeMinutes = closeH * 60 + closeM;

      if (closeMinutes < openMinutes) { // Overnight
          closeMinutes += 1440; // Add 24 hours
      }

      if (currentMinutes >= openMinutes && currentMinutes <= closeMinutes) {
          return true;
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

      if (closeMinutes < openMinutes) { // Is overnight
        if (currentMinutes <= closeMinutes) { // Before closing on the next day
          return true;
        }
      }
    }
    
    return false;
  });
  
  setView(newView: 'cover' | 'menu' | 'info' | 'loyalty' | 'cart' | 'checkout') {
    this.view.set(newView);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  goToReservations() {
      const userId = this.userId();
      if (userId) {
          this.router.navigate(['/book', userId]);
      }
  }
  
  setSelectedCategory(slug: string | null) {
    this.activeCategorySlug.set(slug);
    if (slug === 'top') {
        (this.viewportScroller as any).scrollToPosition([0, 0]);
        this.activeCategorySlug.set(null);
    } else if (slug && this.view() === 'menu') {
        // Scroll to anchor logic if needed, but filtering is usually enough for a clean UI
        // this.viewportScroller.scrollToAnchor(slug);
    }
  }
  
  scrollToCategory(slug: string) {
      if (slug === 'top') {
         window.scrollTo({ top: 0, behavior: 'smooth' });
      }
  }
  
  addToCart(recipe: Recipe, effectivePrice: number) {
    // Check if recipe has option groups
    const linkedGroups = this.publicRecipeOptionGroups()
      .filter(l => l.recipe_id === recipe.id)
      .map(l => l.ifood_option_group_id);

    if (linkedGroups.length > 0) {
      this.openCustomization(recipe);
    } else {
      this.cartService.addToCart(recipe, effectivePrice);
    }
  }

  // --- Customization Logic ---
  
  recipeGroups = computed(() => {
    const r = this.customizingRecipe();
    if (!r) return [];
    
    const linkedIds = this.publicRecipeOptionGroups()
      .filter(l => l.recipe_id === r.id)
      .map(l => l.ifood_option_group_id);
      
    return this.publicOptionGroups().filter(g => linkedIds.includes(g.id));
  });

  currentCustomPrice = computed(() => {
    const r = this.customizingRecipe();
    if (!r) return 0;
    const base = this.pricingService.getEffectivePrice(r);
    const optionsTotal = this.selectedOptions().reduce((sum, o) => sum + (o.price || 0), 0);
    return base + optionsTotal;
  });

  openCustomization(recipe: Recipe) {
    this.customizingRecipe.set(recipe);
    this.selectedOptions.set([]);
    this.customizationNotes.set('');
  }

  closeCustomization() {
    this.customizingRecipe.set(null);
  }

  toggleOption(group: IfoodOptionGroup, option: IfoodOption) {
    const current = this.selectedOptions();
    const groupOptions = group.ifood_options || [];
    const isAlreadySelected = current.some(o => o.id === option.id);

    if (isAlreadySelected) {
      this.selectedOptions.set(current.filter(o => o.id !== option.id));
    } else {
      // Check max limit
      const currentInGroup = current.filter(o => groupOptions.some(go => go.id === o.id));
      if (group.max_options === 1) {
        // Replace existing in group
        const filtered = current.filter(o => !groupOptions.some(go => go.id === o.id));
        this.selectedOptions.set([...filtered, option]);
      } else if (currentInGroup.length < group.max_options) {
        this.selectedOptions.set([...current, option]);
      }
    }
  }

  isOptionSelected(optionId: string): boolean {
    return this.selectedOptions().some(o => o.id === optionId);
  }

  canConfirmCustomization(): boolean {
    const r = this.customizingRecipe();
    if (!r) return false;
    
    const groups = this.recipeGroups();
    const selected = this.selectedOptions();
    
    for (const group of groups) {
      const selectedInGroup = selected.filter(o => (group.ifood_options || []).some(go => go.id === o.id)).length;
      if (selectedInGroup < group.min_required) return false;
    }
    
    return true;
  }

  confirmCustomization() {
    const recipe = this.customizingRecipe();
    if (!recipe || !this.canConfirmCustomization()) return;

    this.cartService.addToCart(
      recipe, 
      this.currentCustomPrice(), 
      this.selectedOptions(), 
      this.customizationNotes()
    );
    this.closeCustomization();
  }

  async submitOrder() {
    const userId = this.route.snapshot.paramMap.get('userId');
    if (!userId || this.cartService.items().length === 0) return;

    this.isSubmittingOrder.set(true);

    try {
      const orderId = crypto.randomUUID();
      const orderData: Partial<Order> = {
        id: orderId,
        user_id: userId,
        status: 'OPEN',
        order_type: this.orderType() === 'Pickup' ? 'QuickSale' : 'External-Delivery',
        table_number: 0,
        notes: `Cliente: ${this.customerName()} | Tel: ${this.customerPhone()} ${this.orderType() === 'External-Delivery' ? '| Endereço: ' + this.deliveryAddress() : '| Retirada no local'}`,
        timestamp: new Date().toISOString(),
      };

      const { error: orderError } = await supabase
        .from('orders')
        .insert(orderData);

      if (orderError) throw orderError;

      // Get a valid station ID
      let fallbackStationId = '';
      if (this.isPublicView()) {
        fallbackStationId = this.publicStations()[0]?.id || '';
      } else {
        fallbackStationId = this.posState.stations()[0]?.id || '';
      }

      if (!fallbackStationId) {
        // If no station is found, we might have a problem if the DB requires it.
        // However, most systems have at least one station.
        console.warn('No production station found. Order items might fail if station_id is mandatory.');
      }

      const orderItemsData: Partial<OrderItem>[] = this.cartService.items().map(item => ({
        order_id: orderId,
        user_id: userId,
        recipe_id: item.recipe.id,
        name: item.recipe.name,
        quantity: item.quantity,
        price: item.effectivePrice,
        original_price: item.recipe.price,
        status: 'PENDENTE',
        station_id: fallbackStationId,
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItemsData);

      if (itemsError) throw itemsError;

      this.orderSuccess.set(true);
      this.cartService.clearCart();
      setTimeout(() => {
        this.orderSuccess.set(false);
        this.setView('cover');
      }, 5000);

    } catch (error) {
      console.error('Error submitting order:', error);
      alert('Erro ao enviar pedido. Por favor, tente novamente.');
    } finally {
      this.isSubmittingOrder.set(false);
    }
  }

  createSlug(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  }
}
