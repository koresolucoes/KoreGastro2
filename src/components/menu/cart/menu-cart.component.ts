
import { Component, inject, output, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CartService } from '../../../services/cart.service';
import { Recipe } from '../../../models/db.models';

@Component({
  selector: 'app-menu-cart',
  imports: [CommonModule],
  template: `
    <div class="fixed inset-0 z-30 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300">
      <div class="bg-surface w-full max-w-lg sm:rounded-[3rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-500 rounded-t-[2rem]">
        
        <!-- Header -->
        <div class="px-6 py-5 border-b border-subtle flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3">
            <span translate="no" class="notranslate material-symbols-outlined text-brand !text-2xl">shopping_cart</span>
            <h2 class="text-xl font-black text-title tracking-tight">Seu Pedido</h2>
            <span class="px-2 py-0.5 bg-brand/10 text-brand rounded-lg text-sm font-bold">{{ cart.totalItems() }}</span>
          </div>
          <button (click)="close.emit()" class="w-10 h-10 bg-surface-elevated flex items-center justify-center rounded-full transition-colors text-muted hover:text-title">
            <span translate="no" class="notranslate material-symbols-outlined">close</span>
          </button>
        </div>

        <!-- Items -->
        <div class="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-surface-elevated/30">
          @if (cart.items().length === 0) {
            <div class="h-64 flex flex-col items-center justify-center text-center space-y-4">
              <div class="w-20 h-20 bg-surface-elevated rounded-full flex items-center justify-center text-muted">
                <span translate="no" class="notranslate material-symbols-outlined !text-4xl">remove_shopping_cart</span>
              </div>
              <div>
                <p class="font-black text-title text-xl">Carrinho vazio</p>
                <p class="text-sm text-muted mt-1">Adicione itens para começar</p>
              </div>
              <button (click)="close.emit()" class="px-8 py-3 mt-2 bg-brand text-on-brand rounded-2xl font-bold text-sm shadow-xl active:scale-95 transition-all">Explorar Cardápio</button>
            </div>
          } @else {
            @for (item of cart.items(); track item.id) {
              <div class="p-4 bg-surface rounded-2xl border border-subtle shadow-sm group transition-all duration-300">
                <div class="flex gap-4">
                  <!-- Item Info -->
                  <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-start gap-2">
                      <h4 class="font-bold text-title truncate">{{ item.recipe.name }}</h4>
                      <button (click)="cart.removeFromCart(item.id)" class="text-muted hover:text-danger hover:bg-danger/10 w-8 h-8 rounded-full flex items-center justify-center transition-all">
                        <span translate="no" class="notranslate material-symbols-outlined !text-lg">delete_outline</span>
                      </button>
                    </div>
                    
                    @if (item.options && item.options.length > 0) {
                      <div class="mt-1 flex flex-wrap gap-1">
                        @for (opt of item.options; track opt.id) {
                          <span class="text-[10px] bg-surface-elevated border border-subtle text-muted px-2 py-1 rounded-md font-medium uppercase tracking-wider">
                            + {{ opt.name }}
                          </span>
                        }
                      </div>
                    }

                    @if (item.notes) {
                      <p class="mt-2 text-xs text-muted bg-surface-elevated p-2 rounded-lg border border-dashed border-strong">
                        <span class="font-bold">Obs:</span> {{ item.notes }}
                      </p>
                    }

                    <div class="mt-4 flex items-center justify-between">
                      <div class="flex items-center gap-1 bg-surface-elevated border border-strong rounded-xl p-1 shadow-sm">
                        <button (click)="cart.updateQuantity(item.id, item.quantity - 1)" 
                                class="w-8 h-8 flex items-center justify-center text-muted hover:text-title hover:bg-surface rounded-lg transition-all shadow-sm">
                          <span translate="no" class="notranslate material-symbols-outlined !text-sm font-bold">remove</span>
                        </button>
                        <span class="w-8 text-center font-bold text-title">{{ item.quantity }}</span>
                        <button (click)="cart.updateQuantity(item.id, item.quantity + 1)" 
                                class="w-8 h-8 flex items-center justify-center text-muted hover:text-title hover:bg-surface rounded-lg transition-all shadow-sm">
                          <span translate="no" class="notranslate material-symbols-outlined !text-sm font-bold">add</span>
                        </button>
                      </div>
                      <span class="font-black text-title text-lg leading-none">
                        {{ (item.effectivePrice * item.quantity) | currency : 'BRL' }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            }
          }
        </div>

        <!-- Recommendations -->
        @if (recommendations().length > 0) {
          <div class="px-6 py-5 border-t border-b border-subtle shrink-0 overflow-hidden bg-brand/5 relative">
             <div class="absolute inset-0 bg-gradient-to-r from-brand/5 to-transparent pointer-events-none"></div>
             <div class="flex items-center gap-2 mb-4 relative z-10">
                <span translate="no" class="notranslate material-symbols-outlined text-brand !text-xl">auto_awesome</span>
                <h3 class="text-sm font-black text-brand uppercase tracking-widest">Combinam perfeitamente</h3>
             </div>
             <div class="flex gap-4 overflow-x-auto no-scrollbar pb-2 relative z-10 -mx-6 px-6 snap-x">
                @for (rec of recommendations(); track rec.id) {
                  <button (click)="addRecipe.emit(rec)" class="flex-shrink-0 w-36 bg-surface p-2 rounded-2xl shadow-sm border border-brand/20 hover:border-brand hover:shadow-lg transition-all text-left group snap-start relative overflow-hidden">
                     <div class="absolute top-2 right-2 z-10 w-6 h-6 bg-brand text-on-brand rounded-full flex gap-1 justify-center items-center font-bold shadow-md opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all">
                       <span translate="no" class="notranslate material-symbols-outlined !text-sm">add</span>
                     </div>
                     <div class="aspect-square rounded-xl overflow-hidden mb-2 bg-surface-elevated relative">
                        @if (rec.image_url) {
                           <img [src]="rec.image_url" class="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700">
                        } @else {
                           <div class="absolute inset-0 flex items-center justify-center bg-surface-elevated"><span translate="no" class="notranslate material-symbols-outlined text-brand/30 !text-4xl">restaurant</span></div>
                        }
                     </div>
                     <p class="text-xs font-bold leading-tight mb-1 line-clamp-2">{{ rec.name }}</p>
                     <p class="text-xs text-brand font-black">{{ rec.price | currency:'BRL' }}</p>
                  </button>
                }
             </div>
          </div>
        }

        <!-- Summary -->
        @if (cart.items().length > 0) {
          <div class="p-6 bg-surface border-t border-subtle space-y-4 shrink-0 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
            <div class="flex items-center justify-between text-muted">
              <span class="font-bold">Subtotal</span>
              <span class="font-black text-xl text-title">{{ cart.subtotal() | currency : 'BRL' }}</span>
            </div>
            <button (click)="checkout.emit()" 
                    class="w-full py-4 px-6 bg-brand hover:opacity-90 text-on-brand rounded-2xl font-bold flex items-center justify-center gap-3 transition-all duration-300 active:scale-95 shadow-xl text-lg relative overflow-hidden">
              <span class="absolute inset-0 bg-white/20 translate-y-full hover:translate-y-0 transition-transform"></span>
              <span translate="no" class="notranslate material-symbols-outlined relative z-10">send</span>
              <span class="relative z-10">@if (isTableOrder()) { Fazer Pedido } @else { Finalizar Pedido }</span>
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: contents; }
  `]
})
export class MenuCartComponent {
  cart = inject(CartService);
  isTableOrder = input<boolean>(false);
  recipes = input<Recipe[]>([]);
  
