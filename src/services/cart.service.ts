import { Injectable, signal, computed } from '@angular/core';
import { Recipe } from '../models/db.models';

export interface CartItem {
  recipe: Recipe;
  quantity: number;
  notes?: string;
  effectivePrice: number;
}

@Injectable({
  providedIn: 'root',
})
export class CartService {
  items = signal<CartItem[]>([]);

  totalItems = computed(() => this.items().reduce((acc, item) => acc + item.quantity, 0));
  
  subtotal = computed(() => this.items().reduce((acc, item) => acc + (item.effectivePrice * item.quantity), 0));

  addToCart(recipe: Recipe, effectivePrice: number) {
    this.items.update(items => {
      const existingItem = items.find(i => i.recipe.id === recipe.id);
      if (existingItem) {
        return items.map(i => i.recipe.id === recipe.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...items, { recipe, quantity: 1, effectivePrice }];
    });
  }

  removeFromCart(recipeId: string) {
    this.items.update(items => items.filter(i => i.recipe.id !== recipeId));
  }

  updateQuantity(recipeId: string, quantity: number) {
    if (quantity <= 0) {
      this.removeFromCart(recipeId);
      return;
    }
    this.items.update(items => items.map(i => i.recipe.id === recipeId ? { ...i, quantity } : i));
  }

  clearCart() {
    this.items.set([]);
  }
}
