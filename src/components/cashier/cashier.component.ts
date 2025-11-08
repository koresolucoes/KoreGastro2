
import { Component, ChangeDetectionStrategy, inject, signal, computed, WritableSignal, effect } from '@angular/core';
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
import { WebhookService } from '../../services/webhook.service';
import { v4 as uuidv4 } from 'uuid';

// Import new state services
import { RecipeStateService } from '../../services/recipe-state.service';
import { CashierStateService } from '../../services/cashier-state.service';
import { PosStateService } from '../../services/pos-state.service';
import { HrStateService } from '../../services/hr-state.service';

type CashierView = 'payingTables' | 'quickSale' | 'cashDrawer' | 'reprint';
type CashDrawerView = 'movement' | 'closing';

interface CartItem {
  recipe: Recipe;
  quantity: number;
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
export class CashierComponent {
  supabaseStateService = inject(SupabaseStateService);
  cashierDataService = inject(CashierDataService);
  posDataService = inject(PosDataService);
  printingService = inject(PrintingService);
  pricingService = inject(PricingService);
  notificationService = inject(NotificationService);
  webhookService = inject(WebhookService);

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
  payments = signal<Payment[]>([]);
  paymentAmountInput = signal('');
  selectedPaymentMethod = signal<PaymentMethod>('Dinheiro');
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

  // --- Paying Tables Signals ---
  tablesForPayment = computed(() => this.posState.tables().filter(t => t.status === 'PAGANDO'));
  openOrders = this.posState.openOrders;
  isTablePaymentModalOpen = signal(false);
  selectedOrderForPayment = signal<Order | null>(null);
  selectedTableForPayment = signal<Table | null>(null);
  isTableOptionsModalOpen = signal(false);
  selectedTableForOptions = signal<Table | null>(null);

  // --- Pre-bill Modal Signals ---
  isPreBillModalOpen = signal(false);
  selectedOrderForPreBill = signal<Order | null>(null);
  selectedTableForPreBill = signal<Table | null>(null);
  
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
  totalPaid = computed(() => this.payments().reduce((sum, p) => sum + p.amount, 0));
  balanceDue = computed(() => parseFloat((this.cartTotal() - this.totalPaid()).toFixed(2)));
  change = computed(() => {
    const balance = this.balanceDue();
    const cashInput = parseFloat(this.paymentAmountInput());
    if (this.selectedPaymentMethod() !== 'Dinheiro' || isNaN(cashInput) || cashInput < balance) return 0;
    return parseFloat((cashInput - balance).toFixed(2));
  });
  isPaymentComplete = computed(() => this.balanceDue() <= 0.001);

  selectCategory(category: Category | null) { this.selectedCategory.set(category); }
  addToCart(recipe: Recipe) {
    this.quickSaleCart.update(cart => {
      const item = cart.find(i => i.recipe.id === recipe.id);
      return item ? cart.map(i => i.recipe.id === recipe.id ? { ...i, quantity: i.quantity + 1 } : i) : [...cart, { recipe, quantity: 1 }];
    });
  }
  removeFromCart(recipeId: string) {
    this.quickSaleCart.update(cart => {
      const item = cart.find(i => i.recipe.id === recipeId);
      return item && item.quantity > 1 ? cart.map(i => i.recipe.id === recipeId ? { ...i, quantity: i.quantity - 1 } : i) : cart.filter(i => i.recipe.id !== recipeId);
    });
  }

  openQuickSalePaymentModal() {
    this.payments.set([]);
    this.paymentAmountInput.set(this.balanceDue() > 0 ? this.balanceDue().toString() : '');
    this.selectedPaymentMethod.set('Dinheiro');
    this.isQuickSalePaymentModalOpen.set(true);
  }
  closeQuickSalePaymentModal() { 
    this.isQuickSalePaymentModalOpen.set(false);
    this.processingQuickSaleOrder.set(null);
  }

