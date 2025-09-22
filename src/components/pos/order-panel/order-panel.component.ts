import { Component, ChangeDetectionStrategy, inject, signal, computed, WritableSignal, effect, untracked, input, output, InputSignal, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Table, Order, Recipe, Category, OrderItemStatus, OrderItem, Employee, DiscountType, Customer, Ingredient } from '../../../models/db.models';
import { v4 as uuidv4 } from 'uuid';
import { PricingService } from '../../../services/pricing.service';
import { RecipeStateService } from '../../../services/recipe-state.service';
import { InventoryStateService } from '../../../services/inventory-state.service';
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
  hasDiscount: boolean;
  originalTotalPrice: number;
}

interface SingleOrderItem {
  isGroup: false;
  item: OrderItem;
  hasDiscount: boolean;
  originalTotalPrice: number;
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
  recipeState = inject(RecipeStateService);
  inventoryState = inject(InventoryStateService);
  posDataService = inject(PosDataService);
  pricingService = inject(PricingService);
  notificationService = inject(NotificationService);

  // Inputs & Outputs
  selectedTable: InputSignal<Table | null> = input.required<Table | null>();
  currentOrder: InputSignal<Order | null> = input.required<Order | null>();
  orderError: InputSignal<string | null> = input.required<string | null>();
  activeEmployee: InputSignal<(Employee & { role: string }) | null> = input.required<(Employee & { role: string }) | null>();

  closePanel: OutputEmitterRef<void> = output<void>();
  checkoutStarted: OutputEmitterRef<void> = output<void>();
  moveOrderClicked: OutputEmitterRef<void> = output<void>();
  releaseTable: OutputEmitterRef<void> = output<void>();
  customerCountChanged: OutputEmitterRef<number> = output<number>();
  associateCustomerClicked: OutputEmitterRef<void> = output<void>();
  removeCustomerAssociationClicked: OutputEmitterRef<void> = output<void>();
  redeemRewardClicked: OutputEmitterRef<void> = output<void>();

  // Component State
  shoppingCart = signal<CartItem[]>([]);
  categories = this.recipeState.categories;
  recipes = this.recipeState.recipesWithStockStatus;
  selectedCategory: WritableSignal<Category | null> = signal(null);
  recipeSearchTerm = signal('');

  // Notes Modal Signals
  isNotesModalOpen = signal(false);
  editingCartItemId = signal<string | null>(null);
  noteInput = signal('');
  
  // Discount Modal Signals
  isDiscountModalOpen = signal(false);
  editingDiscountItem = signal<DisplayOrderItem | null>(null);
  discountType = signal<DiscountType>('percentage');
  discountValue = signal<number | null>(null);

  criticalKeywords = ['alergia', 'sem glúten', 'sem lactose', 'celíaco', 'nozes', 'amendoim', 'vegetariano', 'vegano'];

