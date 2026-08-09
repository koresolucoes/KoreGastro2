import { assert } from 'console';

/**
 * Test Suite for ETAPA 03E: Financial Integrity / Order Finalization
 * Tests server-side payment validation, underpayment rejection, overpayment rules (cash vs non-cash),
 * monetary precision, tip handling, split payments, structural payload validation,
 * and side-effect isolation before validation.
 */

class SimulatedPostgresDB03E {
  orders: Map<string, {
    id: string;
    user_id: string;
    table_number: number;
    command_number: number | null;
    status: string;
    completed_at: string | null;
    closed_by_employee_id: string | null;
    discount_type: string | null;
    discount_value: number | null;
    delivery_cost: number | null;
  }> = new Map();

  tables: Map<string, {
    id: string;
    user_id: string;
    number: number;
    status: 'LIVRE' | 'OCUPADA';
    employee_id: string | null;
    customer_count: number;
  }> = new Map();

  orderItems: Map<string, Array<{
    id: string;
    recipe_id: string | null;
    price: number;
    quantity: number;
    status: string;
  }>> = new Map();

  transactions: Array<{
    id: string;
    user_id: string;
    employee_id: string | null;
    type: string;
    amount: number;
    description: string;
    created_at: string;
    date: string;
  }> = [];

  stockAdjustments: Array<{
    ingredient_id: string;
    quantity_change: number;
    reason: string;
    user_id: string;
  }> = [];

  recipeIngredients: Map<string, Array<{ ingredient_id: string; quantity: number }>> = new Map();

  // Mutexes per table / order ID to simulate exact PostgreSQL SELECT ... FOR UPDATE behavior
  private rowLocks: Map<string, Promise<void>> = new Map();

