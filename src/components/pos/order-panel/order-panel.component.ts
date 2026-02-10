
import { Component, ChangeDetectionStrategy, inject, signal, computed, WritableSignal, effect, untracked, input, output, InputSignal, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Table, Order, Recipe, Category, OrderItemStatus, OrderItem, Employee, DiscountType, Customer, Ingredient } from '../../../models/db.models';
import { v4 as uuidv4 } from 'uuid';
import { PricingService } from '../../../services/pricing.service';
import { RecipeStateService } from '../../../services/recipe-state.service';
import { InventoryStateService } from '../../../services/inventory-state.service';
import { PosDataService } from '../../../services/pos-data.service';
import { NotificationService } from '../../../services/notification.service';
import { ManagerAuthModalComponent } from '../../shared/manager-auth-modal/manager-auth-modal.component';
import { CancellationReasonModalComponent } from '../cancellation-reason-modal/cancellation-reason-modal.component';

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
  originalTotalPrice: number;
  items: OrderItem[];
  hasDiscount: boolean;
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
  imports: [CommonModule, ManagerAuthModalComponent, CancellationReasonModalComponent],
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

  // Mobile View State ('menu' = Product List, 'cart' = Order Details/Actions)
  mobileTab = signal<'menu' | 'cart'>('menu');

  // Quick Add Modal (Spotlight Flow)
  isQuickAddModalOpen = signal(false);
  quickAddRecipe = signal<Recipe | null>(null);
  quickAddQuantity = signal(1);
  quickAddNotes = signal('');

  // Notes Modal Signals (Editing existing)
  isNotesModalOpen = signal(false);
  editingCartItemId = signal<string | null>(null);
  noteInput = signal('');
  
  // Discount Modal Signals
  isDiscountModalOpen = signal(false);
  editingDiscountItem = signal<DisplayOrderItem | null>(null);
  discountType = signal<DiscountType>('percentage');
  discountValue = signal<number | null>(null);

  // Global Discount Modal
  isGlobalDiscountModalOpen = signal(false);
  globalDiscountType = signal<DiscountType>('percentage');
  globalDiscountValue = signal<number | null>(null);

  // Cancellation State
  isManagerAuthModalOpen = signal(false);
  isCancellationReasonModalOpen = signal(false);
  pendingCancellationAction = signal<{ type: 'item' | 'order', item?: DisplayOrderItem } | null>(null);
  cancellationModalTitle = signal('');
  
  // Holds the employee who authorized/performed the cancellation (Manager or Current User)
  cancellationAuthorizer = signal<Employee | null>(null);

  criticalKeywords = ['alergia', 'sem glúten', 'sem lactose', 'celíaco', 'nozes', 'amendoim', 'vegetariano', 'vegano'];

  hasCustomer = computed(() => !!this.currentOrder()?.customers);

  recipePrices = computed(() => {
    const priceMap = new Map<string, number>();
    for (const recipe of this.recipes()) {
      priceMap.set(recipe.id, this.pricingService.getEffectivePrice(recipe));
    }
    return priceMap;
  });
  
  cartItemQuantities = computed(() => {
    const quantities = new Map<string, number>();
    // Items in cart
    for (const item of this.shoppingCart()) {
        quantities.set(item.recipe.id, (quantities.get(item.recipe.id) || 0) + item.quantity);
    }
    
    // Items already in order (excluding cancelled)
    const processedGroupIds = new Set<string>();
    for (const item of this.currentOrder()?.order_items || []) {
        if (item.status === 'CANCELADO') continue;
        if (item.recipe_id) {
            if (item.group_id) {
                if (!processedGroupIds.has(item.group_id)) {
                    quantities.set(item.recipe_id, (quantities.get(item.recipe_id) || 0) + item.quantity);
                    processedGroupIds.add(item.group_id);
                }
            } else {
                quantities.set(item.recipe_id, (quantities.get(item.recipe_id) || 0) + item.quantity);
            }
        }
    }
    return quantities;
  });

  totalCartItems = computed(() => {
    return this.shoppingCart().reduce((total, item) => total + item.quantity, 0);
  });

  constructor() {
    effect(() => {
      this.selectedTable();
      untracked(() => this.shoppingCart.set([]));
    });
  }

  setMobileTab(tab: 'menu' | 'cart') {
    this.mobileTab.set(tab);
  }

  isItemCritical(item: OrderItem): boolean {
    const note = item.notes?.toLowerCase() ?? '';
    if (!note) return false;
    return this.criticalKeywords.some(keyword => note.includes(keyword));
  }

  isItemCancelled(item: DisplayOrderItem): boolean {
    if ('items' in item) {
        return item.items.every(i => i.status === 'CANCELADO');
    }
    return item.item.status === 'CANCELADO';
  }
  
  isAttentionAcknowledged(item: OrderItem): boolean {
    return !!item.status_timestamps?.['ATTENTION_ACKNOWLEDGED'];
  }

  filteredRecipes = computed(() => {
      const category = this.selectedCategory();
      const term = this.recipeSearchTerm().toLowerCase();
      let recipesToShow = this.recipes().filter(r => !r.is_sub_recipe);
      
      if (term) {
        // Spotlight Search: Search across all categories by name OR code
        recipesToShow = recipesToShow.filter(r => 
            r.name.toLowerCase().includes(term) || 
            r.external_code?.toLowerCase().includes(term) ||
            r.ncm_code?.includes(term)
        );
      } else if (category) {
        // Category Filter only if no search term
        recipesToShow = recipesToShow.filter(r => r.category_id === category.id);
      }
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
  
  orderSubtotalBeforeDiscount = computed(() => 
    this.currentOrder()?.order_items
        .filter(item => item.status !== 'CANCELADO')
        .reduce((sum, item) => sum + (item.price * item.quantity), 0) ?? 0
  );
  
  globalDiscountAmount = computed(() => {
    const order = this.currentOrder();
    if (!order || !order.discount_type || !order.discount_value) {
      return 0;
    }
    if (order.discount_type === 'percentage') {
      return this.orderSubtotalBeforeDiscount() * (order.discount_value / 100);
    }
    return order.discount_value;
  });

  orderSubtotal = computed(() => {
    return this.orderSubtotalBeforeDiscount() - this.globalDiscountAmount();
  });
  
  orderTotal = computed(() => {
      // For standard flow, return subtotal.
      return this.orderSubtotal();
  });

  selectCategory(category: Category | null) { 
      this.selectedCategory.set(category); 
      // Clear search if selecting category directly, for cleaner UX
      if(category) this.recipeSearchTerm.set('');
  }

  // --- NEW: Stock & Quick Add Logic ---

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

    // 1. Ingredients already sent to kitchen (Active only)
    if (order) {
        const processedGroupIds = new Set<string>();
        for (const item of order.order_items) {
            if (item.status === 'CANCELADO') continue;

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

  private hasEnoughStockFor(recipe: Recipe, quantityToCheck: number = 1): boolean {
    const ingredientsMap = new Map<string, Ingredient>(this.inventoryState.ingredients().map(i => [i.id, i]));
    const composition = this.recipeState.recipeDirectComposition().get(recipe.id);
    const reserved = this.reservedIngredients();

    if (!composition) {
      return true; // Assume true for recipes with no ingredients defined
    }

    // Check direct raw ingredients
    for (const ing of composition.directIngredients) {
      const ingredient = ingredientsMap.get(ing.ingredientId);
      if (ingredient) {
        const availableStock = ingredient.stock;
        const alreadyReserved = reserved.get(ing.ingredientId) || 0;
        
        if (availableStock < alreadyReserved + (ing.quantity * quantityToCheck)) {
          this.notificationService.show(`Estoque insuficiente de "${ingredient.name}".`, 'error');
          return false;
        }
      }
    }

    // Check sub-recipe stock items
    for (const subIng of composition.subRecipeIngredients) {
      const ingredient = ingredientsMap.get(subIng.ingredientId);
      if (ingredient) {
        const availableStock = ingredient.stock;
        const alreadyReserved = reserved.get(subIng.ingredientId) || 0;

        if (availableStock < alreadyReserved + (subIng.quantity * quantityToCheck)) {
          this.notificationService.show(`Estoque insuficiente da sub-receita pronta "${ingredient.name}".`, 'error');
          return false;
        }
      }
    }

    return true;
  }

  // REPLACES OLD addToCart: Opens the Quick Add Modal instead
  openQuickAddModal(recipe: Recipe & { hasStock?: boolean }) {
    if (!recipe.is_available) {
        this.notificationService.show(`"${recipe.name}" não está disponível no cardápio.`, 'warning');
        return;
    }
    
    // Initial Stock Check for 1 item
    if (!this.hasEnoughStockFor(recipe, 1)) {
        return;
    }

    this.quickAddRecipe.set(recipe);
    this.quickAddQuantity.set(1);
    this.quickAddNotes.set('');
    this.isQuickAddModalOpen.set(true);
  }

  closeQuickAddModal() {
    this.isQuickAddModalOpen.set(false);
    this.quickAddRecipe.set(null);
  }
  
  updateQuickAddQuantity(change: number) {
      const newQty = this.quickAddQuantity() + change;
      if (newQty < 1) return;
      
      const recipe = this.quickAddRecipe();
      if (recipe) {
          // Check if we have stock for the NEW total quantity we want to add
          // Note: reservedIngredients already counts what's in cart. 
          // hasEnoughStockFor logic checks (Reserved + NewNeeded) <= Stock.
          // Since we haven't added this batch to the cart yet, we check for newQty.
          if (change > 0 && !this.hasEnoughStockFor(recipe, newQty)) {
              return;
          }
      }
      this.quickAddQuantity.set(newQty);
  }

  confirmQuickAdd() {
      const recipe = this.quickAddRecipe();
      const quantity = this.quickAddQuantity();
      const notes = this.quickAddNotes().trim();
      
      if (!recipe) return;

      // Final Check
      if (!this.hasEnoughStockFor(recipe, quantity)) {
          return;
      }

      this.shoppingCart.update(cart => [
          ...cart, 
          { id: uuidv4(), recipe, quantity, notes }
      ]);
      
      this.closeQuickAddModal();
      this.recipeSearchTerm.set(''); // Clear search on successful add for rapid next entry
      // Optional: Sound effect for "beep" could go here
  }
  
  // --- Standard Cart Actions ---

  addToCart(recipe: Recipe & { hasStock?: boolean }) {
      // Legacy method alias - redirects to new flow
      this.openQuickAddModal(recipe);
  }
  
  decrementFromCart(recipe: Recipe) {
    // Legacy support or fallback logic
    const cartItem = this.shoppingCart().find(item => item.recipe.id === recipe.id && !item.notes);
    if (cartItem) {
        this.updateCartItemQuantity(cartItem.id, -1);
    }
  }

  updateCartItemQuantity(itemId: string, change: -1 | 1) {
    const itemToUpdate = this.shoppingCart().find(item => item.id === itemId);
    if (!itemToUpdate) return;
    
    if (change === 1) { // Only check stock when increasing quantity
        if (!this.hasEnoughStockFor(itemToUpdate.recipe)) {
            return; 
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
      case 'CANCELADO': return 'text-red-500 line-through';
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

  // --- Global Discount Methods ---
  openGlobalDiscountModal() {
    const order = this.currentOrder();
    this.globalDiscountType.set(order?.discount_type || 'percentage');
    this.globalDiscountValue.set(order?.discount_value || null);
    this.isGlobalDiscountModalOpen.set(true);
  }

  closeGlobalDiscountModal() {
    this.isGlobalDiscountModalOpen.set(false);
  }

  async saveGlobalDiscount() {
    const order = this.currentOrder();
    if (!order) return;
    
    const value = this.globalDiscountValue();
    const type = this.globalDiscountType();
    
    const finalValue = (value === null || value <= 0) ? null : value;
    const finalType = finalValue === null ? null : type;

    const { success, error } = await this.posDataService.applyGlobalOrderDiscount(
      order.id,
      finalType,
      finalValue
    );

    if (success) {
      this.closeGlobalDiscountModal();
    } else {
      await this.notificationService.alert(`Erro ao aplicar desconto: ${error?.message}`);
    }
  }

  // --- Cancellation Methods ---
  
  checkManagerAuth(action: () => void) {
    const employee = this.activeEmployee();
    if (employee?.role === 'Gerente') {
      this.cancellationAuthorizer.set(employee);
      action();
    } else {
      this.isManagerAuthModalOpen.set(true);
    }
  }

  handleManagerAuthorized(manager: Employee) {
    this.isManagerAuthModalOpen.set(false);
    this.cancellationAuthorizer.set(manager);
    // Execute the pending action
    const action = this.pendingCancellationAction();
    if (action) {
      if (action.type === 'item' && action.item) {
        this.openItemCancellationReasonModal(action.item);
      } else if (action.type === 'order') {
        this.openOrderCancellationReasonModal();
      }
    }
  }

  initiateItemCancellation(item: DisplayOrderItem) {
    this.pendingCancellationAction.set({ type: 'item', item });
    this.checkManagerAuth(() => this.openItemCancellationReasonModal(item));
  }

  initiateOrderCancellation() {
    this.pendingCancellationAction.set({ type: 'order' });
    this.checkManagerAuth(() => this.openOrderCancellationReasonModal());
  }

  openItemCancellationReasonModal(item: DisplayOrderItem) {
    const name = 'items' in item ? item.recipeName : item.item.name;
    this.cancellationModalTitle.set(`Cancelar Item: ${name}`);
    this.isCancellationReasonModalOpen.set(true);
  }

  openOrderCancellationReasonModal() {
    const order = this.currentOrder();
    const id = order ? `#${order.id.slice(0, 8)}` : '';
    this.cancellationModalTitle.set(`Cancelar Pedido Completo ${id}`);
    this.isCancellationReasonModalOpen.set(true);
  }

  async handleCancellationReasonConfirmed(reason: string) {
    this.isCancellationReasonModalOpen.set(false);
    const action = this.pendingCancellationAction();
    const authorizer = this.cancellationAuthorizer();
    
    // Safety check - should have authorizer by now (self or manager)
    const authId = authorizer ? authorizer.id : null;

    if (action?.type === 'item' && action.item) {
        await this.cancelItem(action.item, reason, authId);
    } else if (action?.type === 'order') {
        await this.cancelOrder(reason, authId);
    }
    
    this.pendingCancellationAction.set(null);
    this.cancellationAuthorizer.set(null);
  }

  async cancelItem(item: DisplayOrderItem, reason: string, employeeId: string | null) {
    let itemIds: string[];
    if ('items' in item) { // Grouped
        itemIds = item.items.map(i => i.id);
    } else { // Single
        itemIds = [item.item.id];
    }
    
    const { success, error } = await this.posDataService.cancelOrderItems(itemIds, reason, employeeId);
    
    if (success) {
        this.notificationService.show('Item(ns) cancelado(s) com sucesso.', 'success');
    } else {
        this.notificationService.show(`Erro ao cancelar: ${error?.message}`, 'error');
    }
  }

  async cancelOrder(reason: string, employeeId: string | null) {
    const order = this.currentOrder();
    if (!order) return;

    const { success, error } = await this.posDataService.cancelOrder(order.id, reason, employeeId);
    
    if (success) {
        this.notificationService.show('Pedido cancelado com sucesso.', 'success');
        this.closePanel.emit();
    } else {
        this.notificationService.show(`Erro ao cancelar pedido: ${error?.message}`, 'error');
    }
  }

}
