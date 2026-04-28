
import { Component, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CartService } from '../../../services/cart.service';

@Component({
  selector: 'app-menu-cart',
  imports: [CommonModule],
  template: `
    <div class="fixed inset-0 z-30 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300">
      <div class="bg-surface w-full max-w-lg sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden transform transition-all duration-300 translate-y-0">
        
        <!-- Header -->
        <div class="px-6 py-4 border-b border-subtle flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3">
            <span class="material-symbols-outlined text-muted">shopping_cart</span>
            <h2 class="text-xl font-bold text-title">Seu Carrinho</h2>
            <span class="px-2 py-0.5 bg-surface-elevated text-muted rounded-lg text-sm font-bold">{{ cart.totalItems() }}</span>
          </div>
          <button (click)="close.emit()" class="p-2 hover:bg-surface-elevated rounded-full transition-colors text-muted hover:text-title">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <!-- Items -->
        <div class="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          @if (cart.items().length === 0) {
            <div class="h-64 flex flex-col items-center justify-center text-center space-y-4">
              <div class="w-16 h-16 bg-surface-elevated rounded-full flex items-center justify-center text-muted">
                <span class="material-symbols-outlined !text-4xl">shopping_cart</span>
              </div>
              <div>
                <p class="font-bold text-title">Carrinho vazio</p>
                <p class="text-sm text-muted">Adicione itens para começar</p>
              </div>
              <button (click)="close.emit()" class="px-6 py-2 bg-brand text-on-brand rounded-xl font-bold text-sm hover:opacity-90">Explorar Cardápio</button>
            </div>
          } @else {
            @for (item of cart.items(); track item.id) {
              <div class="p-4 bg-surface-elevated/50 rounded-2xl border border-subtle group transition-all duration-300">
                <div class="flex gap-4">
                  <!-- Item Info -->
                  <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-start gap-2">
                      <h4 class="font-bold text-title truncate">{{ item.recipe.name }}</h4>
                      <button (click)="cart.removeFromCart(item.id)" class="text-muted hover:text-danger transition-colors">
                        <span class="material-symbols-outlined !text-lg">delete_outline</span>
                      </button>
                    </div>
                    
                    @if (item.options && item.options.length > 0) {
                      <div class="mt-1 flex flex-wrap gap-1">
                        @for (opt of item.options; track opt.id) {
                          <span class="text-[10px] bg-surface border border-subtle text-muted px-1.5 py-0.5 rounded-md font-medium capitalize">
                            + {{ opt.name }}
                          </span>
                        }
                      </div>
                    }

                    @if (item.notes) {
                      <p class="mt-2 text-xs text-muted bg-surface p-2 rounded-lg border border-dashed border-strong">
                        <span class="font-bold text-muted">Obs:</span> {{ item.notes }}
                      </p>
                    }

                    <div class="mt-4 flex items-center justify-between">
                      <div class="flex items-center gap-1 bg-surface border border-strong rounded-xl p-1 shadow-sm">
                        <button (click)="cart.updateQuantity(item.id, item.quantity - 1)" 
                                class="w-8 h-8 flex items-center justify-center text-muted hover:text-title hover:bg-surface-elevated rounded-lg transition-all">
                          <span class="material-symbols-outlined !text-sm font-bold">remove</span>
                        </button>
                        <span class="w-8 text-center font-bold text-title">{{ item.quantity }}</span>
                        <button (click)="cart.updateQuantity(item.id, item.quantity + 1)" 
                                class="w-8 h-8 flex items-center justify-center text-muted hover:text-title hover:bg-surface-elevated rounded-lg transition-all">
                          <span class="material-symbols-outlined !text-sm font-bold">add</span>
                        </button>
                      </div>
                      <span class="font-bold text-title leading-none">
                        {{ (item.effectivePrice * item.quantity) | currency : 'BRL' }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            }
          }
        </div>

        <!-- Summary -->
        @if (cart.items().length > 0) {
          <div class="p-6 bg-surface border-t border-subtle space-y-4 shrink-0">
            <div class="flex items-center justify-between text-muted">
              <span>Subtotal</span>
              <span class="font-medium text-title">{{ cart.subtotal() | currency : 'BRL' }}</span>
            </div>
            <button (click)="checkout.emit()" 
                    class="w-full py-4 px-6 bg-brand hover:opacity-90 text-on-brand rounded-2xl font-bold flex items-center justify-center gap-3 transition-all duration-300 active:scale-[0.98] shadow-xl">
              <span class="material-symbols-outlined">check_circle</span>
              Finalizar Pedido
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
  close = output<void>();
  checkout = output<void>();
}
