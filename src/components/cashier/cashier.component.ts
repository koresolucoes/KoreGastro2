
import { Component, ChangeDetectionStrategy, inject, signal, computed, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PrintingService } from '../../services/printing.service';
import { Category, Order, Recipe, Transaction, CashierClosing, Table } from '../../models/db.models';
import { PricingService } from '../../services/pricing.service';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { CashierDataService } from '../../services/cashier-data.service';
import { PaymentModalComponent } from '../pos/payment-modal/payment-modal.component';
import { PreBillModalComponent } from '../shared/pre-bill-modal/pre-bill-modal.component';
import { NotificationService } from '../../services/notification.service';
import { PosDataService } from '../../services/pos-data.service';

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
  imports: [CommonModule, PaymentModalComponent, PreBillModalComponent],
  templateUrl: './cashier.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CashierComponent {
  stateService = inject(SupabaseStateService);
  cashierDataService = inject(CashierDataService);
  posDataService = inject(PosDataService);
  printingService = inject(PrintingService);
  pricingService = inject(PricingService);
  notificationService = inject(NotificationService);

  view: WritableSignal<CashierView> = signal('payingTables');
  isLoading = computed(() => !this.stateService.isDataLoaded());

  // --- Quick Sale Signals ---
  categories = this.stateService.categories;
  recipes = this.stateService.recipesWithStockStatus;
  selectedCategory: WritableSignal<Category | null> = signal(null);
  recipeSearchTerm = signal('');
  quickSaleCart = signal<CartItem[]>([]);
  isQuickSalePaymentModalOpen = signal(false);
  payments = signal<Payment[]>([]);
  paymentAmountInput = signal('');
  selectedPaymentMethod = signal<PaymentMethod>('Dinheiro');

  // --- Cash Drawer Signals ---
  cashDrawerView: WritableSignal<CashDrawerView> = signal('movement');
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

  // --- Paying Tables Signals ---
  tablesForPayment = computed(() => this.stateService.tables().filter(t => t.status === 'PAGANDO'));
  openOrders = this.stateService.openOrders;
  isTablePaymentModalOpen = signal(false);
  selectedOrderForPayment = signal<Order | null>(null);
  selectedTableForPayment = signal<Table | null>(null);

  // --- Pre-bill Modal Signals ---
  isPreBillModalOpen = signal(false);
  selectedOrderForPreBill = signal<Order | null>(null);
  selectedTableForPreBill = signal<Table | null>(null);

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
    let recipesToShow = this.recipes().filter(r => r.is_available);
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
  closeQuickSalePaymentModal() { this.isQuickSalePaymentModalOpen.set(false); }

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
    if (!cart || !this.isPaymentComplete()) return;
    const { success, error } = await this.cashierDataService.finalizeQuickSalePayment(cart, this.payments());
    if (success) {
      await this.notificationService.alert('Venda registrada com sucesso!', 'Sucesso');
      this.closeQuickSalePaymentModal();
      this.quickSaleCart.set([]);
    } else {
      await this.notificationService.alert(`Falha ao registrar venda. Erro: ${error?.message}`);
    }
  }

  // --- Table Payment Methods ---
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
        notes: this.closingNotes().trim()
    };
    
    const { success, error, data: savedClosing } = await this.cashierDataService.closeCashier(closingData as any);
    
    if (success && savedClosing) {
        this.printClosingReport(savedClosing);
        this.closeClosingModal();
        await this.notificationService.alert('Caixa fechado com sucesso!', 'Sucesso');
    } else {
        await this.notificationService.alert(`Falha ao fechar o caixa. Erro: ${error?.message}`);
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