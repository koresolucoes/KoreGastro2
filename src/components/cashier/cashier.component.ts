
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
import { FormsModule } from '@angular/forms';

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

interface PaymentBreakdownItem {
  method: string;
  expected: number;
  counted: number | null;
  difference: number;
}

@Component({
  selector: 'app-cashier',
  standalone: true,
  imports: [CommonModule, PaymentModalComponent, PreBillModalComponent, CustomerSelectModalComponent, FormsModule],
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
  
  // NEW: Detailed Breakdown for Closing
  closingBreakdown = signal<PaymentBreakdownItem[]>([]);
  
  closingNotes = signal('');
  
  // Expenses / Sangria
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
  selectedOrderForPreBill = computed(() => {
    const table = this.selectedTableForPreBill();
    if (!table) return null;
    return this.openOrders().find(o => o.table_number === table.number) ?? null;
  });
  
  currentTime = signal(Date.now());
  private timer: any;
  private quickSaleSuccess = false;

  constructor() {
    const today = new Date().toISOString().split('T')[0];
    this.completedOrdersStartDate.set(today);
    this.completedOrdersEndDate.set(today);

    effect(() => {
        const startDate = this.completedOrdersStartDate();
        const endDate = this.completedOrdersEndDate();
        this.fetchCompletedOrdersForPeriod(startDate, endDate);
    }, { allowSignalWrites: true });
  }
  
  ngOnInit() {
      this.timer = setInterval(() => {
          this.currentTime.set(Date.now());
      }, 60000);
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
    this.quickSaleSuccess = false;
    const userId = this.unitContextService.activeUnitId();
    if (!userId) return;
    
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
  
  onQuickSalePaymentFinalized() {
      this.quickSaleSuccess = true;
      this.quickSaleCart.set([]);
      this.quickSaleCustomer.set(null);
      this.notificationService.show('Venda registrada com sucesso!', 'success');
  }
  
  closeQuickSalePaymentModal() { 
    const order = this.processingQuickSaleOrder();
    if (!this.quickSaleSuccess && order) {
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
  
  openPaymentForQuickSale(order: Order) {
     const fakeTable: Table = { 
         id: 'qs-existing', number: 0, status: 'LIVRE', hall_id: '', x: 0, y: 0, width: 0, height: 0, created_at: '', user_id: '' 
    };
    this.selectedTableForPayment.set(fakeTable);
    this.processingQuickSaleOrder.set(order);
    this.isQuickSalePaymentModalOpen.set(true);
    this.isNewQuickSaleFlow = false;
  }
  
  private isNewQuickSaleFlow = true;

  overrideCloseQuickSalePaymentModal() {
      const order = this.processingQuickSaleOrder();
      if (this.isNewQuickSaleFlow && !this.quickSaleSuccess && order) {
          this.posDataService.deleteOrderAndItems(order.id);
      }
      this.isQuickSalePaymentModalOpen.set(false);
      this.processingQuickSaleOrder.set(null);
      this.isNewQuickSaleFlow = true;
      this.quickSaleSuccess = false;
  }
  
  getOrderProgress(order: Order) {
    const items = order.order_items || [];
    if (items.length === 0) return { percentage: 100, isAllReady: true };
    const total = items.length;
    const ready = items.filter(item => item.status === 'PRONTO' || item.status === 'SERVIDO').length;
    const percentage = total > 0 ? (ready / total) * 100 : 0;
    return { percentage, isAllReady: ready === total };
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
    this.processingQuickSaleOrder.set(null);
  }

  handlePaymentModalClosed(revertStatus: boolean) {
    this.isTablePaymentModalOpen.set(false);
    this.selectedTableForPayment.set(null);
    this.processingQuickSaleOrder.set(null);
  }

  // --- Cash Drawer & Closing Logic ---
  openingBalance = computed(() => this.cashierState.transactions().find(t => t.type === 'Abertura de Caixa')?.amount ?? 0);
  revenueTransactions = computed(() => this.cashierState.transactions().filter(t => t.type === 'Receita' || t.type === 'Gorjeta'));
  expenseTransactions = computed(() => this.cashierState.transactions().filter(t => t.type === 'Despesa'));

  totalRevenue = computed(() => this.revenueTransactions().reduce((sum, t) => sum + t.amount, 0));
  totalExpenses = computed(() => this.expenseTransactions().reduce((sum, t) => sum + t.amount, 0));

  totalDifference = computed(() => this.closingBreakdown().reduce((sum, item) => sum + item.difference, 0));

  async handleLogExpense(isSangria = false) {
    const descriptionInput = this.newExpenseDescription().trim();
    let description = descriptionInput;
    
    if (isSangria) {
        if (!description) description = "Sangria de Caixa";
        else description = `Sangria: ${description}`;
    }

    const amount = this.newExpenseAmount();
    if (!description || !amount || amount <= 0) {
        await this.notificationService.alert('Preencha descrição e valor.');
        return;
    }
    const { success, error } = await this.cashierDataService.logTransaction(description, amount, 'Despesa');
    if (success) {
        this.newExpenseDescription.set('');
        this.newExpenseAmount.set(null);
        this.notificationService.show(isSangria ? 'Sangria registrada com sucesso!' : 'Despesa lançada.', 'success');
    } else {
        await this.notificationService.alert(`Erro: ${error?.message}`);
    }
  }

  openClosingModal() { 
      // Initialize detailed breakdown
      const breakdown = new Map<string, number>();
      const methodRegex = /\(([^)]+)\)/; // Extracts text inside parentheses in transaction desc
      
      // Initialize Dinheiro with Opening Balance
      breakdown.set('Dinheiro', this.openingBalance());

      // Aggregate Revenues
      for (const t of this.revenueTransactions()) {
          const match = t.description.match(methodRegex);
          let method = match ? match[1] : 'Outros';
          // Normalize some common names
          if (method.toLowerCase().includes('dinheiro')) method = 'Dinheiro';
          else if (method.toLowerCase().includes('crédito')) method = 'Cartão de Crédito';
          else if (method.toLowerCase().includes('débito')) method = 'Cartão de Débito';
          
          breakdown.set(method, (breakdown.get(method) || 0) + t.amount);
      }

      // Subtract Expenses (Assuming mostly Cash, but theoretically could be others. For now subtract from Cash)
      // If we had expense type, we'd use it. Currently defaulting expenses to reduce Cash expected.
      const cashTotal = breakdown.get('Dinheiro') || 0;
      breakdown.set('Dinheiro', Math.max(0, cashTotal - this.totalExpenses()));

      const breakdownList: PaymentBreakdownItem[] = Array.from(breakdown.entries()).map(([method, expected]) => ({
          method,
          expected,
          counted: null, // User must input
          difference: 0
      }));

      this.closingBreakdown.set(breakdownList);
      this.isClosingModalOpen.set(true); 
  }

  updateCountedValue(index: number, value: number | null) {
      this.closingBreakdown.update(items => {
          const newItems = [...items];
          const item = { ...newItems[index] };
          item.counted = value;
          item.difference = (value || 0) - item.expected;
          newItems[index] = item;
          return newItems;
      });
  }

  closeClosingModal() { 
      this.isClosingModalOpen.set(false); 
      this.closingNotes.set(''); 
  }

  async confirmAndCloseCashier() {
    // Check if all fields are filled
    const breakdown = this.closingBreakdown();
    if (breakdown.some(i => i.counted === null)) {
        this.notificationService.show('Por favor, informe o valor contado para todos os métodos (use 0 se necessário).', 'warning');
        return;
    }

    const totalCounted = breakdown.reduce((acc, i) => acc + (i.counted || 0), 0);
    const totalExpected = breakdown.reduce((acc, i) => acc + i.expected, 0);

    const closingData = {
        opening_balance: this.openingBalance(),
        total_revenue: this.totalRevenue(),
        total_expenses: this.totalExpenses(),
        expected_cash_in_drawer: totalExpected,
        counted_cash: totalCounted,
        difference: this.totalDifference(),
        payment_summary: breakdown.map(i => ({ method: i.method, total: i.expected, count: 0 })), // Backend expects this structure roughly
        notes: this.closingNotes().trim() || null,
    };
    
    // We send just the aggregated data for the closing record, but the breakdown logic happens here visually.
    
    const { success, error, data } = await this.cashierDataService.closeCashier(closingData);

    if (success && data) {
        this.notificationService.show('Caixa fechado com sucesso!', 'success');
        this.printingService.printCashierClosingReport(data, this.expenseTransactions());
        
        // Reset UI for next shift
        this.cashierState.clearData();
        this.closingBreakdown.set([]);
        
        this.closeClosingModal();
        
        // Optionally reload page or navigate to reset state fully
        // window.location.reload(); // Simple brute force reset
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
