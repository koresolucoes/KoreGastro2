import { Component, OnInit, inject, signal, computed, ChangeDetectionStrategy, HostBinding, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { supabase } from '../../services/supabase-client';
import { PublicDataService } from '../../services/public-data.service';
import { PricingService } from '../../services/pricing.service';
import { CartService } from '../../services/cart.service';
import { AuthService } from '../../services/auth.service';
import { UnitContextService } from '../../services/unit-context.service';
import { Recipe, Category, Promotion, PromotionRecipe, CompanyProfile, LoyaltySettings, LoyaltyReward, ReservationSettings, Station, IfoodOptionGroup, RecipeIfoodOptionGroup, IfoodOption, Order } from '../../models/db.models';

import { MenuCustomizationComponent } from './customization/menu-customization.component';
import { MenuCartComponent } from './cart/menu-cart.component';
import { MenuCheckoutComponent } from './checkout/menu-checkout.component';
import { MenuAuthComponent } from './auth/menu-auth.component';
import { MenuProfileComponent } from './profile/menu-profile.component';
import { CustomerAuthService } from '../../services/customer-auth.service';
import { RecipeStateService } from '../../services/recipe-state.service';
import { NotificationService } from '../../services/notification.service';

interface MenuGroup {
  category: Category;
  recipes: Recipe[];
}

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [
    CommonModule, 
    RouterModule,
    FormsModule,
    MenuCustomizationComponent,
    MenuCartComponent,
    MenuCheckoutComponent,
    MenuAuthComponent,
    MenuProfileComponent
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
  private unitContext = inject(UnitContextService);
  public customerAuthService = inject(CustomerAuthService);
  private recipeState = inject(RecipeStateService);
  private notificationService = inject(NotificationService);

  // State
  userId = signal<string | null>(null);
  isLoading = signal(true);
  view = signal<'menu' | 'cart' | 'checkout' | 'success' | 'info' | 'loyalty' | 'reservations' | 'auth' | 'profile' | 'table-checkin' | 'table-bill'>('menu');
  searchTerm = signal('');
  activeCategorySlug = signal<string | null>(null);

  // Data
  companyProfile = signal<Partial<CompanyProfile> | null>(null);
  tableOrder = signal<Order | null>(null);
  sessionToken = signal<string | null>(null);
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

  constructor() {
    effect(() => {
      const cust = this.customerAuthService.customer();
      const order = this.tableOrder();
      
      if (cust && order && !order.customer_name && this.view() === 'table-checkin') {
         // Auto-checkin since they logged in or already had a session
         this.submitTableCheckin({ name: cust.name, phone: cust.phone, cpf: cust.cpf || '' });
      }
    });
  }

  async ngOnInit() {
    this.route.params.subscribe(async params => {
      let id = params['userId'];
      const token = params['sessionToken'];
      
      if (token) {
        this.isLoading.set(true);
        this.sessionToken.set(token);
        // By having userId from the URL, we can guarantee the menu loads even if the session token is invalid/closed.
        const { order, error } = await this.publicData.getOrderBySessionToken(token);
        if (order && !error) {
            console.log('Order fetched successfully:', order);
            this.tableOrder.set(order as Order);
            try { fetch('/api/public-table-occupied?token=' + token).catch(console.error); } catch(e){}
            if (!id) {
                id = order.user_id;
            }
            if (!order.customer_name) {
                this.view.set('table-checkin');
            }
        } else {
            console.error('Table order not found or error:', error);
            // We have `id` from params, so the menu will still load for this restaurant!
        }
        this.isLoading.set(false);
      }
      
      if (!id) {
        // Se estiver logado, pegue a loja ativa. Isso conserta o erro onde gerentes
        // que administram lojas de terceiros tentavam carregar com seu próprio user.id e era redirecionado ou não carregava.
        const activeUnit = this.unitContext.activeUnitId();
        if (activeUnit) {
          id = activeUnit;
        } else {
          const currentUser = this.authService.currentUser();
          if (currentUser) {
            id = currentUser.id;
          } else {
            // Fallback if signal is not populated yet
            const { data: { session } } = await (supabase.auth as any).getSession();
            if (session?.user && session.user.id) {
              id = session.user.id;
            }
          }
        }
      }

      if (id) {
        this.userId.set(id);
        this.loadPublicData(id);
      } else {
        console.error('Menu Online: Nenhum ID de loja encontrado. Redirecionando para home.');
        this.router.navigate(['/home']);
      }
    });
  }

  private async loadPublicData(id: string) {
    this.isLoading.set(true);
    try {
      const virtualMenu = await this.publicData.getPublicVirtualMenu(id);
      
      const [
        profile,
        promotions,
        promoRecipes,
        loyalty,
        rewards,
        reservations,
        stations
      ] = await Promise.all([
        this.publicData.getPublicCompanyProfile(id),
        this.publicData.getPublicPromotions(id),
        this.publicData.getPublicPromotionRecipes(id),
        this.publicData.getPublicLoyaltySettings(id),
        this.publicData.getPublicLoyaltyRewards(id),
        this.publicData.getPublicReservationSettings(id),
        this.publicData.getPublicStations(id)
      ]);

      this.companyProfile.set(profile);
      this.recipes.set(virtualMenu?.recipes || []);
      this.categories.set(virtualMenu?.categories || []);
      this.loyaltySettings.set(loyalty);
      this.loyaltyRewards.set(rewards);
      this.reservationSettings.set(reservations);
      this.optionGroups.set(virtualMenu?.optionGroups || []);
      this.recipeOptionGroups.set(virtualMenu?.recipeOptionGroups || []);
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

  getTableTotal() {
    const order: any = this.tableOrder();
    if (!order || !order.order_items) return 0;
    return order.order_items.reduce((sum: number, i: any) => sum + (i.price * i.quantity), 0);
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

  onProceedToCheckout() {
    if (this.tableOrder()) {
      this.onConfirmTableOrder();
    } else {
      this.view.set('checkout');
    }
  }

  async onConfirmTableOrder() {
     const order = this.tableOrder();
     if (!order) return;
     
     this.isLoading.set(true);
     try {
       const orderItems = this.cart.items().map(item => {
         let finalNotes = item.notes || '';
         let finalCostOptions = 0;

         if (item.options && item.options.length > 0) {
             const groups = this.getRecipeOptionGroups(item.recipe.id);
             const groupedOptions = new Map<string, typeof item.options>();
             item.options.forEach(opt => {
                 const arr = groupedOptions.get(opt.ifood_option_group_id) || [];
                 arr.push(opt);
                 groupedOptions.set(opt.ifood_option_group_id, arr);
             });

             const groupStrings: string[] = [];
             groups.forEach(g => {
                 const selectedInGroup = groupedOptions.get(g.id);
                 if (selectedInGroup && selectedInGroup.length > 0) {
                     groupStrings.push(`${g.name}: ${selectedInGroup.map(o => o.name).join(', ')}`);
                     finalCostOptions += selectedInGroup.reduce((sum, o) => sum + o.price, 0);
                 }
             });

             const optionsText = groupStrings.join(' | ');
             if (finalNotes) {
                 finalNotes = `${optionsText}\nObs: ${finalNotes}`;
             } else {
                 finalNotes = optionsText;
             }
         }

         return {
           order_id: order.id,
           recipe_id: item.recipe.id,
           name: item.recipe.name,
           quantity: item.quantity,
           price: item.effectivePrice,
           original_price: item.recipe.price + finalCostOptions,
           notes: finalNotes,
           status: 'PENDENTE',
           user_id: order.user_id,
           station_id: this.stations()[0]?.id
         };
       });

       const { error } = await supabase.from('order_items').insert(orderItems);
       if (error) throw error;
       
       this.cart.clearCart();
       
       // Alert or show success
       const successDiv = document.createElement('div');
       successDiv.className = 'bg-emerald-50 text-emerald-600 fixed top-4 left-4 right-4 z-[300] p-4 rounded-2xl shadow-xl flex items-center justify-center font-bold animate-in slide-in-from-top text-center';
       successDiv.innerHTML = `<span class="material-symbols-outlined mr-2">check_circle</span> Pedido enviado para a cozinha!`;
       document.body.appendChild(successDiv);
       setTimeout(() => successDiv.remove(), 4000);
       
       this.view.set('menu');

     } catch (err: any) {
        alert('Erro ao enviar pedido: ' + err.message);
     } finally {
        this.isLoading.set(false);
     }
  }

  async submitTableCheckin(data: { name: string, phone: string, cpf: string }) {
    const order = this.tableOrder();
    if (!order) return;

    this.isLoading.set(true);
    try {
      const notes = `Contato: ${data.phone} | CPF: ${data.cpf}`;
      const updates = {
        customer_name: data.name,
        notes: order.notes ? `${order.notes}\n${notes}` : notes
      };
      const { error } = await this.publicData.publicUpdateTableOrder(order.id, updates);
      if (error) throw error;

      this.tableOrder.update(o => o ? { ...o, ...updates } : null);
      this.view.set('menu');
      this.notificationService.show('Mesa vinculada com sucesso.', 'success');
    } catch (e: any) {
      console.error(e);
      this.notificationService.alert('Não foi possível fazer o check-in.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async requestBill() {
    const order = this.tableOrder();
    if (!order) return;
    
    this.isLoading.set(true);
    try {
      const billNote = `[SOLICITOU FECHAMENTO DE CONTA]`;
      const notes = order.notes ? (order.notes.includes(billNote) ? order.notes : `${order.notes}\n${billNote}`) : billNote;
      const { error } = await this.publicData.publicUpdateTableOrder(order.id, { notes });
      if (error) throw error;
      
      this.tableOrder.update(o => o ? { ...o, notes } : null);
      this.view.set('menu');
      this.notificationService.show('Fechamento de conta solicitado ao caixa.', 'success');
    } catch(e: any) {
      console.error(e);
      this.notificationService.alert('Erro ao solicitar fechamento.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async onConfirmOrder(event: { type: string, name: string, phone: string, address: string }) {
    const uid = this.userId();
    if (!uid) return;

    this.isLoading.set(true);
    try {
      const stationId = this.stations()[0]?.id;
      
      const orderId = crypto.randomUUID();

      const orderData = {
        id: orderId,
        user_id: uid,
        table_number: 0,
        customer_name: event.name,
        customer_id: this.customerAuthService.customer()?.id || null,
        order_type: event.type === 'delivery' ? 'External-Delivery' : 'QuickSale',
        status: 'OPEN',
        notes: `Contato: ${event.phone}${event.address ? ' | Endereço: ' + event.address : ''}`,
        delivery_info: event.type === 'delivery' ? { address: event.address } : null
      };

      const { error: orderError } = await supabase
        .from('orders')
        .insert(orderData);

      if (orderError) throw orderError;

      const orderItems = this.cart.items().map(item => {
         let finalNotes = item.notes || '';
         let optionRecipeIds: string[] = [];
         let finalCostOptions = 0;

         if (item.options && item.options.length > 0) {
             const groups = this.getRecipeOptionGroups(item.recipe.id);
             const groupedOptions = new Map<string, typeof item.options>();
             item.options.forEach(opt => {
                 const arr = groupedOptions.get(opt.ifood_option_group_id) || [];
                 arr.push(opt);
                 groupedOptions.set(opt.ifood_option_group_id, arr);
                 if (opt.ifood_product_id) { // Recipe ID
                     optionRecipeIds.push(opt.ifood_product_id);
                     finalCostOptions += this.recipeState.recipeCosts().get(opt.ifood_product_id)?.totalCost ?? 0;
                 }
             });

             let hierarchyStr = '';
             groupedOptions.forEach((opts, groupId) => {
                 const groupName = groups.find(g => g.id === groupId)?.name || 'Opções';
                 hierarchyStr += `\n>> ${groupName}:\n` + opts.map(o => `   • ${o.name}`).join('\n');
             });

             finalNotes = finalNotes ? `${finalNotes}\n${hierarchyStr}` : hierarchyStr.trim();
             // Add hidden tags
             if (optionRecipeIds.length > 0) {
                 finalNotes += `\n[OPT_RECIPE_IDS:${optionRecipeIds.join(',')}]`;
             }
         }

          const baseCost = this.recipeState.recipeCosts().get(item.recipe.id)?.totalCost ?? 0;

          return {
             order_id: orderId,
             recipe_id: item.recipe.id,
             name: item.recipe.name,
             quantity: item.quantity,
             price: item.effectivePrice,
             original_price: item.recipe.price,
             status: 'PENDENTE',
             user_id: uid,
             station_id: stationId,
             notes: finalNotes,
             unit_cost: baseCost + finalCostOptions,
             status_timestamps: { PENDENTE: new Date().toISOString() }
          }
      });

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      this.cart.clearCart();
      this.view.set('success');
    } catch (error) {
      this.notificationService.alert('Erro ao enviar pedido. Tente novamente.');
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
