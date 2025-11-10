import { Component, ChangeDetectionStrategy, inject, signal, computed, output, OutputEmitterRef, input, InputSignal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DeliveryDataService } from '../../../services/delivery-data.service';
import { NotificationService } from '../../../services/notification.service';
import { RecipeStateService } from '../../../services/recipe-state.service';
import { Recipe, Customer, Order, OrderItem } from '../../../models/db.models';
import { CustomerSelectModalComponent } from '../../shared/customer-select-modal/customer-select-modal.component';
import { SettingsStateService } from '../../../services/settings-state.service';

interface CartItem {
  recipe: Recipe;
  quantity: number;
  notes: string;
}

@Component({
  selector: 'app-delivery-order-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, CustomerSelectModalComponent],
  templateUrl: './delivery-order-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeliveryOrderModalComponent {
  private deliveryDataService = inject(DeliveryDataService);
  private notificationService = inject(NotificationService);
  private recipeState = inject(RecipeStateService);
  private settingsState = inject(SettingsStateService);

  editingOrder: InputSignal<Order | null> = input<Order | null>(null);
  closeModal: OutputEmitterRef<void> = output<void>();
  
  isEditing = computed(() => !!this.editingOrder());

  cart = signal<CartItem[]>([]);
  selectedCustomer = signal<Customer | null>(null);
  paymentMethod: string = 'Dinheiro';
  recipeSearchTerm = signal('');
  distance = signal(0);
  isSaving = signal(false);
  isCustomerSelectModalOpen = signal(false);

  recipes = this.recipeState.recipesWithStockStatus;

  constructor() {
    effect(() => {
        const order = this.editingOrder();
        if (order) {
            // Populate state for editing
            this.isSaving.set(false);
            this.selectedCustomer.set(order.customers || null);
            this.paymentMethod = order.notes?.replace('Pagamento: ', '') || 'Dinheiro';
            this.distance.set(order.delivery_distance_km ?? 0);

            const recipesMap = this.recipeState.recipesById();
            
            const cartItems: CartItem[] = (order.order_items || [])
                .reduce((acc, orderItem) => {
                    if (orderItem.recipe_id) {
                        const recipe = recipesMap.get(orderItem.recipe_id);
                        if (recipe) {
                            const existing = acc.find(ci => ci.recipe.id === recipe.id);
                            if (existing) {
                                existing.quantity += orderItem.quantity;
                            } else {
                                acc.push({ recipe, quantity: orderItem.quantity, notes: orderItem.notes || '' });
                            }
                        }
                    }
                    return acc;
                }, [] as CartItem[]);
            this.cart.set(cartItems);
        }
    });
  }

  filteredRecipes = computed(() => {
    const term = this.recipeSearchTerm().toLowerCase();
    let recipesToShow = this.recipes().filter(r => r.is_available && !r.is_sub_recipe);
    if (term) {
      recipesToShow = recipesToShow.filter(r => r.name.toLowerCase().includes(term));
    }
    return recipesToShow;
  });

  cartTotal = computed(() => {
    return this.cart().reduce((sum, item) => sum + item.recipe.price * item.quantity, 0);
  });

  addToCart(recipe: Recipe & { hasStock?: boolean }) {
    if (!recipe.hasStock) {
        this.notificationService.show('Item sem estoque suficiente.', 'warning');
        return;
    }
    this.cart.update(currentCart => {
      const existing = currentCart.find(item => item.recipe.id === recipe.id);
      if (existing) {
        return currentCart.map(item => item.recipe.id === recipe.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...currentCart, { recipe, quantity: 1, notes: '' }];
    });
  }

  updateQuantity(recipeId: string, change: 1 | -1) {
    this.cart.update(currentCart => 
      currentCart.map(item => 
        item.recipe.id === recipeId 
          ? { ...item, quantity: Math.max(0, item.quantity + change) }
          : item
      ).filter(item => item.quantity > 0)
    );
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // metres
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distanceInMeters = R * c;
    return distanceInMeters / 1000; // convert to KM
  }

  handleCustomerSelected(customer: Customer) {
    this.selectedCustomer.set(customer);
    this.isCustomerSelectModalOpen.set(false);

    const profile = this.settingsState.companyProfile();
    if (customer.latitude && customer.longitude && profile?.latitude && profile.longitude) {
        const distance = this.calculateDistance(
            profile.latitude,
            profile.longitude,
            customer.latitude,
            customer.longitude
        );
        this.distance.set(parseFloat(distance.toFixed(1)));
        this.notificationService.show(`Distância calculada: ${this.distance()} km.`, 'info');
    } else {
        this.distance.set(0); // Reset if coords are missing
    }
  }

  removeCustomer() {
    this.selectedCustomer.set(null);
    this.distance.set(0);
  }

  async saveOrder() {
    if (this.cart().length === 0) {
      this.notificationService.show('O carrinho está vazio.', 'warning');
      return;
    }
    this.isSaving.set(true);
    
    const order = this.editingOrder();
    let result;
    if (order) {
      result = await this.deliveryDataService.updateExternalDeliveryOrder(
        order.id, this.cart(), this.selectedCustomer()?.id || null, this.paymentMethod, this.distance()
      );
    } else {
      result = await this.deliveryDataService.createExternalDeliveryOrder(
        this.cart(),
        this.selectedCustomer()?.id || null,
        this.paymentMethod,
        this.distance()
      );
    }

    this.isSaving.set(false);
    if (result.success) {
      this.notificationService.show(this.isEditing() ? 'Pedido atualizado com sucesso!' : 'Pedido criado com sucesso!', 'success');
      this.closeModal.emit();
    } else {
      this.notificationService.show(`Erro ao salvar pedido: ${result.error?.message}`, 'error');
    }
  }
}