  hasCustomer = computed(() => !!this.currentOrder()?.customers);

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
      let recipesToShow = this.recipes().filter(r => !r.is_sub_recipe);
      if (category) recipesToShow = recipesToShow.filter(r => r.category_id === category.id);
      if (term) recipesToShow = recipesToShow.filter(r => r.name.toLowerCase().includes(term));
      return recipesToShow;
  });
  
  groupedOrderItems = computed<DisplayOrderItem[]>(() => {
    const order = this.currentOrder();
    if (!order) return [];

    const items = order.order_items;
    const grouped = new Map<string, GroupedOrderItem>();
    const singles: SingleOrderItem[] = [];
    const recipesMap = this.recipeState.recipesById();

    for (const item of items) {
      if (item.group_id) {
        if (!grouped.has(item.group_id)) {
          const recipe = recipesMap.get(item.recipe_id!);
          grouped.set(item.group_id, {
            isGroup: true, groupId: item.group_id, recipeName: recipe?.name ?? 'Prato Desconhecido',
            recipeId: item.recipe_id!, quantity: item.quantity, 
            totalPrice: 0, // Calculated below
            originalTotalPrice: 0, // Calculated below
            items: [],
            hasDiscount: false, // Calculated below
          });
        }
        grouped.get(item.group_id)!.items.push(item);
      } else {
        const hasDiscount = !!item.discount_type;
        singles.push({ 
            isGroup: false, 
            item,
            hasDiscount,
            originalTotalPrice: (hasDiscount ? item.original_price : item.price) * item.quantity
        });
      }
    }

    // Post-process grouped items
    for (const group of grouped.values()) {
        group.totalPrice = group.items.reduce((sum, item) => sum + item.price, 0);
        group.originalTotalPrice = group.items.reduce((sum, item) => sum + item.original_price, 0);
        group.hasDiscount = group.items.some(i => i.discount_type);
    }
    
    return [...Array.from(grouped.values()), ...singles];
  });
  
  orderTotal = computed(() => {
    const prices = this.recipePrices();
    const currentItemsTotal = this.currentOrder()?.order_items.reduce((sum, item) => sum + (item.price * item.quantity), 0) ?? 0;
    const cartItemsTotal = this.shoppingCart().reduce((sum, item) => sum + (prices.get(item.recipe.id)! * item.quantity), 0);
    return currentItemsTotal + cartItemsTotal;
  });

  selectCategory(category: Category | null) { this.selectedCategory.set(category); }

  private reservedIngredients = computed(() => {
    const reserved = new Map<string, number>();
    const recipeCompositions = this.recipeState.recipeDirectComposition();
    const order = this.currentOrder();
    const cart = this.shoppingCart();

    const accumulate = (recipeId: string, quantity: number) => {
        const composition = recipeCompositions.get(recipeId);
        if (composition) {
            composition.directIngredients.forEach(ing => {
                const totalUsed = ing.quantity * quantity;
                reserved.set(ing.ingredientId, (reserved.get(ing.ingredientId) || 0) + totalUsed);
            });
            composition.subRecipeIngredients.forEach(subIng => {
                const totalUsed = subIng.quantity * quantity;
                reserved.set(subIng.ingredientId, (reserved.get(subIng.ingredientId) || 0) + totalUsed);
            });
        }
    };

    // 1. Ingredients already sent to kitchen
    if (order) {
        const processedGroupIds = new Set<string>();
        for (const item of order.order_items) {
            if (item.group_id) {
                if (processedGroupIds.has(item.group_id)) continue;
                processedGroupIds.add(item.group_id);
                const representativeItem = order.order_items.find(i => i.group_id === item.group_id);
                if(representativeItem) {
                    accumulate(representativeItem.recipe_id!, representativeItem.quantity);
                }
            } else {
                if (item.recipe_id) {
                    accumulate(item.recipe_id, item.quantity);
                }
            }
        }
    }

    // 2. Ingredients in the current shopping cart
    for (const item of cart) {
        accumulate(item.recipe.id, item.quantity);
    }

    return reserved;
  });

  private hasEnoughStockFor(recipe: Recipe): boolean {
    const ingredientsMap = new Map(this.inventoryState.ingredients().map(i => [i.id, i]));
    const composition = this.recipeState.recipeDirectComposition().get(recipe.id);
    const reserved = this.reservedIngredients();

    if (!composition) {
      return true; // Assume true for recipes with no ingredients
    }

    // Check direct raw ingredients
    for (const ing of composition.directIngredients) {
      // FIX: Add a guard to ensure ingredient exists before accessing its properties.
      const ingredient = ingredientsMap.get(ing.ingredientId);
      if (ingredient) {
        const availableStock = ingredient.stock;
        const alreadyReserved = reserved.get(ing.ingredientId) || 0;
        
        if (availableStock < alreadyReserved + ing.quantity) {
          this.notificationService.show(`Estoque insuficiente de "${ingredient.name}" para adicionar mais "${recipe.name}".`, 'error');
          return false;
        }
      } else {
        this.notificationService.show(`Ingrediente de "${recipe.name}" não encontrado.`, 'error');
        return false;
      }
    }

    // Check sub-recipe stock items
    for (const subIng of composition.subRecipeIngredients) {
      // FIX: Add a guard to ensure ingredient exists before accessing its properties.
      const ingredient = ingredientsMap.get(subIng.ingredientId);
      if (ingredient) {
        const availableStock = ingredient.stock;
        const alreadyReserved = reserved.get(subIng.ingredientId) || 0;

        if (availableStock < alreadyReserved + subIng.quantity) {
          this.notificationService.show(`Estoque insuficiente da sub-receita pronta "${ingredient.name}".`, 'error');
          return false;
        }
      } else {
        this.notificationService.show(`Item de estoque para sub-receita em "${recipe.name}" não encontrado.`, 'error');
        return false;
      }
    }

    return true;
  }

  addToCart(recipe: Recipe & { hasStock?: boolean }) {
    if (!recipe.is_available) {
        this.notificationService.show(`"${recipe.name}" não está disponível no cardápio.`, 'warning');
        return;
    }

    // Find an existing item in the cart to increment. We'll only increment items that have no notes.
    const existingCartItem = this.shoppingCart().find(item => item.recipe.id === recipe.id && !item.notes);
    
    // Perform stock check before adding or incrementing
    if (!this.hasEnoughStockFor(recipe)) {
        return; // The hasEnoughStockFor method shows the notification
    }

    if (existingCartItem) {
        this.shoppingCart.update(cart => 
            cart.map(item => item.id === existingCartItem.id ? { ...item, quantity: item.quantity + 1 } : item)
        );
    } else {
        this.shoppingCart.update(cart => [...cart, { id: uuidv4(), recipe, quantity: 1, notes: '' }]);
    }
  }
  
  updateCartItemQuantity(itemId: string, change: -1 | 1) {
    const itemToUpdate = this.shoppingCart().find(item => item.id === itemId);
    if (!itemToUpdate) return;
    
    if (change === 1) { // Only check stock when increasing quantity
        if (!this.hasEnoughStockFor(itemToUpdate.recipe)) {
            return; // Notification is handled inside the check function
        }
    }

    this.shoppingCart.update(cart => 
        cart.map(item => item.id === itemId ? { ...item, quantity: Math.max(0, item.quantity + change) } : item)
            .filter(item => item.quantity > 0)
    );
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
    const confirmed = await this.notificationService.confirm(
      `Tem certeza que deseja enviar a conta da Mesa ${this.selectedTable()?.number} para o caixa? A mesa ficará bloqueada para novos lançamentos.`, 
      'Enviar para o Caixa?'
    );
    if (confirmed) {
        this.checkoutStarted.emit();
    }
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
  
  // --- Discount Methods ---
  openDiscountModal(item: DisplayOrderItem) {
    this.editingDiscountItem.set(item);
    let firstItem: OrderItem;
    
    if ('items' in item) { // This is a GroupedOrderItem
      firstItem = item.items[0];
    } else { // This is a SingleOrderItem
      firstItem = item.item;
    }
    
    this.discountType.set(firstItem.discount_type || 'percentage');
    this.discountValue.set(firstItem.discount_value || null);
    this.isDiscountModalOpen.set(true);
  }

  closeDiscountModal() {
    this.isDiscountModalOpen.set(false);
  }

  async saveDiscount() {
    const item = this.editingDiscountItem();
    if (!item) return;

    let itemIds: string[];

    if ('items' in item) { // This is a GroupedOrderItem
      itemIds = item.items.map(i => i.id);
    } else { // This is a SingleOrderItem
      itemIds = [item.item.id];
    }
    
    const { success, error } = await this.posDataService.applyDiscountToOrderItems(
        itemIds,
        this.discountValue() !== null && this.discountValue()! > 0 ? this.discountType() : null,
        this.discountValue()
    );

    if (success) {
      this.closeDiscountModal();
    } else {
      await this.notificationService.alert(`Erro ao aplicar desconto: ${error?.message}`);
    }
  }

  async removeDiscount() {
    const item = this.editingDiscountItem();
    if (!item) return;

    let itemIds: string[];

    if ('items' in item) { // This is a GroupedOrderItem
      itemIds = item.items.map(i => i.id);
    } else { // This is a SingleOrderItem
      itemIds = [item.item.id];
    }

    const { success, error } = await this.posDataService.applyDiscountToOrderItems(itemIds, null, null);
    if (success) {
      this.closeDiscountModal();
    } else {
      await this.notificationService.alert(`Erro ao remover desconto: ${error?.message}`);
    }
  }
}