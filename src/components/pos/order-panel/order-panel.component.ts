




import { Component, ChangeDetectionStrategy, inject, signal, computed, WritableSignal, effect, untracked, input, output, InputSignal, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Table, Order, Recipe, Category, OrderItemStatus, OrderItem, Employee } from '../../../models/db.models';
import { v4 as uuidv4 } from 'uuid';
import { PricingService } from '../../../services/pricing.service';
import { SupabaseStateService } from '../../../services/supabase-state.service';
import { PosDataService } from '../../../services/pos-data.service';
import { NotificationService } from '../../../services/notification.service';

interface CartItem {
    id: string;
    recipe: Recipe;
    quantity: number;
    notes: string;
}

interface GroupedOrderItem {
  isGroup: true;
  groupId: string;
  recipeName: string;
  recipeId: string;
  quantity: number;
  totalPrice: number;
  items: OrderItem[];
}

interface SingleOrderItem {
  isGroup: false;
  item: OrderItem;
}

type DisplayOrderItem = GroupedOrderItem | SingleOrderItem;

@Component({
  selector: 'app-order-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './order-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderPanelComponent {
  stateService = inject(SupabaseStateService);
  posDataService = inject(PosDataService);
  pricingService = inject(PricingService);
  notificationService = inject(NotificationService);

  // Inputs & Outputs
  selectedTable: InputSignal<Table | null> = input.required<Table | null>();
  currentOrder: InputSignal<Order | null> = input.required<Order | null>();
  orderError: InputSignal<string | null> = input.required<string | null>();
  activeEmployee: InputSignal<Employee | null> = input.required<Employee | null>();

  closePanel: OutputEmitterRef<void> = output<void>();
  checkoutStarted: OutputEmitterRef<void> = output<void>();
  moveOrderClicked: OutputEmitterRef<void> = output<void>();
  releaseTable: OutputEmitterRef<void> = output<void>();
  customerCountChanged: OutputEmitterRef<number> = output<number>();

  // Component State
  shoppingCart = signal<CartItem[]>([]);
  categories = this.stateService.categories;
  recipes = this.stateService.recipesWithStockStatus;
  selectedCategory: WritableSignal<Category | null> = signal(null);
  recipeSearchTerm = signal('');

  // Notes Modal Signals
  isNotesModalOpen = signal(false);
  editingCartItemId = signal<string | null>(null);
  noteInput = signal('');

  criticalKeywords = ['alergia', 'sem glúten', 'sem lactose', 'celíaco', 'nozes', 'amendoim', 'vegetariano', 'vegano'];

  recipePrices = computed(() => {
    const priceMap = new Map<string, number>();
    for (const recipe of this.recipes()) {
      priceMap.set(recipe.id, this.pricingService.getEffectivePrice(recipe));
    }
    return priceMap;
  });

  constructor() {
    effect(() => {
      this.selectedTable();
      untracked(() => this.shoppingCart.set([]));
    });
  }

  isItemCritical(item: OrderItem): boolean {
    const note = item.notes?.toLowerCase() ?? '';
    if (!note) return false;
    return this.criticalKeywords.some(keyword => note.includes(keyword));
  }
  
  isAttentionAcknowledged(item: OrderItem): boolean {
    return !!item.status_timestamps?.['ATTENTION_ACKNOWLEDGED'];
  }

  filteredRecipes = computed(() => {
      const category = this.selectedCategory();
      const term = this.recipeSearchTerm().toLowerCase();
      let recipesToShow = this.recipes();
      if (category) recipesToShow = recipesToShow.filter(r => r.category_id === category.id);
      if (term) recipesToShow = recipesToShow.filter(r => r.name.toLowerCase().includes(term));
      return recipesToShow;
  });
  
  groupedOrderItems = computed(() => {
    const order = this.currentOrder();
    if (!order) return [];

    const items = order.order_items;
    const grouped = new Map<string, GroupedOrderItem>();
    const singles: SingleOrderItem[] = [];
    const recipesMap = this.stateService.recipesById();

    for (const item of items) {
      if (item.group_id) {
        if (!grouped.has(item.group_id)) {
          const recipe = recipesMap.get(item.recipe_id);
          grouped.set(item.group_id, {
            isGroup: true, groupId: item.group_id, recipeName: recipe?.name ?? 'Prato Desconhecido',
            recipeId: item.recipe_id, quantity: item.quantity, totalPrice: item.price, items: [],
          });
        }
        grouped.get(item.group_id)!.items.push(item);
      } else {
        singles.push({ isGroup: false, item });
      }
    }
    return [...Array.from(grouped.values()), ...singles];
  });
  
  orderTotal = computed(() => {
    const prices = this.recipePrices();
    const currentItemsTotal = this.currentOrder()?.order_items.reduce((sum, item) => sum + item.price, 0) ?? 0;
    const cartItemsTotal = this.shoppingCart().reduce((sum, item) => sum + (prices.get(item.recipe.id)! * item.quantity), 0);
    return currentItemsTotal + cartItemsTotal;
  });

  selectCategory(category: Category | null) { this.selectedCategory.set(category); }
  
  addToCart(recipe: Recipe & { hasStock: boolean }) {
    if (!recipe.is_available || !recipe.hasStock) {
        return;
    }
    this.shoppingCart.update(cart => [...cart, { id: uuidv4(), recipe, quantity: 1, notes: '' }]);
  }

  updateCartItemQuantity(itemId: string, change: -1 | 1) {
    this.shoppingCart.update(cart => cart.map(item => item.id === itemId ? { ...item, quantity: Math.max(0, item.quantity + change) } : item).filter(item => item.quantity > 0));
  }

  removeFromCart(itemId: string) {
      this.shoppingCart.update(cart => cart.filter(i => i.id !== itemId));
  }

  onCustomerCountChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const count = parseInt(input.value, 10);
    if (!isNaN(count) && count >= 0) {
        this.customerCountChanged.emit(count);
    }
  }

  openNotesModal(cartItem: CartItem) {
    this.editingCartItemId.set(cartItem.id);
    this.noteInput.set(cartItem.notes);
    this.isNotesModalOpen.set(true);
  }

  closeNotesModal() {
    this.isNotesModalOpen.set(false);
    this.editingCartItemId.set(null);
    this.noteInput.set('');
  }

  saveNote() {
    const itemId = this.editingCartItemId();
    if (!itemId) return;
    this.shoppingCart.update(cart => cart.map(item => item.id === itemId ? { ...item, notes: this.noteInput().trim() } : item));
    this.closeNotesModal();
  }

  async sendOrder() {
    const order = this.currentOrder(), table = this.selectedTable(), employee = this.activeEmployee(), cart = this.shoppingCart();
    if (order && table && employee && cart.length > 0) {
      const itemsToSend = cart.map(c => ({ recipe: c.recipe, quantity: c.quantity, notes: c.notes }));
      const result = await this.posDataService.addItemsToOrder(order.id, table.id, employee.id, itemsToSend);
      if (result.success) this.shoppingCart.set([]);
      else await this.notificationService.alert(`Falha ao enviar itens. Erro: ${result.error?.message}`);
    }
  }

  async startCheckout() {
    if (this.shoppingCart().length > 0) {
      await this.notificationService.alert('Envie os itens no carrinho antes de fechar a conta.');
      return;
    }
    this.checkoutStarted.emit();
  }

  getOrderItemStatusClass(status: OrderItemStatus): string {
    switch (status) {
      case 'PENDENTE': return 'text-yellow-400';
      case 'EM_PREPARO': return 'text-blue-400';
      case 'PRONTO': return 'text-green-400 font-bold';
      case 'AGUARDANDO': return 'text-gray-400';
      default: return 'text-gray-500';
    }
  }
}