


import { Component, ChangeDetectionStrategy, inject, signal, computed, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PrintingService } from '../../services/printing.service';
import { Category, Order, Recipe, Transaction, CashierClosing } from '../../models/db.models';
import { PricingService } from '../../services/pricing.service';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { CashierDataService } from '../../services/cashier-data.service';

type CashierView = 'quickSale' | 'cashDrawer' | 'reprint';

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
  imports: [CommonModule],
  templateUrl: './cashier.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CashierComponent {
  stateService = inject(SupabaseStateService);
  cashierDataService = inject(CashierDataService);
  printingService = inject(PrintingService);
  pricingService = inject(PricingService);

  view: WritableSignal<CashierView> = signal('quickSale');
  isLoading = computed(() => !this.stateService.isDataLoaded());

  // --- Quick Sale Signals ---
  categories = this.stateService.categories;
  recipes = this.stateService.recipesWithStockStatus;
  selectedCategory: WritableSignal<Category | null> = signal(null);
  recipeSearchTerm = signal('');
  quickSaleCart = signal<CartItem[]>([]);
  isPaymentModalOpen = signal(false);
  payments = signal<Payment[]>([]);
  paymentAmountInput = signal('');
  selectedPaymentMethod = signal<PaymentMethod>('Dinheiro');

  // --- Cash Drawer Signals ---
  isClosingModalOpen = signal(false);
  countedCash = signal<number | null>(null);
  closingNotes = signal('');
  newExpenseDescription = signal('');
  newExpenseAmount = signal<number | null>(null);

  // --- Data Signals for Views ---
  completedOrders = this.stateService.completedOrders;
  transactions = this.stateService.transactions;
  
  // --- Reprint / Details Signals ---
  isDetailsModalOpen = signal(false);
  selectedOrderForDetails = signal<Order | null>(null);

  recipePrices = computed(() => {
    const priceMap = new Map<string, number>();
    for (const recipe of this.recipes()) {
      priceMap.set(recipe.id, this.pricingService.getEffectivePrice(recipe));
    }
    return priceMap;
  });

  // --- Quick Sale Computeds & Methods ---
  filteredRecipes = computed(() => {
    const category = this.selectedCategory();
    const term = this.recipeSearchTerm().toLowerCase();
    let recipesToShow = this.recipes().filter(r => r.is_available && r.hasStock);
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

  openPaymentModal() {
    this.payments.set([]);
    this.paymentAmountInput.set(this.balanceDue() > 0 ? this.balanceDue().toString() : '');
    this.selectedPaymentMethod.set('Dinheiro');
    this.isPaymentModalOpen.set(true);
  }
  closePaymentModal() { this.isPaymentModalOpen.set(false); }

  addPayment() {
    const method = this.selectedPaymentMethod(), balance = this.balanceDue();
    let amount = parseFloat(this.paymentAmountInput());
    if (isNaN(amount) || amount <= 0) { alert('Valor inválido.'); return; }
    if (method === 'Dinheiro') {
      if (amount < balance) { alert('Valor em dinheiro é menor que o saldo.'); return; }
      amount = balance;
    } else {
      if (amount > balance + 0.001) { alert(`Valor para ${method} excede o saldo.`); return; }
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
    if (!cart || !this.isPaymentComplete()) return;
    const { success, error } = await this.cashierDataService.finalizeQuickSalePayment(cart, this.payments());
    if (success) {
      alert('Venda registrada com sucesso!');
      this.closePaymentModal();
      this.quickSaleCart.set([]);
    } else {
      alert(`Falha ao registrar venda. Erro: ${error?.message}`);
    }
  }

  // --- Cash Drawer Computeds & Methods ---
  openingBalance = computed(() => this.transactions().find(t => t.type === 'Abertura de Caixa')?.amount ?? 0);
  revenueTransactions = computed(() => this.transactions().filter(t => t.type === 'Receita'));
  expenseTransactions = computed(() => this.transactions().filter(t => t.type === 'Despesa'));

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
        alert('Por favor, preencha a descrição e um valor válido para a despesa.');
        return;
    }
    const { success, error } = await this.cashierDataService.logTransaction(description, amount, 'Despesa');
    if (success) {
        this.newExpenseDescription.set('');
        this.newExpenseAmount.set(null);
    } else {
        alert(`Falha ao registrar despesa: ${error?.message}`);
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
        alert('Por favor, insira o valor contado em caixa.');
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
        notes: this.closingNotes().trim()
    };
    
    const { success, error, data: savedClosing } = await this.cashierDataService.closeCashier(closingData as any);
    
    if (success && savedClosing) {
        this.printClosingReport(savedClosing);
        this.closeClosingModal();
        alert('Caixa fechado com sucesso!');
    } else {
        alert(`Falha ao fechar o caixa. Erro: ${error?.message}`);
    }
  }
  
  printClosingReport(closingData: CashierClosing) {
    this.printingService.printCashierClosingReport(closingData, this.expenseTransactions());
  }

  // --- Reprint Methods ---
  getOrderTotal(order: Order): number {
    return order.order_items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  getPaymentsForOrder(orderId: string): Payment[] {
    const orderIdShort = orderId.slice(0, 8);
    const paymentMethodRegex = /\(([^)]+)\)/;

    return this.transactions()
      .filter(t => t.description.includes(`Pedido #${orderIdShort}`))
      .map(t => {
        const match = t.description.match(paymentMethodRegex);
        return {
          method: (match ? match[1] : 'Desconhecido') as PaymentMethod,
          amount: t.amount,
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
    this.selectedOrderForDetails.set(null);
  }

  getOrderOrigin(order: Order): string {
    if (order.order_type === 'QuickSale') return 'Balcão';
    return `Mesa ${order.table_number}`;
  }
}