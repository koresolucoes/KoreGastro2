import { Component, ChangeDetectionStrategy, inject, signal, computed, output, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DeliveryDataService } from '../../../services/delivery-data.service';
import { NotificationService } from '../../../services/notification.service';
import { RecipeStateService } from '../../../services/recipe-state.service';
import { PosStateService } from '../../../services/pos-state.service';
import { Recipe, Customer } from '../../../models/db.models';
import { CustomerSelectModalComponent } from '../../shared/customer-select-modal/customer-select-modal.component';

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
  private posState = inject(PosStateService);

  closeModal: OutputEmitterRef<void> = output<void>();

  cart = signal<CartItem[]>([]);
  selectedCustomer = signal<Customer | null>(null);
  paymentMethod: string = 'Dinheiro';
  recipeSearchTerm = signal('');
  isSaving = signal(false);
  isCustomerSelectModalOpen = signal(false);

  recipes = this.recipeState.recipesWithStockStatus;

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

  handleCustomerSelected(customer: Customer) {
    this.selectedCustomer.set(customer);
    this.isCustomerSelectModalOpen.set(false);
  }

  removeCustomer() {
    this.selectedCustomer.set(null);
  }

  async saveOrder() {
    if (this.cart().length === 0) {
      this.notificationService.show('O carrinho está vazio.', 'warning');
      return;
    }
    this.isSaving.set(true);

    const { success, error } = await this.deliveryDataService.createExternalDeliveryOrder(
      this.cart(),
      this.selectedCustomer()?.id || null,
      this.paymentMethod
    );

    this.isSaving.set(false);
    if (success) {
      this.notificationService.show('Pedido de delivery criado com sucesso!', 'success');
      this.closeModal.emit();
    } else {
      this.notificationService.show(`Erro ao criar pedido: ${error?.message}`, 'error');
    }
  }
}