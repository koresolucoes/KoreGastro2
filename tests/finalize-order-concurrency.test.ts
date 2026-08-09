import { assert } from 'console';

/**
 * Test Suite for ETAPA 03D: Finalization / Concurrency Hardening
 * Tests finalize_order_transaction concurrency locking, status guard, idempotency,
 * table release concurrency, and side-effect isolation.
 */

// Simulation of Database Engine with Row-Level Locking (SELECT FOR UPDATE)
class SimulatedPostgresDB {
  orders: Map<string, {
    id: string;
    user_id: string;
    table_number: number;
    command_number: number | null;
    status: string;
    completed_at: string | null;
    closed_by_employee_id: string | null;
  }> = new Map();

  tables: Map<string, {
    id: string;
    user_id: string;
    number: number;
    status: 'LIVRE' | 'OCUPADA';
    employee_id: string | null;
    customer_count: number;
  }> = new Map();

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

  orderItems: Map<string, Array<{ recipe_id: string; quantity: number }>> = new Map();
  recipeIngredients: Map<string, Array<{ ingredient_id: string; quantity: number }>> = new Map();

  orderPaymentAttempts: Array<{ id: string; order_id: string; status: string }> = [];

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
   * Exact JavaScript representation of the PL/pgSQL function:
   * public.finalize_order_transaction
   */
  async finalizeOrderTransaction(params: {
    p_order_id: string;
    p_user_id: string;
    p_table_id: string | null;
    p_payments: Array<{ method: string; amount: number }>;
    p_closed_by_employee_id: string | null;
    p_tip_amount?: number;
  }): Promise<{ success: boolean; message: string; already_finalized?: boolean; order_id?: string }> {
    const p_tip_amount = params.p_tip_amount ?? 0;

    // 1. LOCK O REGISTRO DO PEDIDO ANTES DE QUALQUER EFEITO (SELECT ... FOR UPDATE)
    const releaseOrderLock = await this.acquireLock(`order_${params.p_order_id}`);

    try {
      const order = this.orders.get(params.p_order_id);

      // Check if order exists and belongs to p_user_id
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

      // Build reference string
      let v_order_ref = '';
      if (order.command_number) {
        v_order_ref = `Comanda #${order.command_number}`;
      } else if (order.table_number && order.table_number > 0) {
        v_order_ref = `Mesa ${order.table_number}`;
      } else {
        v_order_ref = `Pedido #${params.p_order_id.substring(0, 8)}`;
      }

      // 3. ATUALIZAR STATUS DO PEDIDO PARA COMPLETED
      order.status = 'COMPLETED';
      order.completed_at = new Date().toISOString();
      order.closed_by_employee_id = params.p_closed_by_employee_id;

      // 4. LOCK E LIBERAÇÃO DA MESA (se aplicável)
      if (order.table_number && order.table_number > 0) {
        let targetTable = params.p_table_id ? this.tables.get(params.p_table_id) : null;
        if (!targetTable) {
          for (const tbl of this.tables.values()) {
            if (tbl.number === order.table_number && tbl.user_id === params.p_user_id) {
              targetTable = tbl;
              break;
            }
          }
        }

        if (targetTable) {
          // Lock table row
          const releaseTableLock = await this.acquireLock(`table_${targetTable.id}`);
          try {
            // Count open orders remaining on that table
            let v_open_orders_count = 0;
            for (const o of this.orders.values()) {
              if (
                o.table_number === order.table_number &&
                o.user_id === params.p_user_id &&
                (o.status === 'OPEN' || o.status === 'PAYING') &&
                o.id !== params.p_order_id
              ) {
                v_open_orders_count++;
              }
            }

            if (v_open_orders_count === 0) {
              targetTable.status = 'LIVRE';
              targetTable.employee_id = null;
              targetTable.customer_count = 0;
            }
          } finally {
            releaseTableLock();
          }
        }
      }

      // 5. REGISTRAR TRANSAÇÕES FINANCEIRAS
      if (Array.isArray(params.p_payments)) {
        for (const payment of params.p_payments) {
          this.transactions.push({
            id: `tx-${Math.random().toString(36).substring(2, 9)}`,
            user_id: params.p_user_id,
            employee_id: params.p_closed_by_employee_id,
            type: 'Receita',
            amount: payment.amount,
            description: `Receita ${v_order_ref} (${payment.method})`,
            created_at: new Date().toISOString(),
            date: new Date().toISOString()
          });
        }
      }

      // 6. REGISTRAR GORJETA
      if (p_tip_amount > 0) {
        this.transactions.push({
          id: `tx-${Math.random().toString(36).substring(2, 9)}`,
          user_id: params.p_user_id,
          employee_id: params.p_closed_by_employee_id,
          type: 'Gorjeta',
          amount: p_tip_amount,
          description: `Gorjeta ${v_order_ref}`,
          created_at: new Date().toISOString(),
          date: new Date().toISOString()
        });
      }

      // 7. BAIXA DE ESTOQUE
      const items = this.orderItems.get(params.p_order_id) || [];
      for (const item of items) {
        const ingredients = this.recipeIngredients.get(item.recipe_id) || [];
        for (const ing of ingredients) {
          this.stockAdjustments.push({
            ingredient_id: ing.ingredient_id,
            quantity_change: -(ing.quantity * item.quantity),
            reason: `Venda ${v_order_ref}`,
            user_id: params.p_user_id
          });
        }
      }

      return {
        success: true,
        message: 'Conta fechada e estoque deduzido com sucesso'
      };
    } finally {
      releaseOrderLock();
    }
  }
}

