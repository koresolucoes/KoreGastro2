import { Injectable, signal, computed } from '@angular/core';
import { Recipe } from '../models/db.models';

export interface CartItem {
  id: string;
  recipe: Recipe & { effectivePrice: number };
  quantity: number;
  notes?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PublicCartService {
  cartItems = signal<CartItem[]>([]);

  cartTotal = computed(() => {
    return this.cartItems().reduce((total, item) => total + (item.recipe.effectivePrice * item.quantity), 0);
  });

  cartItemCount = computed(() => {
    return this.cartItems().reduce((count, item) => count + item.quantity, 0);
  });

  addToCart(recipe: Recipe & { effectivePrice: number }, quantity: number = 1, notes: string = '') {
    this.cartItems.update(items => {
      const existingItemIndex = items.findIndex(i => i.recipe.id === recipe.id && i.notes === notes);
      
      if (existingItemIndex > -1) {
        const updatedItems = [...items];
        updatedItems[existingItemIndex].quantity += quantity;
        return updatedItems;
      } else {
        return [...items, {
          id: `${recipe.id}-${Date.now()}`,
          recipe,
          quantity,
          notes
        }];
      }
    });
  }

  updateQuantity(itemId: string, newQuantity: number) {
    if (newQuantity <= 0) {
      this.removeFromCart(itemId);
      return;
    }
    
    this.cartItems.update(items => 
      items.map(item => item.id === itemId ? { ...item, quantity: newQuantity } : item)
    );
  }

  removeFromCart(itemId: string) {
    this.cartItems.update(items => items.filter(item => item.id !== itemId));
  }

  clearCart() {
    this.cartItems.set([]);
  }
}
