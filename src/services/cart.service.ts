import { Injectable, signal, computed } from '@angular/core';
import { Recipe } from '../models/db.models';

import { Modifier } from '../models/db.models';

export interface CartItem {
  recipe: Recipe;
  quantity: number;
  notes?: string;
  effectivePrice: number;
  selectedModifiers: Modifier[];
}

@Injectable({
  providedIn: 'root',
})
export class CartService {
  items = signal<CartItem[]>([]);

  totalItems = computed(() => this.items().reduce((acc, item) => acc + item.quantity, 0));
  
  subtotal = computed(() => this.items().reduce((acc, item) => {
    const modifiersTotal = item.selectedModifiers.reduce((sum, mod) => sum + Number(mod.extra_price), 0);
    return acc + ((item.effectivePrice + modifiersTotal) * item.quantity);
  }, 0));

  addToCart(recipe: Recipe, effectivePrice: number, selectedModifiers: Modifier[] = [], notes: string = '') {
    this.items.update(items => {
      // Check if item with same recipe and SAME modifiers already exists
      const existingItemIndex = items.findIndex(i => 
        i.recipe.id === recipe.id && 
        JSON.stringify(i.selectedModifiers.map(m => m.id).sort()) === JSON.stringify(selectedModifiers.map(m => m.id).sort()) &&
        i.notes === notes
      );

      if (existingItemIndex !== -1) {
        const newItems = [...items];
        newItems[existingItemIndex] = { 
          ...newItems[existingItemIndex], 
          quantity: newItems[existingItemIndex].quantity + 1 
        };
        return newItems;
      }
      return [...items, { recipe, quantity: 1, effectivePrice, selectedModifiers, notes }];
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
