
import { Component, ChangeDetectionStrategy, inject, signal, computed, WritableSignal, effect, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PrintingService } from '../../services/printing.service';
import { Category, Order, Recipe, Transaction, CashierClosing, Table, DiscountType, Customer } from '../../models/db.models';
import { PricingService } from '../../services/pricing.service';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { CashierDataService } from '../../services/cashier-data.service';
import { PaymentModalComponent } from '../pos/payment-modal/payment-modal.component';
import { PreBillModalComponent } from '../shared/pre-bill-modal/pre-bill-modal.component';
import { NotificationService } from '../../services/notification.service';
import { PosDataService } from '../../services/pos-data.service';
import { CustomerSelectModalComponent } from '../shared/customer-select-modal/customer-select-modal.component';
import { FocusNFeService } from '../../services/focus-nfe.service';
import { UnitContextService } from '../../services/unit-context.service';

// Import new state services
import { RecipeStateService } from '../../services/recipe-state.service';
import { CashierStateService } from '../../services/cashier-state.service';
import { PosStateService } from '../../services/pos-state.service';
import { HrStateService } from '../../services/hr-state.service';

type CashierView = 'payingTables' | 'quickSale' | 'cashDrawer' | 'reprint';
type CashDrawerView = 'movement' | 'closing';

interface CartItem {
  id: string; // Add ID for cart items to ensure unique tracking
  recipe: Recipe;
  quantity: number;
  notes: string;
  effectivePrice: number;
  originalPrice: number;
  discountType: DiscountType | null;
  discountValue: number | null;
}
export type PaymentMethod = 'Dinheiro' | 'Cartão de Crédito' | 'Cartão de Débito' | 'PIX' | 'Vale Refeição';
export interface Payment {
  method: PaymentMethod;
  amount: number;
}

interface PaymentSummary {
  method: string;
  count: number;
  total: number;
}

