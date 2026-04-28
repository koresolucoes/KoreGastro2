
import { Component, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CartService } from '../../../services/cart.service';

@Component({
  selector: 'app-menu-checkout',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300">
      <div class="bg-surface w-full max-w-lg sm:rounded-3xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden transform transition-all duration-300 translate-y-0">
        
        <!-- Header -->
        <div class="px-8 py-6 border-b border-subtle flex items-center justify-between bg-surface-elevated shrink-0">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 bg-brand text-on-brand rounded-xl flex items-center justify-center shadow-lg shadow-brand/20">
              <span class="material-symbols-outlined !text-xl">send</span>
            </div>
            <div>
              <h2 class="text-xl font-bold text-title">Finalizar Pedido</h2>
              <p class="text-xs text-muted font-medium">Preencha seus dados para entrega</p>
            </div>
          </div>
          <button (click)="close.emit()" class="p-2 hover:bg-surface hover:shadow-sm rounded-full transition-all text-muted hover:text-title border border-transparent hover:border-strong">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <!-- Form Items -->
        <div class="flex-1 overflow-y-auto p-8 space-y-8">
          
          <!-- Order Type Selection -->
          <div class="grid grid-cols-2 gap-4">
            <button (click)="type.set('delivery')" 
                    [class]="type() === 'delivery' ? 'bg-brand text-on-brand shadow-xl shadow-brand/20' : 'bg-surface-elevated text-muted border-2 border-subtle hover:border-strong'"
                    class="p-4 rounded-2xl font-bold transition-all duration-300 flex flex-col items-center gap-2">
              <span class="material-symbols-outlined" [class]="type() === 'delivery' ? 'text-on-brand' : 'text-muted'">delivery_dining</span>
              <span>Entrega</span>
            </button>
            <button (click)="type.set('pickup')" 
                    [class]="type() === 'pickup' ? 'bg-brand text-on-brand shadow-xl shadow-brand/20' : 'bg-surface-elevated text-muted border-2 border-subtle hover:border-strong'"
                    class="p-4 rounded-2xl font-bold transition-all duration-300 flex flex-col items-center gap-2">
              <span class="material-symbols-outlined" [class]="type() === 'pickup' ? 'text-on-brand' : 'text-muted'">storefront</span>
              <span>Retirada</span>
            </button>
          </div>

          <!-- Customer Info -->
          <div class="space-y-6">
            <div class="space-y-2">
              <label class="text-sm font-bold text-body ml-1">Seu Nome</label>
              <div class="relative">
                <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 !text-xl text-muted">person</span>
                <input type="text" [(ngModel)]="name" 
                       placeholder="Como devemos te chamar?"
                       class="w-full pl-12 pr-4 py-4 bg-surface-elevated border-2 border-transparent focus:border-strong focus:bg-surface rounded-2xl outline-none transition-all text-title font-medium tracking-tight">
              </div>
            </div>

            <div class="space-y-2">
              <label class="text-sm font-bold text-body ml-1">WhatsApp</label>
              <div class="relative">
                <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 !text-xl text-muted">phone</span>
                <input type="tel" [(ngModel)]="phone"
                       placeholder="(00) 00000-0000"
                       class="w-full pl-12 pr-4 py-4 bg-surface-elevated border-2 border-transparent focus:border-strong focus:bg-surface rounded-2xl outline-none transition-all text-title font-medium tracking-tight">
              </div>
            </div>

            @if (type() === 'delivery') {
              <div class="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <label class="text-sm font-bold text-body ml-1">Endereço de Entrega</label>
                <div class="relative">
                  <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 !text-xl text-muted">location_on</span>
                  <textarea [(ngModel)]="address"
                            placeholder="Rua, número, bairro, cidade..."
                            class="w-full pl-12 pr-4 py-4 bg-surface-elevated border-2 border-transparent focus:border-strong focus:bg-surface rounded-2xl outline-none transition-all text-title font-medium tracking-tight min-h-[100px] resize-none"></textarea>
                </div>
              </div>
            }
          </div>

          <!-- Final Summary -->
          <div class="p-6 bg-surface-elevated rounded-3xl space-y-3">
             <div class="flex justify-between text-muted text-sm font-medium">
               <span>Itens ({{ cart.totalItems() }})</span>
               <span>{{ cart.subtotal() | currency : 'BRL' }}</span>
             </div>
             @if (type() === 'delivery') {
               <div class="flex justify-between text-muted text-sm font-medium">
                 <span>Taxa de Entrega</span>
                 <span class="text-muted text-xs italic">A calcular</span>
               </div>
             }
             <div class="pt-3 border-t border-strong flex justify-between items-center">
               <span class="text-lg font-bold text-title">Total</span>
               <span class="text-2xl font-black text-brand">{{ cart.subtotal() | currency : 'BRL' }}</span>
             </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="p-8 bg-surface border-t border-subtle shrink-0">
          <button (click)="onSubmit()"
                  [disabled]="!isValid()"
                  class="w-full py-5 px-8 bg-brand disabled:opacity-50 text-on-brand rounded-2xl font-black text-lg flex items-center justify-center gap-4 transition-all duration-300 enabled:hover:opacity-90 enabled:active:scale-[0.98] shadow-2xl">
            {{ isValid() ? 'Confirmar Pedido' : 'Preencha todos os campos' }}
            <span class="material-symbols-outlined !text-xl">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: contents; }
  `]
})
export class MenuCheckoutComponent {
  cart = inject(CartService);
  close = output<void>();
  submit = output<any>();

  type = signal<'delivery' | 'pickup'>('delivery');
  name = '';
  phone = '';
  address = '';

  isValid(): boolean {
    const basic = this.name.length > 2 && this.phone.length >= 8;
    if (this.type() === 'delivery') return basic && this.address.length > 5;
    return basic;
  }

  onSubmit() {
    if (this.isValid()) {
      this.submit.emit({
        type: this.type(),
        name: this.name,
        phone: this.phone,
        address: this.address
      });
    }
  }
}
