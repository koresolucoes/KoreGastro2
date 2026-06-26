import { Component, ChangeDetectionStrategy, inject, OnInit, signal, OnDestroy, computed, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { PublicDataService } from '../../services/public-data.service';
import { supabase } from '../../services/supabase-client';
import { Order, OrderItem } from '../../models/db.models';
import { v4 as uuidv4 } from 'uuid';

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

  // Checkout & Split Bill State
  showCheckoutModal = signal(false);
  checkoutMethod = signal<'PIX' | 'WAITER' | null>(null);
  checkoutStep = signal<'METHOD' | 'SPLIT' | 'PAYING'>('METHOD');
  
  splitMode = signal<'total' | 'item'>('total');
  splitCount = signal(1);
  serviceFeeApplied = signal(true);
  
  discountCodeInput = signal('');
  isApplyingDiscount = signal(false);

  itemGroups = signal<{ id: string, name: string, items: any[], total: number, isPaid: boolean, serviceFeeApplied: boolean }[]>([]);
  unassignedItems = signal<any[]>([]);
  selectedGroupId = signal<string | null>(null);

  Math = Math;

  constructor() {
    effect(() => {
      const ord = this.order();
      if (this.splitMode() === 'item' && ord) {
        if (this.itemGroups().length === 0 && this.unassignedItems().length === 0) {
            this.itemGroups.set([]);
            this.unassignedItems.set([...(ord.order_items || [])]);
            this.selectedGroupId.set(null);
        }
      }
    });
  }

  // Derived calculations for checkout
  orderSubtotalBeforeDiscount = computed(() => {
     const o = this.order();
     if (!o || !o.order_items) return 0;
     return o.order_items.filter((i: any) => !(i.notes?.includes('[AUX_PREP_IDX:') && !i.notes?.includes('[AUX_PREP_IDX:0]'))).reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
  });

  globalDiscountAmount = computed(() => {
    const order = this.order();
    if (!order || !order.discount_type || !order.discount_value) return 0;
    if (order.discount_type === 'percentage') {
      return this.orderSubtotalBeforeDiscount() * (order.discount_value / 100);
    }
    return order.discount_value;
  });

  orderSubtotal = computed(() => this.orderSubtotalBeforeDiscount() - this.globalDiscountAmount());
  tipAmount = computed(() => this.serviceFeeApplied() ? this.orderSubtotal() * 0.1 : 0);
  orderTotal = computed(() => this.orderSubtotal() + this.tipAmount());

  splitTotalPerPerson = computed(() => {
      if (this.splitMode() === 'total') {
          const total = this.orderTotal();
          const count = this.splitCount();
          if (!total || count <= 0) return 0;
          return total / count;
      } else {
          const groupId = this.selectedGroupId();
          if (!groupId) return 0;
          const group = this.itemGroups().find(g => g.id === groupId);
          if (!group) return 0;
          return group.total + (group.serviceFeeApplied ? group.total * 0.1 : 0);
      }
  });

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
     return this.cartItems().reduce((acc, item) => acc + (Number(item.recipe.price || 0) * item.quantity), 0);
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
        name: item.recipe.name,
        quantity: item.quantity,
        price: item.recipe.price,
        original_price: item.recipe.price,
        notes: item.notes,
        status: 'PENDENTE',
        user_id: o.user_id
     }));

     // We use the public-order endpoint to bypass RLS restrictions securely
     const response = await fetch('/api/public-order', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ insertItems: orderItemsPayload })
     });

     const resData = await response.json();

     if (!response.ok) {
         this.errorMsg.set('Erro ao enviar pedido: ' + (resData.error || 'Falha no servidor'));
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
          const targetOrderId = (payload.new as any)?.order_id || (payload.old as any)?.order_id;
          if (this.order() && targetOrderId === this.order()?.id) {
             this.loadOrder();
          }
      })
      .subscribe();
  }

  get totalItems(): number {
    const o = this.order();
    if (!o || !o.order_items) return 0;
    return o.order_items.reduce((acc, item) => acc + item.quantity, 0);
  }

  get totalAmount(): number {
    const o = this.order();
    if (!o || !o.order_items) return 0;
    return o.order_items.reduce((acc: number, item: any) => acc + (Number(item.price || 0) * item.quantity), 0);
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
  async onRequestBillClick() {
     const o = this.order();
     if (o && o.order_items) {
         this.unassignedItems.set([...o.order_items]);
         this.itemGroups.set([]);
         this.selectedGroupId.set(null);
     }
     this.showCheckoutModal.set(true);
     this.checkoutStep.set('METHOD');
     this.checkoutMethod.set(null);
  }

  closeCheckoutModal() {
     this.showCheckoutModal.set(false);
  }

  goToSplitStep() {
     if (this.checkoutMethod() === 'PIX') {
        this.checkoutStep.set('SPLIT');
     } else {
        this.confirmCheckout(); // If Waiter, just confirm directly
     }
  }

  goToPaymentStep() {
     if (this.splitMode() === 'item') {
         if (!this.selectedGroupId()) {
             this.showToast("Selecione um grupo para pagar", true);
             return;
         }
         const group = this.itemGroups().find(g => g.id === this.selectedGroupId());
         if (!group || group.items.length === 0) {
             this.showToast("Adicione itens ao grupo para pagar", true);
             return;
         }
     }
     this.checkoutStep.set('PAYING');
  }

  async applyDiscountCode() {
      const code = this.discountCodeInput().trim().toUpperCase();
      if (!code) return;
      
      this.isApplyingDiscount.set(true);
      
      // Simulate simple discount checking logic for public code
      // We can use a 10% discount for 'KORE10'
      if (code === 'KORE10') {
          const o = this.order();
          if (o) {
              await fetch('/api/public-order', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                      orderId: o.id, 
                      updates: { action: 'APPLY_DISCOUNT', discountType: 'percentage', discountValue: 10 } 
                  })
              });
              this.showToast("Desconto aplicado!");
              this.loadOrder();
          }
      } else {
          this.showToast("Código inválido", true);
      }
      this.isApplyingDiscount.set(false);
  }

  addGroup() {
    const newGroup = {
      id: uuidv4(),
      name: `Minha Parte`,
      items: [],
      total: 0,
      isPaid: false,
      serviceFeeApplied: true
    };
    this.itemGroups.update(groups => [...groups, newGroup]);
    this.selectedGroupId.set(newGroup.id);
  }

  selectGroup(groupId: string) {
    this.selectedGroupId.set(groupId);
  }

  assignItemToGroup(item: any) {
     const groupId = this.selectedGroupId();
     if (!groupId) {
         if (this.itemGroups().length === 0) this.addGroup();
         else return;
     }
     const targetId = groupId || this.selectedGroupId();
     if(!targetId) return;

     this.unassignedItems.update(items => items.filter(i => i.id !== item.id));
     this.itemGroups.update(groups => groups.map(g => {
         if (g.id === targetId) {
             const newItems = [...g.items, item];
             const newTotal = newItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
             return { ...g, items: newItems, total: newTotal };
         }
         return g;
     }));
  }

  moveItemToUnassigned(item: any, fromGroupId: string) {
      this.itemGroups.update(groups => groups.map(g => {
          if (g.id === fromGroupId) {
              const newItems = g.items.filter(i => i.id !== item.id);
              const newTotal = newItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
              return { ...g, items: newItems, total: newTotal };
          }
          return g;
      }));
      this.unassignedItems.update(items => [...items, item]);
  }

  toggleServiceFee() {
    if (this.splitMode() === 'item') {
      const groupId = this.selectedGroupId();
      if (!groupId) return;
      this.itemGroups.update(groups =>
        groups.map(g =>
          g.id === groupId ? { ...g, serviceFeeApplied: !g.serviceFeeApplied } : g
        )
      );
    } else {
      this.serviceFeeApplied.update(v => !v);
    }
  }

  async confirmCheckout() {
    const o = this.order();
    if (!o || !this.sessionToken()) return;
    
    if (this.checkoutMethod() === 'PIX') {
         // Finalize payment logic 
         const amount = this.splitTotalPerPerson();
         const payment = { method: 'PIX', amount: amount };
         
         const res = await fetch('/api/public-order', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ 
                 orderId: o.id, 
                 updates: { 
                     action: 'FINALIZE',
                     payments: [payment],
                     tipAmount: this.tipAmount(),
                     total: amount
                 } 
             })
         });
         
         if (res.ok) {
             this.showToast("Pagamento via PIX confirmado!");
             this.showCheckoutModal.set(false);
             this.loadOrder();
         } else {
             this.showToast("Erro ao processar pagamento", true);
         }
    } else {
        const { error: rpcError } = await supabase.rpc('public_request_bill', { p_session_token: this.sessionToken() });
        if (!rpcError) {
           this.showCheckoutModal.set(false);
           this.showToast("A conta foi solicitada e em breve iremos até a mesa!");
        } else {
           this.showToast("Erro: " + rpcError.message, true);
        }
    }
  }
}