  private async acquireLock(lockKey: string): Promise<() => void> {
    while (this.rowLocks.has(lockKey)) {
      await this.rowLocks.get(lockKey);
    }
    let releaseResolver: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseResolver = resolve;
    });
    this.rowLocks.set(lockKey, lockPromise);

    return () => {
      this.rowLocks.delete(lockKey);
      releaseResolver();
    };
  }

  /**
   * Exact JavaScript implementation of the PL/pgSQL RPC function:
   * public.finalize_order_transaction (03E version)
   */
  async finalizeOrderTransaction(params: {
    p_order_id: string;
    p_user_id: string;
    p_table_id: string | null;
    p_payments: any;
    p_closed_by_employee_id: string | null;
    p_tip_amount?: number | null;
  }): Promise<{
    success: boolean;
    code?: string;
    message: string;
    already_finalized?: boolean;
    order_id?: string;
    order_total?: number;
    payments_total?: number;
    change?: number;
  }> {
    const p_tip_amount = params.p_tip_amount ?? 0;

    // 1. LOCK O REGISTRO DO PEDIDO ANTES DE QUALQUER EFEITO (FOR UPDATE)
    const releaseOrderLock = await this.acquireLock(`order_${params.p_order_id}`);

    try {
      const order = this.orders.get(params.p_order_id);

      if (!order || order.user_id !== params.p_user_id) {
        return {
          success: false,
          message: 'Pedido não encontrado ou não pertence a este estabelecimento'
        };
      }

      // 2. STATUS GUARD & IDEMPOTÊNCIA
      if (order.status === 'COMPLETED') {
        return {
          success: true,
          already_finalized: true,
          order_id: params.p_order_id,
          message: 'Pedido já finalizado anteriormente'
        };
      }

      if (order.status === 'CANCELLED') {
        return {
          success: false,
          message: 'Não é possível finalizar um pedido cancelado'
        };
      }

      if (order.status !== 'OPEN' && order.status !== 'PAYING') {
        return {
          success: false,
          message: 'Pedido em status inválido para finalização'
        };
      }

      // 3. DETERMINAR O TOTAL OFICIAL SERVER-SIDE (DO BANCO DE DADOS)
      const items = this.orderItems.get(params.p_order_id) || [];
      const activeItems = items.filter((i) => i.status !== 'CANCELADO');

      let subtotalRaw = activeItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
      const subtotal = Math.round(subtotalRaw * 100) / 100;

      let discountAmount = 0;
      if (order.discount_type === 'percentage' && order.discount_value && order.discount_value > 0) {
        discountAmount = Math.round((subtotal * (order.discount_value / 100)) * 100) / 100;
      } else if (order.discount_type === 'fixed_value' && order.discount_value && order.discount_value > 0) {
        discountAmount = Math.round(order.discount_value * 100) / 100;
      }

      const netItems = Math.max(0, subtotal - discountAmount);
      const deliveryFee = Math.round((order.delivery_cost ?? 0) * 100) / 100;
      const orderTotal = Math.round((netItems + deliveryFee) * 100) / 100;

      // 4. VALIDAR GORJETA
      if (p_tip_amount !== null && p_tip_amount !== undefined && p_tip_amount < 0) {
        return {
          success: false,
          code: 'INVALID_TIP_AMOUNT',
          message: 'Valor da gorjeta não pode ser negativo'
        };
      }

      const tip = Math.round(Math.max(0, p_tip_amount ?? 0) * 100) / 100;
      const expectedTotal = Math.round((orderTotal + tip) * 100) / 100;

      // 5. VALIDAÇÃO ESTRUTURAL E FINANCEIRA DE P_PAYMENTS
      const p_payments = params.p_payments;
      if (!p_payments || !Array.isArray(p_payments) || p_payments.length === 0) {
        return {
          success: false,
          code: 'INVALID_PAYMENTS_PAYLOAD',
          message: 'Lista de pagamentos ausente ou vazia'
        };
      }

      let paymentsTotal = 0;
      let nonCashTotal = 0;
      let cashTotal = 0;

      for (const paymentRecord of p_payments) {
        const methodText = (paymentRecord?.method ?? '').toString().trim();
        if (!methodText) {
          return {
            success: false,
            code: 'INVALID_PAYMENT_METHOD',
            message: 'Forma de pagamento não informada'
          };
        }

        if (paymentRecord?.amount === undefined || paymentRecord?.amount === null || paymentRecord?.amount === '') {
          return {
            success: false,
            code: 'INVALID_PAYMENT_AMOUNT',
            message: 'Valor do pagamento ausente ou inválido'
          };
        }

        const amountText = paymentRecord.amount.toString().trim();
        // Regex for numeric float/int
        if (!/^-?\d+(\.\d+)?$/.test(amountText)) {
          return {
            success: false,
            code: 'INVALID_PAYMENT_AMOUNT',
            message: 'Valor do pagamento não é numérico válido'
          };
        }

        const currAmount = Math.round(parseFloat(amountText) * 100) / 100;

        if (currAmount <= 0) {
          return {
            success: false,
            code: 'INVALID_PAYMENT_AMOUNT',
            message: 'Valor do pagamento deve ser maior que zero'
          };
        }

        paymentsTotal += currAmount;
        paymentsTotal = Math.round(paymentsTotal * 100) / 100;

        const isCash = methodText.toLowerCase().includes('dinheiro') || methodText.toLowerCase().includes('cash');
        if (isCash) {
          cashTotal += currAmount;
          cashTotal = Math.round(cashTotal * 100) / 100;
        } else {
          nonCashTotal += currAmount;
          nonCashTotal = Math.round(nonCashTotal * 100) / 100;
        }
      }

      // Underpayment validation
      if (paymentsTotal < expectedTotal) {
        return {
          success: false,
          code: 'INSUFFICIENT_PAYMENT',
          order_total: expectedTotal,
          payments_total: paymentsTotal,
          message: `Valor pago (R$ ${paymentsTotal}) é inferior ao total do pedido (R$ ${expectedTotal})`
        };
      }

      // Overpayment in non-cash method validation
      if (nonCashTotal > expectedTotal) {
        return {
          success: false,
          code: 'INVALID_OVERPAYMENT',
          order_total: expectedTotal,
          payments_total: paymentsTotal,
          message: 'Pagamento em método não-dinheiro excede o total do pedido'
        };
      }

      const change = Math.round((paymentsTotal - expectedTotal) * 100) / 100;

      // 6. EXECUTAR EFEITOS COLATERAIS (SOMENTE APÓS TODAS AS VALIDAÇÕES PASSATEM)

      let orderRef = '';
      if (order.command_number !== null) {
        orderRef = `Comanda #${order.command_number}`;
      } else if (order.table_number && order.table_number > 0) {
        orderRef = `Mesa ${order.table_number}`;
      } else {
        orderRef = `Pedido #${params.p_order_id.substring(0, 8)}`;
      }

      // 6a. Atualizar pedido para COMPLETED
      order.status = 'COMPLETED';
      order.completed_at = new Date().toISOString();
      order.closed_by_employee_id = params.p_closed_by_employee_id;

      // 6b. Lock & Liberação de Mesa
      if (order.table_number && order.table_number > 0) {
        let targetTableId = params.p_table_id;
        if (!targetTableId) {
          for (const [tId, table] of this.tables.entries()) {
            if (table.number === order.table_number && table.user_id === params.p_user_id) {
              targetTableId = tId;
              break;
            }
          }
        }

        if (targetTableId) {
          const releaseTableLock = await this.acquireLock(`table_${targetTableId}`);
          try {
            let openOrdersCount = 0;
            for (const [oId, o] of this.orders.entries()) {
              if (
                o.table_number === order.table_number &&
                o.user_id === params.p_user_id &&
                (o.status === 'OPEN' || o.status === 'PAYING') &&
                oId !== params.p_order_id
              ) {
                openOrdersCount++;
              }
            }

            if (openOrdersCount === 0) {
              const table = this.tables.get(targetTableId);
              if (table) {
                table.status = 'LIVRE';
                table.employee_id = null;
                table.customer_count = 0;
              }
            }
          } finally {
            releaseTableLock();
          }
        }
      }

      // 6c. Registrar Transações Financeiras (Receita)
      for (const p of p_payments) {
        this.transactions.push({
          id: `tx_${Math.random().toString(36).substring(2, 9)}`,
          user_id: params.p_user_id,
          employee_id: params.p_closed_by_employee_id,
          type: 'Receita',
          amount: Math.round(parseFloat(p.amount) * 100) / 100,
          description: `Receita ${orderRef} (${p.method})`,
          created_at: new Date().toISOString(),
          date: new Date().toISOString()
        });
      }

      // 6d. Registrar Gorjeta (se houver)
      if (tip > 0) {
        this.transactions.push({
          id: `tx_tip_${Math.random().toString(36).substring(2, 9)}`,
          user_id: params.p_user_id,
          employee_id: params.p_closed_by_employee_id,
          type: 'Gorjeta',
          amount: tip,
          description: `Gorjeta ${orderRef}`,
          created_at: new Date().toISOString(),
          date: new Date().toISOString()
        });
      }

      // 6e. Baixa de Estoque
      for (const item of activeItems) {
        if (!item.recipe_id) continue;
        const ingredients = this.recipeIngredients.get(item.recipe_id) || [];
        for (const ing of ingredients) {
          this.stockAdjustments.push({
            ingredient_id: ing.ingredient_id,
            quantity_change: -(ing.quantity * item.quantity),
            reason: `Venda ${orderRef}`,
            user_id: params.p_user_id
          });
        }
      }

      return {
        success: true,
        order_id: params.p_order_id,
        change,
        message: 'Conta fechada e estoque deduzido com sucesso'
      };
    } finally {
      releaseOrderLock();
    }
  }
}