  async sendChargeToTerminal() {
    const amount = parseFloat(this.paymentAmountInput());
    const processingOrder = this.processingQuickSaleOrder();

    if (isNaN(amount) || amount <= 0) {
        this.notificationService.show('Por favor, insira um valor válido para a cobrança.', 'warning');
        return;
    }

    const payload = {
        orderId: processingOrder?.id || null, // Can be null for a new quick sale
        tableNumber: 0, // Quick Sale is always considered table 0
        amount: amount,
        paymentMethod: this.selectedPaymentMethod(),
        transactionId: uuidv4() // Unique ID for this specific payment attempt
    };

    this.webhookService.triggerWebhook('payment.initiated', payload);

    this.notificationService.show('Comando de cobrança enviado para a maquininha. Aguarde a confirmação do pagamento no seu sistema.', 'info', 8000);
  }

  async addPayment() {
    const method = this.selectedPaymentMethod(), balance = this.balanceDue();
    let amount = parseFloat(this.paymentAmountInput());
    if (isNaN(amount) || amount <= 0) {
      await this.notificationService.alert('Valor inválido.');
      return;
    }
    if (method === 'Dinheiro') {
      if (amount < balance) {
        await this.notificationService.alert('Valor em dinheiro é menor que o saldo.');
        return;
      }
      amount = balance;
    } else {
      if (amount > balance + 0.001) {
        await this.notificationService.alert(`Valor para ${method} excede o saldo.`);
        return;
      }
    }
    if (amount > 0) { this.payments.update(p => [...p, { method, amount: parseFloat(amount.toFixed(2)) }]); }
    const newBalance = this.balanceDue();
    this.paymentAmountInput.set(newBalance > 0 ? newBalance.toString() : '');
    this.selectedPaymentMethod.set('Dinheiro');
  }
  removePayment(index: number) {
    this.payments.update(p => p.filter((_, i) => i !== index));
    const newBalance = this.balanceDue();
    this.paymentAmountInput.set(newBalance > 0 ? newBalance.toString() : '');
  }

  async finalizePayment() {
    const cart = this.quickSaleCart();
    if (cart.length === 0 || !this.isPaymentComplete()) return;

    const processingOrder = this.processingQuickSaleOrder();
    
    if (processingOrder) {
        // Finalizing an existing QuickSale order that was sent to the kitchen
        const { success, error } = await this.cashierDataService.finalizeExistingQuickSalePayment(processingOrder.id, this.payments());
        if (success) {
            await this.notificationService.alert('Venda registrada com sucesso!', 'Sucesso');
            this.closeQuickSalePaymentModal();
            this.quickSaleCart.set([]);
            this.quickSaleCustomer.set(null);
        } else {
            await this.notificationService.alert(`Falha ao registrar venda. Erro: ${error?.message}`);
        }
        return; // Exit after handling
    }

    // --- Original logic for direct payment ---
    // Replicate logic from PricingService to get full promotion details for each item
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    
    const activePromos = this.pricingService.promotions().filter(promo => 
        promo.is_active &&
        promo.days_of_week.includes(currentDay) &&
        promo.start_time <= currentTime &&
        promo.end_time >= currentTime
    );

    const recipePromoMap = new Map<string, { discount_type: DiscountType, discount_value: number }>();
    if (activePromos.length > 0) {
        const activePromoIds = new Set(activePromos.map(p => p.id));
        const applicablePromotionRecipes = this.pricingService.promotionRecipes().filter(pr => activePromoIds.has(pr.promotion_id));
        for (const pr of applicablePromotionRecipes) {
            recipePromoMap.set(pr.recipe_id, { discount_type: pr.discount_type, discount_value: pr.discount_value });
        }
    }

    const cartForService = cart.map(item => {
        const promo = recipePromoMap.get(item.recipe.id);
        return {
            recipe: item.recipe,
            quantity: item.quantity,
            notes: '', // Quick sale does not support notes for direct payment
            effectivePrice: this.recipePrices().get(item.recipe.id) ?? item.recipe.price,
            originalPrice: item.recipe.price,
            discountType: promo?.discount_type ?? null,
            discountValue: promo?.discount_value ?? null,
        };
    });

    const customerId = this.quickSaleCustomer()?.id ?? null;
    const { success, error } = await this.cashierDataService.finalizeQuickSalePayment(cartForService, this.payments(), customerId);
    if (success) {
      await this.notificationService.alert('Venda registrada com sucesso!', 'Sucesso');
      this.closeQuickSalePaymentModal();
      this.quickSaleCart.set([]);
      this.quickSaleCustomer.set(null); // Reset customer
    } else {
      await this.notificationService.alert(`Falha ao registrar venda. Erro: ${error?.message}`);
    }
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
        `Enviar ${cart.length} item(ns) para a cozinha? O pedido ficará aguardando pagamento.`,
        'Confirmar Envio'
    );
    if (!confirmed) return;

