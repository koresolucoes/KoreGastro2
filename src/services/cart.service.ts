import { Injectable, signal, computed } from '@angular/core';
import { Recipe, IfoodOption } from '../models/db.models';

export interface CartItem {
  id: string; // Unique ID for each cart entry
  recipe: Recipe;
  quantity: number;
  notes?: string;
  effectivePrice: number; // Base price + options price
  options?: IfoodOption[];
}

@Injectable({
  providedIn: 'root',
})
export class CartService {
  items = signal<CartItem[]>([]);

  totalItems = computed(() => this.items().reduce((acc, item) => acc + item.quantity, 0));
  
  subtotal = computed(() => this.items().reduce((acc, item) => acc + (item.effectivePrice * item.quantity), 0));

  addToCart(recipe: Recipe, effectivePrice: number, options: IfoodOption[] = [], notes: string = '') {
    this.items.update(items => {
      // Check for item with same recipe and SAME options
      const existingItem = items.find(i => 
        i.recipe.id === recipe.id && 
        this.areOptionsEqual(i.options || [], options) &&
        i.notes === notes
      );

      if (existingItem) {
        return items.map(i => i.id === existingItem.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      
      const newItem: CartItem = {
        id: Math.random().toString(36).substring(2),
        recipe,
        quantity: 1,
        effectivePrice,
        options,
        notes
      };
      return [...items, newItem];
    });
  }

  private areOptionsEqual(a: IfoodOption[], b: IfoodOption[]): boolean {
    if (a.length !== b.length) return false;
    const aIds = a.map(o => o.id).sort();
    const bIds = b.map(o => o.id).sort();
    return aIds.every((id, index) => id === bIds[index]);
  }

  removeFromCart(itemId: string) {
    this.items.update(items => items.filter(i => i.id !== itemId));
  }

  updateQuantity(itemId: string, quantity: number) {
    if (quantity <= 0) {
      this.removeFromCart(itemId);
      return;
    }
    this.items.update(items => items.map(i => i.id === itemId ? { ...i, quantity } : i));
  }

  clearCart() {
    this.items.set([]);
  }
}