// Global runner helper
async function runSuite() {
  console.log('============================================================');
  console.log('RUNNING ETAPA 03E - FINANCIAL INTEGRITY SUITE');
  console.log('============================================================');

  let passed = 0;
  let failed = 0;

  function assertCondition(condition: boolean, testName: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  const userId = 'store_unit_1';
  const empId = 'emp_mgr_1';

  // Helper setup
  function createFreshDb() {
    const db = new SimulatedPostgresDB03E();
    // Setup recipe and ingredients
    db.recipeIngredients.set('recipe_burger', [{ ingredient_id: 'ing_meat', quantity: 2 }]);

    // Order 1: 2 Burgers @ 50 = 100 total
    db.orders.set('order_100', {
      id: 'order_100',
      user_id: userId,
      table_number: 5,
      command_number: null,
      status: 'OPEN',
      completed_at: null,
      closed_by_employee_id: null,
      discount_type: null,
      discount_value: null,
      delivery_cost: null
    });

    db.tables.set('table_5', {
      id: 'table_5',
      user_id: userId,
      number: 5,
      status: 'OCUPADA',
      employee_id: empId,
      customer_count: 2
    });

    db.orderItems.set('order_100', [
      { id: 'item_1', recipe_id: 'recipe_burger', price: 50, quantity: 2, status: 'SERVIDO' }
    ]);

    return db;
  }

  // TEST 01: order total = 100, payments = 100 -> PASS
  {
    const db = createFreshDb();
    const res = await db.finalizeOrderTransaction({
      p_order_id: 'order_100',
      p_user_id: userId,
      p_table_id: 'table_5',
      p_payments: [{ method: 'PIX', amount: 100 }],
      p_closed_by_employee_id: empId
    });

    assertCondition(res.success === true, 'TESTE 01: order total = 100, payments = 100 PASS');
    assertCondition(db.orders.get('order_100')?.status === 'COMPLETED', 'TESTE 01: status updated to COMPLETED');
    assertCondition(db.transactions.length === 1 && db.transactions[0].amount === 100, 'TESTE 01: transaction created with amount 100');
    assertCondition(db.stockAdjustments.length === 1 && db.stockAdjustments[0].quantity_change === -4, 'TESTE 01: stock deducted');
  }

  // TEST 02: order total = 100, payments = 80 -> FAIL (INSUFFICIENT_PAYMENT), no side-effects
  {
    const db = createFreshDb();
    const res = await db.finalizeOrderTransaction({
      p_order_id: 'order_100',
      p_user_id: userId,
      p_table_id: 'table_5',
      p_payments: [{ method: 'PIX', amount: 80 }],
      p_closed_by_employee_id: empId
    });

    assertCondition(res.success === false, 'TESTE 02: order total = 100, payments = 80 FAIL');
    assertCondition(res.code === 'INSUFFICIENT_PAYMENT', 'TESTE 02: returns code INSUFFICIENT_PAYMENT');
    assertCondition(db.orders.get('order_100')?.status === 'OPEN', 'TESTE 02: order status remains OPEN');
    assertCondition(db.transactions.length === 0, 'TESTE 02: zero transactions created');
    assertCondition(db.stockAdjustments.length === 0, 'TESTE 02: zero stock deductions');
    assertCondition(db.tables.get('table_5')?.status === 'OCUPADA', 'TESTE 02: table remains OCUPADA');
  }

  // TEST 03: order total = 100, payments = 0.01 -> FAIL
  {
    const db = createFreshDb();
    const res = await db.finalizeOrderTransaction({
      p_order_id: 'order_100',
      p_user_id: userId,
      p_table_id: 'table_5',
      p_payments: [{ method: 'PIX', amount: 0.01 }],
      p_closed_by_employee_id: empId
    });

    assertCondition(res.success === false && res.code === 'INSUFFICIENT_PAYMENT', 'TESTE 03: order total = 100, payments = 0.01 FAIL');
  }

  // TEST 04: order total = 100, payments array vazio -> FAIL
  {
    const db = createFreshDb();
    const res = await db.finalizeOrderTransaction({
      p_order_id: 'order_100',
      p_user_id: userId,
      p_table_id: 'table_5',
      p_payments: [],
      p_closed_by_employee_id: empId
    });

    assertCondition(res.success === false && res.code === 'INVALID_PAYMENTS_PAYLOAD', 'TESTE 04: empty payments array FAIL');
  }

  // TEST 05: order total = 100, payments: 50 + 30 + 20 -> PASS
  {
    const db = createFreshDb();
    const res = await db.finalizeOrderTransaction({
      p_order_id: 'order_100',
      p_user_id: userId,
      p_table_id: 'table_5',
      p_payments: [
        { method: 'PIX', amount: 50 },
        { method: 'Cartão de Crédito', amount: 30 },
        { method: 'Dinheiro', amount: 20 }
      ],
      p_closed_by_employee_id: empId
    });

    assertCondition(res.success === true, 'TESTE 05: split payments 50 + 30 + 20 PASS');
    assertCondition(db.transactions.length === 3, 'TESTE 05: created 3 transactions');
  }

  // TEST 06: payment com amount <= 0 -> FAIL
  {
    const db = createFreshDb();
    const res = await db.finalizeOrderTransaction({
      p_order_id: 'order_100',
      p_user_id: userId,
      p_table_id: 'table_5',
      p_payments: [{ method: 'PIX', amount: -10 }],
      p_closed_by_employee_id: empId
    });

    assertCondition(res.success === false && res.code === 'INVALID_PAYMENT_AMOUNT', 'TESTE 06: negative payment amount FAIL');
  }

  // TEST 07: payment sem amount -> FAIL
  {
    const db = createFreshDb();
    const res = await db.finalizeOrderTransaction({
      p_order_id: 'order_100',
      p_user_id: userId,
      p_table_id: 'table_5',
      p_payments: [{ method: 'PIX' }],
      p_closed_by_employee_id: empId
    });

    assertCondition(res.success === false && res.code === 'INVALID_PAYMENT_AMOUNT', 'TESTE 07: missing payment amount FAIL');
  }

  // TEST 08: payment com amount inválido/string não numérica -> FAIL
  {
    const db = createFreshDb();
    const res = await db.finalizeOrderTransaction({
      p_order_id: 'order_100',
      p_user_id: userId,
      p_table_id: 'table_5',
      p_payments: [{ method: 'PIX', amount: 'abc_invalid' }],
      p_closed_by_employee_id: empId
    });

    assertCondition(res.success === false && res.code === 'INVALID_PAYMENT_AMOUNT', 'TESTE 08: non-numeric payment amount FAIL');
  }

  // TEST 09: order já COMPLETED -> 03D idempotency
  {
    const db = createFreshDb();
    db.orders.get('order_100')!.status = 'COMPLETED';

    const res = await db.finalizeOrderTransaction({
      p_order_id: 'order_100',
      p_user_id: userId,
      p_table_id: 'table_5',
      p_payments: [{ method: 'PIX', amount: 100 }],
      p_closed_by_employee_id: empId
    });

    assertCondition(res.success === true && res.already_finalized === true, 'TESTE 09: idempotency for COMPLETED order PASS');
  }

  // TEST 10: order CANCELLED -> FAIL
  {
    const db = createFreshDb();
    db.orders.get('order_100')!.status = 'CANCELLED';

    const res = await db.finalizeOrderTransaction({
      p_order_id: 'order_100',
      p_user_id: userId,
      p_table_id: 'table_5',
      p_payments: [{ method: 'PIX', amount: 100 }],
      p_closed_by_employee_id: empId
    });

    assertCondition(res.success === false, 'TESTE 10: CANCELLED order finalization FAIL');
  }

  // TEST 11, 12, 13: Underpayment side effects isolation
  {
    const db = createFreshDb();
    await db.finalizeOrderTransaction({
      p_order_id: 'order_100',
      p_user_id: userId,
      p_table_id: 'table_5',
      p_payments: [{ method: 'PIX', amount: 50 }],
      p_closed_by_employee_id: empId
    });

    assertCondition(db.transactions.length === 0, 'TESTE 11: underpayment creates 0 transactions');
    assertCondition(db.stockAdjustments.length === 0, 'TESTE 12: underpayment deducts 0 stock');
    assertCondition(db.tables.get('table_5')?.status === 'OCUPADA', 'TESTE 13: underpayment leaves table OCUPADA');
  }

  // TEST 14: split payment exato
  {
    const db = createFreshDb();
    const res = await db.finalizeOrderTransaction({
      p_order_id: 'order_100',
      p_user_id: userId,
      p_table_id: 'table_5',
      p_payments: [
        { method: 'PIX', amount: 60 },
        { method: 'Cartão de Débito', amount: 40 }
      ],
      p_closed_by_employee_id: empId
    });

    assertCondition(res.success === true, 'TESTE 14: exact split payment PASS');
    assertCondition(db.transactions.length === 2, 'TESTE 14: 2 revenue transactions created');
  }

  // TEST 15: tip semantic test (com tip e sem tip)
  {
    // Case 15a: with tip = 10 on order = 100 -> required = 110
    const db = createFreshDb();
    const resUnder = await db.finalizeOrderTransaction({
      p_order_id: 'order_100',
      p_user_id: userId,
      p_table_id: 'table_5',
      p_payments: [{ method: 'PIX', amount: 100 }],
      p_closed_by_employee_id: empId,
      p_tip_amount: 10
    });
    assertCondition(resUnder.success === false && resUnder.code === 'INSUFFICIENT_PAYMENT', 'TESTE 15a: order 100 + tip 10 with payment 100 fails');

    const resExact = await db.finalizeOrderTransaction({
      p_order_id: 'order_100',
      p_user_id: userId,
      p_table_id: 'table_5',
      p_payments: [{ method: 'PIX', amount: 110 }],
      p_closed_by_employee_id: empId,
      p_tip_amount: 10
    });
    assertCondition(resExact.success === true, 'TESTE 15b: order 100 + tip 10 with payment 110 passes');
    assertCondition(db.transactions.some((t) => t.type === 'Gorjeta' && t.amount === 10), 'TESTE 15b: tip transaction recorded as 10');
  }

  // TEST 16: overpayment com método não-cash -> FAIL
  {
    const db = createFreshDb();
    const res = await db.finalizeOrderTransaction({
      p_order_id: 'order_100',
      p_user_id: userId,
      p_table_id: 'table_5',
      p_payments: [{ method: 'PIX', amount: 120 }],
      p_closed_by_employee_id: empId
    });

    assertCondition(res.success === false && res.code === 'INVALID_OVERPAYMENT', 'TESTE 16: non-cash overpayment FAIL');
  }

  // TEST 17: cash overpayment / troco -> PASS
  {
    const db = createFreshDb();
    const res = await db.finalizeOrderTransaction({
      p_order_id: 'order_100',
      p_user_id: userId,
      p_table_id: 'table_5',
      p_payments: [{ method: 'Dinheiro', amount: 120 }],
      p_closed_by_employee_id: empId
    });

    assertCondition(res.success === true, 'TESTE 17: cash overpayment PASS');
    assertCondition(res.change === 20, 'TESTE 17: change calculated as 20');
  }

  // TEST 18: duas chamadas concorrentes de pagamento insuficiente -> nenhuma finaliza
  {
    const db = createFreshDb();
    const [res1, res2] = await Promise.all([
      db.finalizeOrderTransaction({
        p_order_id: 'order_100',
        p_user_id: userId,
        p_table_id: 'table_5',
        p_payments: [{ method: 'PIX', amount: 50 }],
        p_closed_by_employee_id: empId
      }),
      db.finalizeOrderTransaction({
        p_order_id: 'order_100',
        p_user_id: userId,
        p_table_id: 'table_5',
        p_payments: [{ method: 'PIX', amount: 70 }],
        p_closed_by_employee_id: empId
      })
    ]);

    assertCondition(!res1.success && !res2.success, 'TESTE 18: concurrent underpayments both fail');
    assertCondition(db.orders.get('order_100')?.status === 'OPEN', 'TESTE 18: order remains OPEN');
  }

  // TEST 19: duas chamadas concorrentes válidas -> única finalização
  {
    const db = createFreshDb();
    const [res1, res2] = await Promise.all([
      db.finalizeOrderTransaction({
        p_order_id: 'order_100',
        p_user_id: userId,
        p_table_id: 'table_5',
        p_payments: [{ method: 'PIX', amount: 100 }],
        p_closed_by_employee_id: empId
      }),
      db.finalizeOrderTransaction({
        p_order_id: 'order_100',
        p_user_id: userId,
        p_table_id: 'table_5',
        p_payments: [{ method: 'PIX', amount: 100 }],
        p_closed_by_employee_id: empId
      })
    ]);

    const successes = [res1, res2].filter((r) => r.success);
    const idempotents = [res1, res2].filter((r) => r.already_finalized);
    assertCondition(successes.length === 2, 'TESTE 19: both return success = true');
    assertCondition(idempotents.length === 1, 'TESTE 19: exactly 1 idempotent return');
    assertCondition(db.transactions.length === 1, 'TESTE 19: exactly 1 revenue transaction created');
  }

  // TEST 20: sum of final transactions matches expected payment structure
  {
    const db = createFreshDb();
    const res = await db.finalizeOrderTransaction({
      p_order_id: 'order_100',
      p_user_id: userId,
      p_table_id: 'table_5',
      p_payments: [
        { method: 'PIX', amount: 45 },
        { method: 'Cartão de Débito', amount: 60 }
      ],
      p_closed_by_employee_id: empId,
      p_tip_amount: 5
    });

    assertCondition(res.success === true, 'TESTE 20: finalization with tip 5 and payments 105 PASS');

    const revenueSum = db.transactions
      .filter((t) => t.type === 'Receita')
      .reduce((sum, t) => sum + t.amount, 0);
    const tipSum = db.transactions
      .filter((t) => t.type === 'Gorjeta')
      .reduce((sum, t) => sum + t.amount, 0);

    assertCondition(revenueSum === 105, 'TESTE 20: revenue transactions sum to 105');
    assertCondition(tipSum === 5, 'TESTE 20: tip transactions sum to 5');
  }

  // TEST 21 (Regression - Discount): percentage discount
  {
    const db = createFreshDb();
    db.orders.get('order_100')!.discount_type = 'percentage';
    db.orders.get('order_100')!.discount_value = 10; // 10% off 100 = 90 net

    const resUnder = await db.finalizeOrderTransaction({
      p_order_id: 'order_100',
      p_user_id: userId,
      p_table_id: 'table_5',
      p_payments: [{ method: 'PIX', amount: 80 }],
      p_closed_by_employee_id: empId
    });
    assertCondition(resUnder.success === false, 'TESTE 21a: 10% discount (net 90) rejects 80');

    const resExact = await db.finalizeOrderTransaction({
      p_order_id: 'order_100',
      p_user_id: userId,
      p_table_id: 'table_5',
      p_payments: [{ method: 'PIX', amount: 90 }],
      p_closed_by_employee_id: empId
    });
    assertCondition(resExact.success === true, 'TESTE 21b: 10% discount (net 90) accepts 90');
  }

  console.log('============================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