    const customerId = this.quickSaleCustomer()?.id ?? null;
    // Notes are not currently supported in the simple cart, so we pass an empty string.
    const cartWithNotes = cart.map(c => ({...c, notes: ''})); 
    const { success, error } = await this.cashierDataService.createQuickSaleOrderForKitchen(cartWithNotes, customerId);

    if (success) {
        this.notificationService.show('Pedido enviado para a cozinha!', 'success');
        this.quickSaleCart.set([]);
        this.quickSaleCustomer.set(null);
    } else {
        await this.notificationService.alert(`Falha ao enviar pedido. Erro: ${error?.message}`);
    }
  }
  
  openPaymentForQuickSale(order: Order) {
    const recipesMap = this.recipeState.recipesById();
    
    // This logic assumes quick sale items sent to kitchen are not grouped.
    // Reconstructs the simple cart from the order items.
    const cartItems: CartItem[] = (order.order_items || [])
        .reduce((acc, orderItem) => {
            if (orderItem.recipe_id) {
                const recipe = recipesMap.get(orderItem.recipe_id);
                if (recipe) {
                    const existing = acc.find(ci => ci.recipe.id === recipe.id);
                    if (existing) {
                        existing.quantity += orderItem.quantity;
                    } else {
                        acc.push({ recipe, quantity: orderItem.quantity });
                    }
                }
            }
            return acc;
        }, [] as CartItem[]);
    
    this.quickSaleCart.set(cartItems);
    this.quickSaleCustomer.set(order.customers || null);
    this.processingQuickSaleOrder.set(order);
    this.openQuickSalePaymentModal();
  }
  
  getOrderProgress(order: Order): { ready: number; preparing: number; pending: number; total: number; percentage: number; isAllReady: boolean } {
    const items = order.order_items || [];
    if (items.length === 0) {
        return { ready: 0, preparing: 0, pending: 0, total: 0, percentage: 100, isAllReady: true };
    }
    const total = items.length;
    const ready = items.filter(item => item.status === 'PRONTO').length;
    const preparing = items.filter(item => item.status === 'EM_PREPARO').length;
    const pending = items.filter(item => item.status === 'PENDENTE').length;
    const percentage = total > 0 ? (ready / total) * 100 : 0;
    const isAllReady = ready === total;
    return { ready, preparing, pending, total, percentage, isAllReady };
  }


  // --- Table Payment Methods ---
  openTableOptionsModal(table: Table) {
    // Tailwind's `md` breakpoint is 768px.
    // Only open the options modal on smaller screens.
    if (window.innerWidth < 768) {
        this.selectedTableForOptions.set(table);
        this.isTableOptionsModalOpen.set(true);
    }
    // On larger screens, the buttons are visible directly on the card.
  }
  