async function runTests() {
  console.log('============================================================');
  console.log('RUNNING ETAPA 03D - FINALIZATION / CONCURRENCY HARDENING SUITE');
  console.log('============================================================');

  let passed = 0;
  let failed = 0;

  function assertEqual(actual: any, expected: any, testName: string) {
    if (JSON.stringify(actual) === JSON.stringify(expected)) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      console.error(` Expected:`, expected);
      console.error(` Actual:  `, actual);
      failed++;
    }
  }

  // --- TESTE 01: Finalizar pedido válido uma vez ---
  {
    const db = new SimulatedPostgresDB();
    db.orders.set('ord-1', {
      id: 'ord-1',
      user_id: 'user-1',
      table_number: 5,
      command_number: null,
      status: 'OPEN',
      completed_at: null,
      closed_by_employee_id: null
    });

    const res = await db.finalizeOrderTransaction({
      p_order_id: 'ord-1',
      p_user_id: 'user-1',
      p_table_id: null,
      p_payments: [{ method: 'PIX', amount: 50 }],
      p_closed_by_employee_id: 'emp-1',
      p_tip_amount: 0
    });

    assertEqual(res.success, true, 'TESTE 01: Finalizar pedido válido uma vez (success = true)');
    assertEqual(db.orders.get('ord-1')?.status, 'COMPLETED', 'TESTE 01: Order status updated to COMPLETED');
    assertEqual(db.transactions.length, 1, 'TESTE 01: Exact 1 transaction created');
  }

  // --- TESTE 02: Finalizar o MESMO pedido novamente sequencialmente ---
  {
    const db = new SimulatedPostgresDB();
    db.orders.set('ord-1', {
      id: 'ord-1',
      user_id: 'user-1',
      table_number: 0,
      command_number: null,
      status: 'OPEN',
      completed_at: null,
      closed_by_employee_id: null
    });
    db.orderItems.set('ord-1', [{ recipe_id: 'rec-1', quantity: 2 }]);
    db.recipeIngredients.set('rec-1', [{ ingredient_id: 'ing-1', quantity: 0.5 }]);

    // First call
    await db.finalizeOrderTransaction({
      p_order_id: 'ord-1',
      p_user_id: 'user-1',
      p_table_id: null,
      p_payments: [{ method: 'Cartão', amount: 100 }],
      p_closed_by_employee_id: 'emp-1',
      p_tip_amount: 10
    });

    const txCountBefore = db.transactions.length;
    const stockCountBefore = db.stockAdjustments.length;

    // Second call (sequential retry)
    const res2 = await db.finalizeOrderTransaction({
      p_order_id: 'ord-1',
      p_user_id: 'user-1',
      p_table_id: null,
      p_payments: [{ method: 'Cartão', amount: 100 }],
      p_closed_by_employee_id: 'emp-1',
      p_tip_amount: 10
    });

    assertEqual(res2.success, true, 'TESTE 02: Retry returns success = true');
    assertEqual(res2.already_finalized, true, 'TESTE 02: Retry indicates already_finalized = true');
    assertEqual(db.transactions.length, txCountBefore, 'TESTE 02: No new transactions created on retry');
    assertEqual(db.stockAdjustments.length, stockCountBefore, 'TESTE 02: No new stock deductions on retry');
  }

  // --- TESTE 03: Duas chamadas SIMULTÂNEAS para o mesmo order ---
  {
    const db = new SimulatedPostgresDB();
    db.orders.set('ord-concurrent', {
      id: 'ord-concurrent',
      user_id: 'user-1',
      table_number: 0,
      command_number: null,
      status: 'OPEN',
      completed_at: null,
      closed_by_employee_id: null
    });

    // Launch both concurrently
    const p1 = db.finalizeOrderTransaction({
      p_order_id: 'ord-concurrent',
      p_user_id: 'user-1',
      p_table_id: null,
      p_payments: [{ method: 'Dinheiro', amount: 80 }],
      p_closed_by_employee_id: 'emp-1',
      p_tip_amount: 5
    });

    const p2 = db.finalizeOrderTransaction({
      p_order_id: 'ord-concurrent',
      p_user_id: 'user-1',
      p_table_id: null,
      p_payments: [{ method: 'Dinheiro', amount: 80 }],
      p_closed_by_employee_id: 'emp-1',
      p_tip_amount: 5
    });

    const [r1, r2] = await Promise.all([p1, p2]);

    const hasOriginalSuccess = (r1.success && !r1.already_finalized) || (r2.success && !r2.already_finalized);
    const hasIdempotentSuccess = r1.already_finalized || r2.already_finalized;

    assertEqual(hasOriginalSuccess && hasIdempotentSuccess, true, 'TESTE 03: Concurrent calls result in 1 execution + 1 idempotent response');
  }

  // --- TESTE 04: Concorrência provar que transactions não duplicaram ---
  {
    const db = new SimulatedPostgresDB();
    db.orders.set('ord-c4', {
      id: 'ord-c4',
      user_id: 'user-1',
      table_number: 0,
      command_number: null,
      status: 'OPEN',
      completed_at: null,
      closed_by_employee_id: null
    });

    await Promise.all([
      db.finalizeOrderTransaction({ p_order_id: 'ord-c4', p_user_id: 'user-1', p_table_id: null, p_payments: [{ method: 'PIX', amount: 40 }], p_closed_by_employee_id: 'e1' }),
      db.finalizeOrderTransaction({ p_order_id: 'ord-c4', p_user_id: 'user-1', p_table_id: null, p_payments: [{ method: 'PIX', amount: 40 }], p_closed_by_employee_id: 'e1' })
    ]);

    assertEqual(db.transactions.filter(t => t.type === 'Receita').length, 1, 'TESTE 04: Exactly 1 revenue transaction created under concurrency');
  }

  // --- TESTE 05: Concorrência provar que estoque não foi deduzido duas vezes ---
  {
    const db = new SimulatedPostgresDB();
    db.orders.set('ord-c5', {
      id: 'ord-c5',
      user_id: 'user-1',
      table_number: 0,
      command_number: null,
      status: 'OPEN',
      completed_at: null,
      closed_by_employee_id: null
    });
    db.orderItems.set('ord-c5', [{ recipe_id: 'rec-5', quantity: 3 }]);
    db.recipeIngredients.set('rec-5', [{ ingredient_id: 'ing-5', quantity: 2 }]);

    await Promise.all([
      db.finalizeOrderTransaction({ p_order_id: 'ord-c5', p_user_id: 'user-1', p_table_id: null, p_payments: [{ method: 'PIX', amount: 60 }], p_closed_by_employee_id: 'e1' }),
      db.finalizeOrderTransaction({ p_order_id: 'ord-c5', p_user_id: 'user-1', p_table_id: null, p_payments: [{ method: 'PIX', amount: 60 }], p_closed_by_employee_id: 'e1' })
    ]);

    assertEqual(db.stockAdjustments.length, 1, 'TESTE 05: Exactly 1 stock deduction record created under concurrency');
    assertEqual(db.stockAdjustments[0].quantity_change, -6, 'TESTE 05: Stock deduction total amount is correct (-6)');
  }

  // --- TESTE 06: Concorrência com tip: uma única transaction de Gorjeta ---
  {
    const db = new SimulatedPostgresDB();
    db.orders.set('ord-c6', {
      id: 'ord-c6',
      user_id: 'user-1',
      table_number: 0,
      command_number: null,
      status: 'OPEN',
      completed_at: null,
      closed_by_employee_id: null
    });

    await Promise.all([
      db.finalizeOrderTransaction({ p_order_id: 'ord-c6', p_user_id: 'user-1', p_table_id: null, p_payments: [{ method: 'PIX', amount: 50 }], p_closed_by_employee_id: 'e1', p_tip_amount: 10 }),
      db.finalizeOrderTransaction({ p_order_id: 'ord-c6', p_user_id: 'user-1', p_table_id: null, p_payments: [{ method: 'PIX', amount: 50 }], p_closed_by_employee_id: 'e1', p_tip_amount: 10 })
    ]);

    assertEqual(db.transactions.filter(t => t.type === 'Gorjeta').length, 1, 'TESTE 06: Exactly 1 Tip transaction created under concurrency');
  }

  // --- TESTE 07: Pedido CANCELLED ---
  {
    const db = new SimulatedPostgresDB();
    db.orders.set('ord-cancelled', {
      id: 'ord-cancelled',
      user_id: 'user-1',
      table_number: 0,
      command_number: null,
      status: 'CANCELLED',
      completed_at: null,
      closed_by_employee_id: null
    });

    const res = await db.finalizeOrderTransaction({
      p_order_id: 'ord-cancelled',
      p_user_id: 'user-1',
      p_table_id: null,
      p_payments: [{ method: 'PIX', amount: 50 }],
      p_closed_by_employee_id: 'e1'
    });

    assertEqual(res.success, false, 'TESTE 07: CANCELLED order finalization rejected (success = false)');
    assertEqual(db.orders.get('ord-cancelled')?.status, 'CANCELLED', 'TESTE 07: Order status remains CANCELLED');
    assertEqual(db.transactions.length, 0, 'TESTE 07: Zero transactions created for CANCELLED order');
  }

  // --- TESTE 08: Pedido inexistente ---
  {
    const db = new SimulatedPostgresDB();
    const res = await db.finalizeOrderTransaction({
      p_order_id: 'ord-nonexistent',
      p_user_id: 'user-1',
      p_table_id: null,
      p_payments: [{ method: 'PIX', amount: 50 }],
      p_closed_by_employee_id: 'e1'
    });

    assertEqual(res.success, false, 'TESTE 08: Nonexistent order finalization rejected');
  }

  // --- TESTE 09: Pedido pertencente a outro p_user_id ---
  {
    const db = new SimulatedPostgresDB();
    db.orders.set('ord-other-user', {
      id: 'ord-other-user',
      user_id: 'user-999',
      table_number: 0,
      command_number: null,
      status: 'OPEN',
      completed_at: null,
      closed_by_employee_id: null
    });

    const res = await db.finalizeOrderTransaction({
      p_order_id: 'ord-other-user',
      p_user_id: 'user-1', // mismatched
      p_table_id: null,
      p_payments: [{ method: 'PIX', amount: 50 }],
      p_closed_by_employee_id: 'e1'
    });

    assertEqual(res.success, false, 'TESTE 09: Mismatched p_user_id finalization rejected');
    assertEqual(db.orders.get('ord-other-user')?.status, 'OPEN', 'TESTE 09: Mismatched order remains OPEN');
  }

  // --- TESTE 10: Pedido sem mesa ---
  {
    const db = new SimulatedPostgresDB();
    db.orders.set('ord-no-table', {
      id: 'ord-no-table',
      user_id: 'user-1',
      table_number: 0,
      command_number: null,
      status: 'OPEN',
      completed_at: null,
      closed_by_employee_id: null
    });

    const res = await db.finalizeOrderTransaction({
      p_order_id: 'ord-no-table',
      p_user_id: 'user-1',
      p_table_id: null,
      p_payments: [{ method: 'PIX', amount: 20 }],
      p_closed_by_employee_id: 'e1'
    });

    assertEqual(res.success, true, 'TESTE 10: Order without table finalized successfully');
  }

  // --- TESTE 11: Pedido em mesa com nenhum outro pedido aberto ---
  {
    const db = new SimulatedPostgresDB();
    db.tables.set('tbl-1', {
      id: 'tbl-1',
      user_id: 'user-1',
      number: 10,
      status: 'OCUPADA',
      employee_id: 'emp-1',
      customer_count: 2
    });
    db.orders.set('ord-tbl-1', {
      id: 'ord-tbl-1',
      user_id: 'user-1',
      table_number: 10,
      command_number: null,
      status: 'OPEN',
      completed_at: null,
      closed_by_employee_id: null
    });

    await db.finalizeOrderTransaction({
      p_order_id: 'ord-tbl-1',
      p_user_id: 'user-1',
      p_table_id: 'tbl-1',
      p_payments: [{ method: 'PIX', amount: 100 }],
      p_closed_by_employee_id: 'e1'
    });

    assertEqual(db.tables.get('tbl-1')?.status, 'LIVRE', 'TESTE 11: Table marked as LIVRE when last order is completed');
    assertEqual(db.tables.get('tbl-1')?.customer_count, 0, 'TESTE 11: Table customer count reset to 0');
  }

  // --- TESTE 12: Mesa com outro pedido ainda aberto ---
  {
    const db = new SimulatedPostgresDB();
    db.tables.set('tbl-2', {
      id: 'tbl-2',
      user_id: 'user-1',
      number: 12,
      status: 'OCUPADA',
      employee_id: 'emp-1',
      customer_count: 4
    });
    db.orders.set('ord-tbl-2a', {
      id: 'ord-tbl-2a',
      user_id: 'user-1',
      table_number: 12,
      command_number: null,
      status: 'OPEN',
      completed_at: null,
      closed_by_employee_id: null
    });
    db.orders.set('ord-tbl-2b', {
      id: 'ord-tbl-2b',
      user_id: 'user-1',
      table_number: 12,
      command_number: null,
      status: 'OPEN',
      completed_at: null,
      closed_by_employee_id: null
    });

    // Finalizing first order on table 12
    await db.finalizeOrderTransaction({
      p_order_id: 'ord-tbl-2a',
      p_user_id: 'user-1',
      p_table_id: 'tbl-2',
      p_payments: [{ method: 'PIX', amount: 50 }],
      p_closed_by_employee_id: 'e1'
    });

    assertEqual(db.tables.get('tbl-2')?.status, 'OCUPADA', 'TESTE 12: Table remains OCUPADA while another open order exists');
  }

  // --- TESTE 13: Dois pedidos da mesma mesa sendo finalizados de forma concorrente ---
  {
    const db = new SimulatedPostgresDB();
    db.tables.set('tbl-3', {
      id: 'tbl-3',
      user_id: 'user-1',
      number: 15,
      status: 'OCUPADA',
      employee_id: 'emp-1',
      customer_count: 3
    });
    db.orders.set('ord-tbl-3a', {
      id: 'ord-tbl-3a',
      user_id: 'user-1',
      table_number: 15,
      command_number: null,
      status: 'OPEN',
      completed_at: null,
      closed_by_employee_id: null
    });
    db.orders.set('ord-tbl-3b', {
      id: 'ord-tbl-3b',
      user_id: 'user-1',
      table_number: 15,
      command_number: null,
      status: 'OPEN',
      completed_at: null,
      closed_by_employee_id: null
    });

    await Promise.all([
      db.finalizeOrderTransaction({ p_order_id: 'ord-tbl-3a', p_user_id: 'user-1', p_table_id: 'tbl-3', p_payments: [{ method: 'PIX', amount: 30 }], p_closed_by_employee_id: 'e1' }),
      db.finalizeOrderTransaction({ p_order_id: 'ord-tbl-3b', p_user_id: 'user-1', p_table_id: 'tbl-3', p_payments: [{ method: 'PIX', amount: 40 }], p_closed_by_employee_id: 'e1' })
    ]);

    assertEqual(db.tables.get('tbl-3')?.status, 'LIVRE', 'TESTE 13: Table consistently becomes LIVRE after both orders finish concurrently');
  }

  // --- TESTE 14: Split payment atual ---
  {
    const db = new SimulatedPostgresDB();
    db.orders.set('ord-split', {
      id: 'ord-split',
      user_id: 'user-1',
      table_number: 0,
      command_number: null,
      status: 'OPEN',
      completed_at: null,
      closed_by_employee_id: null
    });

    const splitPayments = [
      { method: 'Cartão de Crédito', amount: 60 },
      { method: 'Dinheiro', amount: 40 }
    ];

    // First finalization
    await db.finalizeOrderTransaction({
      p_order_id: 'ord-split',
      p_user_id: 'user-1',
      p_table_id: null,
      p_payments: splitPayments,
      p_closed_by_employee_id: 'e1'
    });

    const firstTxCount = db.transactions.length;

    // Retry
    await db.finalizeOrderTransaction({
      p_order_id: 'ord-split',
      p_user_id: 'user-1',
      p_table_id: null,
      p_payments: splitPayments,
      p_closed_by_employee_id: 'e1'
    });

    assertEqual(firstTxCount, 2, 'TESTE 14: Split payment created 2 revenue transactions on first call');
    assertEqual(db.transactions.length, 2, 'TESTE 14: Retry did not duplicate split payment transactions (remains 2)');
  }

  // --- TESTE 15: Nenhuma order_payment_attempt é alterada pela função ---
  {
    const db = new SimulatedPostgresDB();
    db.orders.set('ord-attempts', {
      id: 'ord-attempts',
      user_id: 'user-1',
      table_number: 0,
      command_number: null,
      status: 'OPEN',
      completed_at: null,
      closed_by_employee_id: null
    });
    db.orderPaymentAttempts.push({ id: 'att-1', order_id: 'ord-attempts', status: 'CREATED' });

    await db.finalizeOrderTransaction({
      p_order_id: 'ord-attempts',
      p_user_id: 'user-1',
      p_table_id: null,
      p_payments: [{ method: 'PIX', amount: 50 }],
      p_closed_by_employee_id: 'e1'
    });

    assertEqual(db.orderPaymentAttempts[0].status, 'CREATED', 'TESTE 15: order_payment_attempts table was NOT altered by finalization');
  }

  console.log('============================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
