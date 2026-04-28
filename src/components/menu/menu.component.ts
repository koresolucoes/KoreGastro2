import { Component, OnInit, inject, signal, computed, ChangeDetectionStrategy, HostBinding } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { supabase } from '../../services/supabase-client';
import { PublicDataService } from '../../services/public-data.service';
import { PricingService } from '../../services/pricing.service';
import { CartService } from '../../services/cart.service';
import { AuthService } from '../../services/auth.service';
import { Recipe, Category, Promotion, PromotionRecipe, CompanyProfile, LoyaltySettings, LoyaltyReward, ReservationSettings, Station, IfoodOptionGroup, RecipeIfoodOptionGroup, IfoodOption } from '../../models/db.models';

import { MenuCustomizationComponent } from './customization/menu-customization.component';
import { MenuCartComponent } from './cart/menu-cart.component';
import { MenuCheckoutComponent } from './checkout/menu-checkout.component';

interface MenuGroup {
  category: Category;
  recipes: Recipe[];
}

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule,
    MenuCustomizationComponent,
    MenuCartComponent,
    MenuCheckoutComponent
  ],
  templateUrl: './menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MenuComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private publicData = inject(PublicDataService);
  private pricing = inject(PricingService);
  private authService = inject(AuthService);
  public cart = inject(CartService);

  // State
  userId = signal<string | null>(null);
  isLoading = signal(true);
  view = signal<'menu' | 'cart' | 'checkout' | 'success' | 'info' | 'loyalty' | 'reservations'>('menu');
  searchTerm = signal('');
  activeCategorySlug = signal<string | null>(null);

  // Data
  companyProfile = signal<Partial<CompanyProfile> | null>(null);
  recipes = signal<Recipe[]>([]);
  categories = signal<Category[]>([]);
  loyaltySettings = signal<LoyaltySettings | null>(null);
  loyaltyRewards = signal<LoyaltyReward[]>([]);
  reservationSettings = signal<ReservationSettings | null>(null);
  optionGroups = signal<IfoodOptionGroup[]>([]);
  recipeOptionGroups = signal<RecipeIfoodOptionGroup[]>([]);
  stations = signal<Station[]>([]);

  // Selection
  customizingRecipe = signal<Recipe | null>(null);

  @HostBinding('class') hostClasses = 'block min-h-screen bg-surface text-body';

  constructor() {}

  async ngOnInit() {
    this.route.params.subscribe(async params => {
      let id = params['userId'];
      
      if (!id) {
        const currentUser = this.authService.currentUser();
        if (currentUser) {
          id = currentUser.id;
        } else {
          // Fallback if signal is not populated yet
          const { data: { session } } = await (supabase.auth as any).getSession();
          if (session?.user) {
            id = session.user.id;
          }
        }
      }

      if (id) {
        this.userId.set(id);
        this.loadPublicData(id);
      } else {
        this.router.navigate(['/home']);
      }
    });
  }

  private async loadPublicData(id: string) {
    this.isLoading.set(true);
    try {
      const [
        profile,
        recipes,
        categories,
        promotions,
        promoRecipes,
        loyalty,
        rewards,
        reservations,
        groups,
        recipeGroups,
        stations
      ] = await Promise.all([
        this.publicData.getPublicCompanyProfile(id),
        this.publicData.getPublicRecipes(id),
        this.publicData.getPublicCategories(id),
        this.publicData.getPublicPromotions(id),
        this.publicData.getPublicPromotionRecipes(id),
        this.publicData.getPublicLoyaltySettings(id),
        this.publicData.getPublicLoyaltyRewards(id),
        this.publicData.getPublicReservationSettings(id),
        this.publicData.getPublicOptionGroups(id),
        this.publicData.getPublicRecipeOptionGroups(id),
        this.publicData.getPublicStations(id)
      ]);

      this.companyProfile.set(profile);
      this.recipes.set(recipes);
      this.categories.set(categories.sort((a,b) => a.name.localeCompare(b.name)));
      this.loyaltySettings.set(loyalty);
      this.loyaltyRewards.set(rewards);
      this.reservationSettings.set(reservations);
      this.optionGroups.set(groups);
      this.recipeOptionGroups.set(recipeGroups);
      this.stations.set(stations);

      // Set pricing signals
      this.pricing.promotions.set(promotions);
      this.pricing.promotionRecipes.set(promoRecipes);

      if (this.categories().length > 0) {
        this.activeCategorySlug.set(this.categories()[0].id);
      }
    } catch (error) {
      console.error('Error loading public menu data:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  // Computed Properties
  menuGroups = computed(() => {
    const search = this.searchTerm().toLowerCase();
    const recipes = this.recipes();
    const categories = this.categories();

    return categories.map(cat => {
      const catRecipes = recipes.filter(r => r.category_id === cat.id);
      const filtered = catRecipes.filter(r => 
        r.name.toLowerCase().includes(search) || 
        r.description?.toLowerCase().includes(search)
      );

      return {
        category: cat,
        recipes: filtered
      };
    }).filter(group => group.recipes.length > 0);
  });

  isRestaurantOpen = computed(() => {
    const settings = this.reservationSettings();
    if (!settings || !settings.weekly_hours) return true;

    const now = new Date();
    const day = now.getDay();
    const schedule = settings.weekly_hours.find(h => h.day_of_week === day);

    if (!schedule || schedule.is_closed) return false;

    const currentStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return currentStr >= schedule.opening_time && currentStr <= schedule.closing_time;
  });

  getEffectivePrice(recipe: Recipe) {
    return this.pricing.getEffectivePrice(recipe);
  }

  getRecipeOptionGroups(recipeId: string): IfoodOptionGroup[] {
    const relations = this.recipeOptionGroups().filter(r => r.recipe_id === recipeId);
    const groupIds = relations.map(r => r.ifood_option_group_id);
    return this.optionGroups()
      .filter(g => groupIds.includes(g.id))
      .sort((a,b) => a.sequence - b.sequence);
  }

  // Actions
  onSelectRecipe(recipe: Recipe) {
    const groups = this.getRecipeOptionGroups(recipe.id);
    if (groups.length > 0) {
      this.customizingRecipe.set(recipe);
    } else {
      this.cart.addToCart(recipe, this.getEffectivePrice(recipe));
    }
  }

  onConfirmCustomization(event: { options: IfoodOption[], notes: string }) {
    const recipe = this.customizingRecipe();
    if (recipe) {
      const basePrice = this.getEffectivePrice(recipe);
      const optionsPrice = event.options.reduce((sum, o) => sum + o.price, 0);
      this.cart.addToCart(recipe, basePrice + optionsPrice, event.options, event.notes);
      this.customizingRecipe.set(null);
    }
  }

  async onConfirmOrder(event: { type: string, name: string, phone: string, address: string }) {
    const uid = this.userId();
    if (!uid) return;

    this.isLoading.set(true);
    try {
      const stationId = this.stations()[0]?.id;
      
      const orderData = {
        user_id: uid,
        table_number: 0,
        customer_name: event.name,
        order_type: event.type === 'delivery' ? 'External-Delivery' : 'QuickSale',
        status: 'OPEN',
        notes: `Contato: ${event.phone}${event.address ? ' | Endereço: ' + event.address : ''}`,
        delivery_info: event.type === 'delivery' ? { address: event.address } : null
      };

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert(orderData)
        .select()
        .single();

      if (orderError) throw orderError;

      const orderItems = this.cart.items().map(item => ({
        order_id: order.id,
        recipe_id: item.recipe.id,
        name: item.recipe.name,
        quantity: item.quantity,
        price: item.effectivePrice,
        original_price: item.recipe.price,
        status: 'PENDENTE',
        user_id: uid,
        station_id: stationId,
        notes: item.notes,
        status_timestamps: { PENDENTE: new Date().toISOString() }
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      this.cart.clearCart();
      this.view.set('success');
    } catch (error) {
      console.error('Error submitting order:', error);
      alert('Erro ao enviar pedido. Tente novamente.');
    } finally {
      this.isLoading.set(false);
    }
  }

  scrollToCategory(categoryId: string) {
    this.activeCategorySlug.set(categoryId);
    const element = document.getElementById('cat-' + categoryId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}