  async openPaymentForTable(table: Table) {
    const order = this.openOrders().find(o => o.table_number === table.number);
    if (order) {
      this.selectedTableForPayment.set(table);
      this.selectedOrderForPayment.set(order);
      this.isTablePaymentModalOpen.set(true);
    } else {
      await this.notificationService.alert(`Erro: Pedido para a mesa ${table.number} não encontrado.`);
    }
  }

  async reopenTable(table: Table) {
    const confirmed = await this.notificationService.confirm(
      `Deseja reabrir a Mesa ${table.number}? Ela voltará para a tela do PDV e sairá da fila de pagamentos.`,
      'Confirmar Reabertura'
    );
    if (confirmed) {
      const { success, error } = await this.posDataService.updateTableStatus(table.id, 'OCUPADA');
      if (success) {
        await this.notificationService.alert(`Mesa ${table.number} reaberta com sucesso.`, 'Sucesso');
      } else {
        await this.notificationService.alert(`Falha ao reabrir a mesa. Erro: ${error?.message}`);
      }
    }
  }

  async openPreBillForTable(table: Table) {
    const order = this.openOrders().find(o => o.table_number === table.number);
    if (order) {
      this.selectedTableForPreBill.set(table);
      this.selectedOrderForPreBill.set(order);
      this.isPreBillModalOpen.set(true);
    } else {
      await this.notificationService.alert(`Erro: Pedido para a mesa ${table.number} não encontrado.`);
    }
  }

  handlePaymentFinalized() {
    this.isTablePaymentModalOpen.set(false);
    this.selectedTableForPayment.set(null);
    this.selectedOrderForPayment.set(null);
  }

  handlePaymentModalClosed(revertStatus: boolean) {
    this.isTablePaymentModalOpen.set(false);
    // In cashier, we don't revert status. The payment is either finalized or cancelled.
    this.selectedTableForPayment.set(null);
    this.selectedOrderForPayment.set(null);
  }

  // --- Cash Drawer Computeds & Methods ---
  openingBalance = computed(() => this.cashierState.transactions().find(t => t.type === 'Abertura de Caixa')?.amount ?? 0);
  revenueTransactions = computed(() => this.cashierState.transactions().filter(t => t.type === 'Receita'));
  expenseTransactions = computed(() => this.cashierState.transactions().filter(t => t.type === 'Despesa'));