  close = output<void>();
  checkout = output<void>();
  addRecipe = output<Recipe>();

  recommendations = computed(() => {
     const all = this.recipes();
     const cartItems = this.cart.items();
     if (cartItems.length === 0 || all.length === 0) return [];
     
     const cartCategoryIds = new Set(cartItems.map(i => i.recipe.category_id));
     
     // 1. Consider all active items
     let pool = all.filter(r => r.is_available);
     
     // 2. Score them
     const scored = pool.map(r => {
        let score = 0;
        
        // If it's already in the cart, it's a good candidate for "one more" (e.g. another beer)
        const inCartCount = cartItems.filter(i => i.recipe.id === r.id).reduce((sum, i) => sum + i.quantity, 0);
        if (inCartCount > 0) {
            score += 15 + inCartCount; // More they bought, higher the chance they want another one
        } else {
            // If they haven't bought this item, but it's from a different category (e.g. snacks if they bought drinks)
            if (!cartCategoryIds.has(r.category_id)) {
                score += 10;
            }
        }
        
        if (r.image_url) score += 5;
        score += Math.random() * 2; // small random factor to rotate
        return { r, score };
     });

     scored.sort((a, b) => b.score - a.score);
     // Filter out duplicates if any, and return top 4
     return scored.slice(0, 4).map(s => s.r);
  });
}
