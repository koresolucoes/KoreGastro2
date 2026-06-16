import { Component, ChangeDetectionStrategy, inject, OnInit, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { PublicDataService } from '../../services/public-data.service';
import { supabase } from '../../services/supabase-client';
import { Order, OrderItem } from '../../models/db.models';

@Component({
  selector: 'app-public-table-order',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './public-table-order.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicTableOrderComponent implements OnInit, OnDestroy {
  route = inject(ActivatedRoute);
  publicDataService = inject(PublicDataService);

  order = signal<Order | null>(null);
  loading = signal(true);
  errorMsg = signal<string | null>(null);
  sessionToken = signal<string | null>(null);
  waiterCalled = signal(false);

  // Tabs
  activeTab = signal<'COMANDA' | 'CARDAPIO'>('COMANDA');

  // Menu Data
  menuCategories = signal<any[]>([]);
  menuRecipes = signal<any[]>([]);
  activeCategoryId = signal<string | null>(null);

  // Cart Data for Self-Service
  cartItems = signal<any[]>([]);
  cartLoading = signal(false);

  // Realtime channel
  private channel: any;

  async ngOnInit() {
    this.sessionToken.set(this.route.snapshot.paramMap.get('sessionToken'));
    if (!this.sessionToken()) {
      this.errorMsg.set('Sessão inválida ou não encontrada.');
      this.loading.set(false);
      return;
    }
    await this.loadOrder();
    this.setupRealtimeSync();
  }

  ngOnDestroy() {
    if (this.channel) {
      supabase.removeChannel(this.channel);
    }
  }

  async loadOrder() {
    this.loading.set(true);
    const { order, error } = await this.publicDataService.getOrderBySessionToken(this.sessionToken()!);
    if (error || !order) {
      this.errorMsg.set('Comanda fechada ou inválida. Por favor, solicite um novo QR Code.');
    } else {
      this.order.set(order);
      // Once we have the order, we have the user_id to load the menu
      if (this.menuCategories().length === 0) {
          await this.loadMenu(order.user_id);
      }
    }
    this.loading.set(false);
  }

  async loadMenu(userId: string) {
      const menuData = await this.publicDataService.getPublicVirtualMenu(userId);
      if (menuData) {
          this.menuCategories.set(menuData.categories);
          this.menuRecipes.set(menuData.recipes);
          if (menuData.categories.length > 0) {
              this.activeCategoryId.set(menuData.categories[0].id);
          }
      }
  }

  getRecipesForCategory(catId: string) {
     return this.menuRecipes().filter(r => r.category_id === catId);
  }

  // Cart Note Modal
  selectedRecipeForCart: any | null = null;
  recipeNoteStr = signal('');
  
  addToCart(recipe: any) {
    this.selectedRecipeForCart = recipe;
    this.recipeNoteStr.set('');
  }

  cancelAddToCart() {
    this.selectedRecipeForCart = null;
    this.recipeNoteStr.set('');
  }

  confirmAddToCart() {
    if (!this.selectedRecipeForCart) return;
    
    const recipe = this.selectedRecipeForCart;
    const note = this.recipeNoteStr().trim();

    this.cartItems.update(items => {
        const extData = [...items];
        // If an item with same recipe and same note exists, increment qty
        const existing = extData.find(i => i.recipe.id === recipe.id && i.notes === note);
        if (existing) {
            existing.quantity++;
        } else {
            extData.push({ recipe, quantity: 1, notes: note });
        }
        return extData;
    });

    this.selectedRecipeForCart = null;
    this.recipeNoteStr.set('');
  }

  updateCartQty(item: any, delta: number) {
     this.cartItems.update(items => {
         let extData = [...items];
         const existing = extData.find(i => i.recipe.id === item.recipe.id);
         if (existing) {
             existing.quantity += delta;
             if (existing.quantity <= 0) {
                 extData = extData.filter(i => i.recipe.id !== item.recipe.id);
             }
         }
         return extData;
     });
  }

  get cartTotalAmount(): number {
     return this.cartItems().reduce((acc, item) => acc + (item.recipe.sale_price * item.quantity), 0);
  }

  async submitCart() {
     const items = this.cartItems();
     const o = this.order();
     if (items.length === 0 || !o) return;

     this.cartLoading.set(true);

     // Insert all cart items into order_items
     // We need to insert directly into order_items matching the order_id
     // To do this we might need an rpc or direct insert if RLS allows
     const orderItemsPayload = items.map(item => ({
        order_id: o.id,
        recipe_id: item.recipe.id,
        quantity: item.quantity,
        sale_price: item.recipe.sale_price,
        total_price: item.recipe.sale_price * item.quantity,
        notes: item.notes,
        status: 'PENDENTE',
        user_id: o.user_id
     }));

     const { error } = await supabase.from('order_items').insert(orderItemsPayload);

     if (error) {
         this.errorMsg.set('Erro ao enviar pedido: ' + error.message);
         setTimeout(() => this.errorMsg.set(null), 5000);
     } else {
         this.cartItems.set([]); // clear cart
         this.activeTab.set('COMANDA'); // go back to comanda view to see new items
         await this.loadOrder(); // reload to show new items (although realtime might catch it)
         
         this.showToast("Pedido enviado para a cozinha com sucesso!");
     }
     
     this.cartLoading.set(false);
  }

  setupRealtimeSync() {
     // We can try to listen to updates for this order if the user has read access
     // But wait, Realtime requires RLS read access. 
     // We have Permitir leitura pública de pedidos e order_items, so maybe it works!
     const token = this.sessionToken();
     if (!token) return;

     this.channel = supabase.channel('public-order-' + token)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `session_token=eq.${token}` }, payload => {
          this.loadOrder();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, payload => {
          // Since we can't easily filter by order_id because we don't know it until loaded, we just reload on any item change 
          // that matches our order_id once loaded, but it's simpler to just reload on ANY item change if it matches our order.id
          if (this.order() && (payload.new as any).order_id === this.order()?.id) {
             this.loadOrder();
          }
      })
      .subscribe();
  }

  get totalItems(): number {
    const o = this.order();
    if (!o) return 0;
    return o.order_items.reduce((acc, item) => acc + item.quantity, 0);
  }

  get totalAmount(): number {
    const o = this.order();
    if (!o) return 0;
    return o.order_items.reduce((acc, item) => acc + item.total_price, 0);
  }

  private showToast(message: string, isError = false) {
    const toastDiv = document.createElement('div');
    toastDiv.className = `${isError ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'} fixed top-4 left-4 right-4 z-[300] p-4 rounded-2xl shadow-xl flex items-center justify-center font-bold animate-in slide-in-from-top text-center`;
    toastDiv.innerHTML = `<span class="material-symbols-outlined mr-2">${isError ? 'error' : 'check_circle'}</span> ${message}`;
    document.body.appendChild(toastDiv);
    setTimeout(() => toastDiv.remove(), 4000);
  }

  async onCallWaiter() {
    if(this.waiterCalled()) return;
    const o = this.order();
    if (!o || !this.sessionToken()) return;
    
    // Calls the RPC we just defined
    const { error: rpcError } = await supabase.rpc('public_call_waiter', { p_session_token: this.sessionToken() });
    
    if (!rpcError) {
       this.waiterCalled.set(true);
       setTimeout(() => this.waiterCalled.set(false), 30000); // Reset after 30s
       this.showToast("Garçom chamado!");
    } else {
       this.showToast("Erro ao chamar garçom: " + rpcError.message, true);
    }
  }

  // Checkout Modal
  showCheckoutModal = signal(false);
  checkoutMethod = signal<'PIX' | 'WAITER' | null>(null);

  async onRequestBillClick() {
     this.showCheckoutModal.set(true);
     this.checkoutMethod.set(null);
  }

  async closeCheckoutModal() {
     this.showCheckoutModal.set(false);
  }

  async confirmCheckout() {
    const o = this.order();
    if (!o || !this.sessionToken()) return;
    
    // Calls the RPC we just defined
    const { error: rpcError } = await supabase.rpc('public_request_bill', { p_session_token: this.sessionToken() });
    
    if (!rpcError) {
       this.showCheckoutModal.set(false);
       if (this.checkoutMethod() === 'PIX') {
           this.showToast("Pagamento via PIX iniciado! O sistema confirmará automaticamente (Simulação).");
       } else {
           this.showToast("A conta foi solicitada e em breve iremos até a mesa!");
       }
    } else {
       this.showToast("Erro: " + rpcError.message, true);
    }
  }
}