  revenueSummary = computed(() => {
    const summary = new Map<string, { count: number, total: number }>();
    const paymentMethodRegex = /\(([^)]+)\)/;

    for (const transaction of this.revenueTransactions()) {
      const match = transaction.description.match(paymentMethodRegex);
      const method = match ? match[1] : 'Outros';

      const current = summary.get(method) || { count: 0, total: 0 };
      current.count += 1;
      current.total += transaction.amount;
      summary.set(method, current);
    }
    
    const summaryArray: PaymentSummary[] = Array.from(summary.entries()).map(([method, data]) => ({ method, ...data }));
    return summaryArray;
  });
  
  totalRevenue = computed(() => this.revenueTransactions().reduce((sum, t) => sum + t.amount, 0));
  totalExpenses = computed(() => this.expenseTransactions().reduce((sum, t) => sum + t.amount, 0));

  expectedCashInDrawer = computed(() => {
    const cashRevenue = this.revenueSummary().find(d => d.method === 'Dinheiro')?.total ?? 0;
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
        await this.notificationService.alert('Por favor, preencha a descrição e um valor válido para a despesa.');
        return;
    }
    const { success, error } = await this.cashierDataService.logTransaction(description, amount, 'Despesa');
    if (success) {
        this.newExpenseDescription.set('');
        this.newExpenseAmount.set(null);
    } else {
        await this.notificationService.alert(`Falha ao registrar despesa: ${error?.message}`);
    }
  }

  openClosingModal() {
    this.isClosingModalOpen.set(true);
  }
  
  closeClosingModal() {
    this.isClosingModalOpen.set(false);
    this.countedCash.set(null);
    this.closingNotes.set('');
  }

  async confirmAndCloseCashier() {
    const counted = this.countedCash();
    if (counted === null || counted < 0) {
      await this.notificationService.alert('Por favor, insira o valor contado em caixa.');
      return;
    }

    const closingData = {
        opening_balance: this.openingBalance(),
        total_revenue: this.totalRevenue(),
        total_expenses: this.totalExpenses(),
        expected_cash_in_drawer: this.expectedCashInDrawer(),
        counted_cash: counted,
        difference: this.cashDifference(),
        payment_summary: this.revenueSummary(),
        notes: this.closingNotes().trim() || null,
    };
    
    const { success, error, data: closingReport } = await this.cashierDataService.closeCashier(closingData);

    if (success && closingReport) {
        await this.notificationService.alert('Caixa fechado com sucesso!', 'Sucesso');
        this.printingService.printCashierClosingReport(closingReport, this.expenseTransactions());
        this.closeClosingModal();
        // The state will be updated via realtime subscription.
    } else {
        await this.notificationService.alert(`Falha ao fechar o caixa: ${error?.message}`);
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
        this.notificationService.show('Erro ao buscar vendas finalizadas.', 'error');
        this.completedOrdersForPeriod.set([]);
    } else {
        this.completedOrdersForPeriod.set(data || []);
    }
    this.isFetchingCompletedOrders.set(false);
  }

  setCompletedOrdersPeriod(period: 'today' | 'yesterday' | 'week') {
    const today = new Date();
    let start = new Date();
    let end = new Date();

    switch (period) {
        case 'today':
            // start and end are already today
            break;
        case 'yesterday':
            start.setDate(today.getDate() - 1);
            end.setDate(today.getDate() - 1);
            break;
        case 'week':
            const dayOfWeek = today.getDay(); // 0 = Sunday
            const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // adjust when day is sunday
            start = new Date(today.setDate(diff));
            end = new Date(); // today
            break;
    }
    this.completedOrdersStartDate.set(start.toISOString().split('T')[0]);
    this.completedOrdersEndDate.set(end.toISOString().split('T')[0]);
  }

  completedOrders = computed(() => {
    const orders = this.completedOrdersForPeriod();
    const term = this.completedOrdersSearchTerm().toLowerCase();

    if (!term) {
        return orders; // Already sorted by service
    }

    return orders.filter(order => 
        order.id.slice(0, 8).includes(term) ||
        this.getOrderOrigin(order).toLowerCase().includes(term) ||
        order.customers?.name.toLowerCase().includes(term)
    );
  });

  // --- Helper methods for display ---

  getOrderOrigin(order: Order): string {
    if (order.order_type === 'QuickSale') return 'Venda Rápida';
    if (order.order_type === 'iFood-Delivery') return 'iFood (Entrega)';
    if (order.order_type === 'iFood-Takeout') return 'iFood (Retirada)';
    if (order.order_type.startsWith('iFood')) return 'iFood'; // Fallback
    return `Mesa ${order.table_number}`;
  }

  getOrderTotal(order: Order): number {
    return order.order_items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  getPaymentsForOrder(orderId: string): { method: string, amount: number }[] {
    const paymentTransactions = this.cashierState.transactions()
      .filter(t => t.type === 'Receita' && t.description.includes(orderId.slice(0, 8)));
    
    const paymentMethodRegex = /\(([^)]+)\)/;
    return paymentTransactions.map(t => {
      const match = t.description.match(paymentMethodRegex);
      return {
        method: match ? match[1] : 'Desconhecido',
        amount: t.amount
      };
    });
  }

  reprintReceipt(order: Order) {
    const payments = this.getPaymentsForOrder(order.id);
    this.printingService.printCustomerReceipt(order, payments);
  }

  openDetailsModal(order: Order) {
    this.selectedOrderForDetails.set(order);
    this.isDetailsModalOpen.set(true);
  }

  closeDetailsModal() {
    this.isDetailsModalOpen.set(false);
  }
}