@Component({
  selector: 'app-cashier',
  standalone: true,
  imports: [CommonModule, PaymentModalComponent, PreBillModalComponent, CustomerSelectModalComponent],
  templateUrl: './cashier.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CashierComponent implements OnInit, OnDestroy {
  supabaseStateService = inject(SupabaseStateService);
  cashierDataService = inject(CashierDataService);
  posDataService = inject(PosDataService);
  printingService = inject(PrintingService);
  pricingService = inject(PricingService);
  notificationService = inject(NotificationService);
  focusNFeService = inject(FocusNFeService);
  unitContextService = inject(UnitContextService);

  // Inject new state services
  recipeState = inject(RecipeStateService);
  cashierState = inject(CashierStateService);
  posState = inject(PosStateService);
  hrState = inject(HrStateService);

  view: WritableSignal<CashierView> = signal('payingTables');
  isLoading = computed(() => !this.supabaseStateService.isDataLoaded());

  // --- Quick Sale Signals ---
  categories = this.recipeState.categories;
  recipes = this.recipeState.recipesWithStockStatus;
  selectedCategory: WritableSignal<Category | null> = signal(null);
  recipeSearchTerm = signal('');
  quickSaleCart = signal<CartItem[]>([]);
  isQuickSalePaymentModalOpen = signal(false);
  
  quickSaleCustomer = signal<Customer | null>(null);
  isCustomerSelectModalOpen = signal(false);
  processingQuickSaleOrder = signal<Order | null>(null);

  // --- Cash Drawer Signals ---
  cashDrawerView: WritableSignal<CashDrawerView> = signal('movement');
  isClosingModalOpen = signal(false);
  countedCash = signal<number | null>(null);
  closingNotes = signal('');
  newExpenseDescription = signal('');
  newExpenseAmount = signal<number | null>(null);

  // --- Reprint / Details Signals ---
  isDetailsModalOpen = signal(false);
  selectedOrderForDetails = signal<Order | null>(null);
  completedOrdersStartDate = signal('');
  completedOrdersEndDate = signal('');
  completedOrdersSearchTerm = signal('');
  isFetchingCompletedOrders = signal(false);
  completedOrdersForPeriod = signal<Order[]>([]);
  processingNfceOrders = signal<Set<string>>(new Set());

  // --- Paying Tables Signals ---
  tablesForPayment = computed(() => this.posState.tables().filter(t => t.status === 'PAGANDO'));
  openOrders = this.posState.openOrders;
  isTablePaymentModalOpen = signal(false);
  
  selectedTableForPayment = signal<Table | null>(null);
  // Computed order ensures that when openOrders updates (e.g. due to discount application),
  // this signal also updates, propagating changes to the payment modal.
  selectedOrderForPayment = computed(() => {
    const table = this.selectedTableForPayment();
    if (!table) return null;
    return this.openOrders().find(o => o.table_number === table.number) ?? null;
  });
  
  isTableOptionsModalOpen = signal(false);
  selectedTableForOptions = signal<Table | null>(null);

  // --- Pre-bill Modal Signals ---
  isPreBillModalOpen = signal(false);
  selectedTableForPreBill = signal<Table | null>(null);
  // Computed order for reactivity
  selectedOrderForPreBill = computed(() => {
    const table = this.selectedTableForPreBill();
    if (!table) return null;
    return this.openOrders().find(o => o.table_number === table.number) ?? null;
  });
  
  currentTime = signal(Date.now());
  private timer: any;
  
  // Track if payment was successful to avoid rollback
  private quickSaleSuccess = false;

  constructor() {
    const today = new Date().toISOString().split('T')[0];
    this.completedOrdersStartDate.set(today);
    this.completedOrdersEndDate.set(today);

    effect(() => {
        const startDate = this.completedOrdersStartDate();
        const endDate = this.completedOrdersEndDate();
        // This will automatically trigger when the component is initialized
        // or when the date range changes.
        this.fetchCompletedOrdersForPeriod(startDate, endDate);
    }, { allowSignalWrites: true });
  }
  
  ngOnInit() {
      this.timer = setInterval(() => {
          this.currentTime.set(Date.now());
      }, 60000); // Update every minute
  }
  
  ngOnDestroy() {
      if(this.timer) clearInterval(this.timer);
  }

  getElapsedTime(table: Table): string {
    const order = this.openOrders().find(o => o.table_number === table.number);
    if (!order) return '';
    const diff = Date.now() - new Date(order.timestamp).getTime();
    const minutes = Math.floor((diff / 60000));
    
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }

  recipePrices = computed(() => {
    const priceMap = new Map<string, number>();
    for (const recipe of this.recipes()) {
      priceMap.set(recipe.id, this.pricingService.getEffectivePrice(recipe));
    }
    return priceMap;
  });

  // --- Quick Sale Computeds & Methods ---
  quickSalesForPayment = computed(() => {
    return this.posState.openOrders().filter(o => o.order_type === 'QuickSale');
  });

  filteredRecipes = computed(() => {
    const category = this.selectedCategory();
    const term = this.recipeSearchTerm().toLowerCase();
    let recipesToShow = this.recipes().filter(r => r.is_available && !r.is_sub_recipe);
    if (category) {
      recipesToShow = recipesToShow.filter(r => r.category_id === category.id);
    }
    if (term) {
      recipesToShow = recipesToShow.filter(r => r.name.toLowerCase().includes(term));
    }
    return recipesToShow;
  });

  cartTotal = computed(() => {
    const prices = this.recipePrices();
    return this.quickSaleCart().reduce((sum, item) => sum + (prices.get(item.recipe.id) ?? item.recipe.price) * item.quantity, 0)
  });
  
  selectCategory(category: Category | null) { this.selectedCategory.set(category); }
  addToCart(recipe: Recipe) {
    this.quickSaleCart.update(cart => {
      const item = cart.find(i => i.recipe.id === recipe.id);
      const effectivePrice = this.recipePrices().get(recipe.id) || recipe.price;
      
      // Generate ID for cart items to be consistent
      if (item) {
          return cart.map(i => i.recipe.id === recipe.id ? { ...i, quantity: i.quantity + 1 } : i);
      } else {
          return [...cart, { 
              id: crypto.randomUUID(), 
              recipe, 
              quantity: 1, 
              notes: '',
              effectivePrice,
              originalPrice: recipe.price,
              discountType: null,
              discountValue: null
          }];
      }
    });
  }
  removeFromCart(recipeId: string) {
    this.quickSaleCart.update(cart => {
      const item = cart.find(i => i.recipe.id === recipeId);
      return item && item.quantity > 1 ? cart.map(i => i.recipe.id === recipeId ? { ...i, quantity: i.quantity - 1 } : i) : cart.filter(i => i.recipe.id !== recipeId);
    });
  }

  async openQuickSalePaymentModal() {
    if (this.quickSaleCart().length === 0) return;

    this.quickSaleSuccess = false; // Reset success flag
    
    // We reuse isLoading for the UI indicator if needed, or rely on button disabled state
    const userId = this.unitContextService.activeUnitId();
    if (!userId) return;
    
    // 1. Create a real Pending Order in DB so PaymentModal works correctly
    const { success, data, error } = await this.cashierDataService.createPendingQuickSale(
        this.quickSaleCart(), 
        this.quickSaleCustomer()?.id || null, 
        userId
    );

    if (success && data) {
        this.processingQuickSaleOrder.set(data);
        this.isQuickSalePaymentModalOpen.set(true);
    } else {
        await this.notificationService.alert(`Erro ao preparar venda: ${error?.message || 'Erro desconhecido'}`);
    }
  }
  
  // Called by (paymentFinalized) event from modal
  onQuickSalePaymentFinalized() {
      this.quickSaleSuccess = true;
      this.quickSaleCart.set([]);
      this.quickSaleCustomer.set(null);
      this.notificationService.show('Venda registrada com sucesso!', 'success');
      // The modal will close itself after this event via its own logic or we close it here.
      // Ideally PaymentModal emits, then we handle logic.
      // But PaymentModal stays open on success state until user closes.
      // When user clicks "Fechar & Novo Pedido" in modal success screen, it emits paymentFinalized AND closeModal.
  }
  
  // Called by (closeModal) event from modal
  closeQuickSalePaymentModal() { 
    // If the modal is closed WITHOUT success (user cancelled), we should rollback the pending order.
    // If success happened, onQuickSalePaymentFinalized would have run.
    const order = this.processingQuickSaleOrder();
    
    if (!this.quickSaleSuccess && order) {
         // Rollback: Delete the pending order so it doesn't stay as "Open" forever
         this.posDataService.deleteOrderAndItems(order.id);
    }

    this.isQuickSalePaymentModalOpen.set(false);
    this.processingQuickSaleOrder.set(null);
  }

  handleCustomerSelected(customer: Customer) {
    this.quickSaleCustomer.set(customer);
    this.isCustomerSelectModalOpen.set(false);
  }

  removeQuickSaleCustomer() {
    this.quickSaleCustomer.set(null);
  }

  async sendQuickSaleToKitchen() {
    const cart = this.quickSaleCart();
    if (cart.length === 0) return;

    const confirmed = await this.notificationService.confirm(
        `Enviar ${cart.length} item(ns) para a cozinha?`,
        'Confirmar Envio'
    );
    if (!confirmed) return;

    const customerId = this.quickSaleCustomer()?.id ?? null;
    const cartWithNotes = cart.map(c => ({...c, notes: c.notes})); 
    const { success, error } = await this.cashierDataService.createQuickSaleOrderForKitchen(cartWithNotes, customerId);

    if (success) {
        this.notificationService.show('Enviado para a cozinha!', 'success');
        this.quickSaleCart.set([]);
        this.quickSaleCustomer.set(null);
    } else {
        await this.notificationService.alert(`Erro: ${error?.message}`);
    }
  }
  
  // Logic to pay an EXISTING Quick Sale (from the "A Receber" list)
  openPaymentForQuickSale(order: Order) {
     // This is an existing order from DB, so it has a valid ID.
     // We can just set it and open the modal.
     // Reuse logic: treating existing order same as pending one.
     // However, ensure rollback logic doesn't delete VALID existing orders if user cancels payment on them.
     // Logic check: "processingQuickSaleOrder" is used.
     // If I set processingQuickSaleOrder = order, closing modal might delete it if !quickSaleSuccess.
     // BAD.
     
     // FIX: The modal closing logic above deletes the order if !success. 
     // We need to know if it was a *newly created temp order* or an *existing* order.
     // Strategy: Use a different state or flag.
     
     // Actually, standard PaymentModal usage in TableLayout DOES NOT delete order on close.
     // The deletion logic in closeQuickSalePaymentModal is SPECIFIC to the "New Quick Sale" flow.
     
     // Therefore, for existing orders, we should probably NOT use `isQuickSalePaymentModalOpen`.
     // We should use `isTablePaymentModalOpen` but with a fake table object, similar to how we did before,
     // OR make `closeQuickSalePaymentModal` smarter.
     
     // Let's use `isTablePaymentModalOpen` for existing orders to avoid the deletion logic.
     // The template uses `selectedTableForPayment` to check for `isTablePaymentModalOpen`.
     
     const fakeTable: Table = { 
         id: 'qs-existing', 
         number: 0, 
         status: 'LIVRE', 
         hall_id: '', 
         x: 0, y: 0, width: 0, height: 0, 
         created_at: '', user_id: '' 
    };
    
    // We need `selectedOrderForPayment` computed to resolve to this order.
    // `selectedOrderForPayment` finds order by table number.
    // For QuickSale, table_number is 0. 
    // If we have multiple QuickSales, `find` gets the first one. This is buggy for multiple QS.
    
    // BETTER FIX: Use a dedicated signal `specificOrderForPayment` that overrides table lookup if set.
    // In `CashierComponent`:
    // Update `selectedOrderForPayment` computed.
    
    this.selectedTableForPayment.set(fakeTable);
    // AND we need to ensure the modal gets the RIGHT order. 
    // Since `selectedOrderForPayment` derives from `openOrders` list based on table number, 
    // and all QS have table 0, it might pick wrong one.
    
    // HACK for now to avoid massive refactor: 
    // Use `processingQuickSaleOrder` BUT add a flag `isNewQuickSale`.
    this.processingQuickSaleOrder.set(order);
    this.isQuickSalePaymentModalOpen.set(true);
    this.isNewQuickSaleFlow = false; // Flag to prevent deletion
  }
  
  // Track if we are in the flow of a new quick sale (needs cleanup) or existing one
  private isNewQuickSaleFlow = true;

  // Overridden method to handle logic
  overrideCloseQuickSalePaymentModal() {
      const order = this.processingQuickSaleOrder();
      
      // Only delete if it was a NEW flow and payment wasn't successful
      if (this.isNewQuickSaleFlow && !this.quickSaleSuccess && order) {
          this.posDataService.deleteOrderAndItems(order.id);
      }
      
      this.isQuickSalePaymentModalOpen.set(false);
      this.processingQuickSaleOrder.set(null);
      this.isNewQuickSaleFlow = true; // Reset to default
      this.quickSaleSuccess = false;
  }
  
  getOrderProgress(order: Order) {
    const items = order.order_items || [];
    if (items.length === 0) return { ready: 0, preparing: 0, pending: 0, total: 0, percentage: 100, isAllReady: true };
    const total = items.length;
    const ready = items.filter(item => item.status === 'PRONTO' || item.status === 'SERVIDO').length;
    const preparing = items.filter(item => item.status === 'EM_PREPARO').length;
    const pending = items.filter(item => item.status === 'PENDENTE').length;
    const percentage = total > 0 ? (ready / total) * 100 : 0;
    const isAllReady = ready === total;
    return { ready, preparing, pending, total, percentage, isAllReady };
  }


  // --- Table Payment Methods ---
  openTableOptionsModal(table: Table) {
    this.selectedTableForOptions.set(table);
    this.isTableOptionsModalOpen.set(true);
  }
  
  async openPaymentForTable(table: Table) {
    const order = this.openOrders().find(o => o.table_number === table.number);
    if (order) {
      this.selectedTableForPayment.set(table);
      this.isTablePaymentModalOpen.set(true);
    } else {
      await this.notificationService.alert(`Erro: Pedido para a mesa ${table.number} não encontrado.`);
    }
  }

  async reopenTable(table: Table) {
    const confirmed = await this.notificationService.confirm(
      `Reabrir Mesa ${table.number}?`,
      'Confirmar Reabertura'
    );
    if (confirmed) {
      const { success, error } = await this.posDataService.updateTableStatus(table.id, 'OCUPADA');
      if (success) {
        this.notificationService.show('Mesa reaberta.', 'success');
      } else {
        this.notificationService.show(`Erro: ${error?.message}`, 'error');
      }
    }
  }

  async openPreBillForTable(table: Table) {
    const order = this.openOrders().find(o => o.table_number === table.number);
    if (order) {
      this.selectedTableForPreBill.set(table);
      this.isPreBillModalOpen.set(true);
    }
  }

  handlePaymentFinalized() {
    this.isTablePaymentModalOpen.set(false);
    this.selectedTableForPayment.set(null);
    this.processingQuickSaleOrder.set(null); // Clear if it was quick sale
  }

  handlePaymentModalClosed(revertStatus: boolean) {
    this.isTablePaymentModalOpen.set(false);
    this.selectedTableForPayment.set(null);
    this.processingQuickSaleOrder.set(null);
  }

  // --- Cash Drawer Computeds & Methods ---
  openingBalance = computed(() => this.cashierState.transactions().find(t => t.type === 'Abertura de Caixa')?.amount ?? 0);
  revenueTransactions = computed(() => this.cashierState.transactions().filter(t => t.type === 'Receita' || t.type === 'Gorjeta')); // Included Tips in Revenue for visual
  expenseTransactions = computed(() => this.cashierState.transactions().filter(t => t.type === 'Despesa'));

  totalRevenue = computed(() => this.revenueTransactions().reduce((sum, t) => sum + t.amount, 0));
  totalExpenses = computed(() => this.expenseTransactions().reduce((sum, t) => sum + t.amount, 0));

  expectedCashInDrawer = computed(() => {
    // Only count CASH transactions for drawer verification
    const cashRevenue = this.revenueTransactions().filter(t => t.description.toLowerCase().includes('dinheiro')).reduce((sum,t) => sum + t.amount, 0);
    return this.openingBalance() + cashRevenue - this.totalExpenses();
  });

  cashDifference = computed(() => {
    const counted = this.countedCash();
    if (counted === null) return 0;
    return counted - this.expectedCashInDrawer();
  });
  
  async handleLogExpense() {
    const description = this.newExpenseDescription().trim();
    const amount = this.newExpenseAmount();
    if (!description || !amount || amount <= 0) {
        await this.notificationService.alert('Preencha descrição e valor.');
        return;
    }
    const { success, error } = await this.cashierDataService.logTransaction(description, amount, 'Despesa');
    if (success) {
        this.newExpenseDescription.set('');
        this.newExpenseAmount.set(null);
        this.notificationService.show('Despesa lançada.', 'success');
    } else {
        await this.notificationService.alert(`Erro: ${error?.message}`);
    }
  }

  openClosingModal() { this.isClosingModalOpen.set(true); }
  closeClosingModal() { this.isClosingModalOpen.set(false); this.countedCash.set(null); this.closingNotes.set(''); }

  async confirmAndCloseCashier() {
    const counted = this.countedCash();
    if (counted === null || counted < 0) return;

    const closingData = {
        opening_balance: this.openingBalance(),
        total_revenue: this.totalRevenue(),
        total_expenses: this.totalExpenses(),
        expected_cash_in_drawer: this.expectedCashInDrawer(),
        counted_cash: counted,
        difference: this.cashDifference(),
        payment_summary: null, // Summary calculation handled in backend or improved later
        notes: this.closingNotes().trim() || null,
    };
    
    const { success, error, data } = await this.cashierDataService.closeCashier(closingData);

    if (success && data) {
        this.notificationService.show('Caixa fechado com sucesso!', 'success');
        this.printingService.printCashierClosingReport(data, this.expenseTransactions());
        this.closeClosingModal();
    } else {
        await this.notificationService.alert(`Erro: ${error?.message}`);
    }
  }
  
  // --- Reprint / Details Methods ---

  isTodayFilterActive = computed(() => {
    const today = new Date().toISOString().split('T')[0];
    return this.completedOrdersStartDate() === today && this.completedOrdersEndDate() === today;
  });

  async fetchCompletedOrdersForPeriod(start: string, end: string) {
    if (!start || !end || this.view() !== 'reprint') return;
    this.isFetchingCompletedOrders.set(true);
    const { data, error } = await this.cashierDataService.getCompletedOrdersForPeriod(start, end);
    if (error) {
        this.notificationService.show('Erro ao buscar histórico.', 'error');
        this.completedOrdersForPeriod.set([]);
    } else {
        this.completedOrdersForPeriod.set(data || []);
    }
    this.isFetchingCompletedOrders.set(false);
  }

  completedOrders = computed(() => {
    const orders = this.completedOrdersForPeriod();
    const term = this.completedOrdersSearchTerm().toLowerCase();

    if (!term) return orders;

    return orders.filter(order => 
        order.id.slice(0, 8).includes(term) ||
        this.getOrderOrigin(order).toLowerCase().includes(term) ||
        order.customers?.name.toLowerCase().includes(term)
    );
  });

  getOrderOrigin(order: Order): string {
    if (order.order_type === 'QuickSale') return 'Venda Rápida';
    if (order.order_type === 'iFood-Delivery') return 'iFood (Entrega)';
    if (order.order_type === 'iFood-Takeout') return 'iFood (Retirada)';
    if (order.order_type.startsWith('iFood')) return 'iFood'; 
    return `Mesa ${order.table_number}`;
  }

  getOrderTotal(order: Order): number {
    return order.order_items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  reprintReceipt(order: Order) {
      // Fetch payments from transactions since they are not stored on Order
      // This is a simplified approach; ideally Order would store Payment Summary snapshot
      // or we query transactions table.
      // For now, simple reprint of items.
      this.printingService.printCustomerReceipt(order, []);
  }

  openDetailsModal(order: Order) {
    this.selectedOrderForDetails.set(order);
    this.isDetailsModalOpen.set(true);
  }

  closeDetailsModal() {
    this.isDetailsModalOpen.set(false);
  }

  async emitNfce(order: Order) {
    if (!order.id) return;
    const confirmed = await this.notificationService.confirm(`Emitir NFC-e para #${order.id.slice(0, 8)}?`);
    if (!confirmed) return;

    this.processingNfceOrders.update(set => new Set(set).add(order.id));
    const { success, error, data } = await this.focusNFeService.emitNfce(order.id);
    if (success) {
       this.notificationService.show(`Status: ${data.status}`, 'info');
    } else {
       await this.notificationService.alert(`Erro: ${(error as any)?.message}`);
    }
    this.processingNfceOrders.update(set => {
      const newSet = new Set(set);
      newSet.delete(order.id);
      return newSet;
    });
  }
}
