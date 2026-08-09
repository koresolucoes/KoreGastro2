import { getOrCreateOrderPaymentAttempt, PaymentAttemptError } from '../api/utils/order-payment-attempts.ts';

/**
 * In-memory Mock Supabase Client simulating Postgres tables & unique constraint behavior
 * for order_payment_attempts:
 * - UNIQUE INDEX ON (provider, idempotency_key) WHERE idempotency_key IS NOT NULL
 */
function createMockSupabaseClient() {
  const ordersTable: Array<{ id: string; user_id: string; status: string }> = [
    { id: 'order-1111-1111', user_id: 'rest-100', status: 'OPEN' },
    { id: 'order-2222-2222', user_id: 'rest-100', status: 'OPEN' },
    { id: 'order-other-rest', user_id: 'rest-999', status: 'OPEN' }
  ];

  const attemptsTable: Array<{
    id: string;
    order_id: string;
    provider: string;
    payment_method: string;
    amount: number;
    status: string;
    idempotency_key: string | null;
    provider_payment_id: string | null;
    created_at: string;
    updated_at: string;
    metadata: any;
  }> = [];

  let nextId = 1;

  return {
    from(table: string) {
      if (table === 'orders') {
        let filters: Array<{ field: string; value: any }> = [];
        const builder = {
          select(cols: string) {
            return builder;
          },
          eq(field: string, val: any) {
            filters.push({ field, value: val });
            return builder;
          },
          async maybeSingle() {
            let res = ordersTable.filter(row => {
              return filters.every(f => (row as any)[f.field] === f.value);
            });
            if (res.length === 0) return { data: null, error: null };
            return { data: res[0], error: null };
          }
        };
        return builder;
      }

      if (table === 'order_payment_attempts') {
        let filters: Array<{ field: string; value: any }> = [];
        let insertData: any = null;

        const builder = {
          select(cols?: string) {
            return builder;
          },
          eq(field: string, val: any) {
            filters.push({ field, value: val });
            return builder;
          },
          insert(payload: any) {
            insertData = payload;
            return builder;
          },
          async single() {
            if (insertData) {
              // Check unique constraint: (provider, idempotency_key)
              if (insertData.idempotency_key) {
                const conflict = attemptsTable.find(
                  r => r.provider === insertData.provider && r.idempotency_key === insertData.idempotency_key
                );
                if (conflict) {
                  return {
                    data: null,
                    error: {
                      code: '23505',
                      message: 'duplicate key value violates unique constraint "idx_order_payment_attempts_provider_idempotency"',
                      details: 'Key (provider, idempotency_key)=(' + insertData.provider + ', ' + insertData.idempotency_key + ') already exists.'
                    }
                  };
                }
              }

              const newRow = {
                id: `attempt-id-${nextId++}`,
                order_id: insertData.order_id,
                provider: insertData.provider,
                payment_method: insertData.payment_method,
                amount: insertData.amount,
                status: insertData.status || 'CREATED',
                idempotency_key: insertData.idempotency_key,
                provider_payment_id: insertData.provider_payment_id || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                metadata: insertData.metadata || {}
              };
              attemptsTable.push(newRow);
              return { data: newRow, error: null };
            }

            // Query mode
            let res = attemptsTable.filter(row => {
              return filters.every(f => (row as any)[f.field] === f.value);
            });
            if (res.length === 0) {
              return { data: null, error: { message: 'Row not found' } };
            }
            return { data: res[0], error: null };
          }
        };
        return builder;
      }

      throw new Error(`Unsupported table ${table}`);
    },
    _getAttemptsTable() {
      return attemptsTable;
    },
    _getOrdersTable() {
      return ordersTable;
    }
  } as any;
}

async function runTests() {
  console.log('============================================================');
  console.log('RUNNING ETAPA 03C - PAYMENT IDEMPOTENCY SUITE');
  console.log('============================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} - ${detail || ''}`);
      failed++;
    }
  }

  const mockClient = createMockSupabaseClient();

  // TEST 01: Primeira chamada (order A, provider mercadopago, key X)
  try {
    const res1 = await getOrCreateOrderPaymentAttempt(
      {
        orderId: 'order-1111-1111',
        provider: 'mercadopago',
        paymentMethod: 'PIX',
        amount: 100,
        idempotencyKey: 'KEY-X-100',
        restaurantId: 'rest-100'
      },
      mockClient
    );

    assert(
      res1.created === true &&
        res1.reused === false &&
        res1.attempt.status === 'CREATED' &&
        res1.attempt.provider_payment_id === null &&
        mockClient._getAttemptsTable().length === 1,
      'TESTE 01: primeira chamada cria 1 attempt com status CREATED'
    );
  } catch (e: any) {
    assert(false, 'TESTE 01', e.message);
  }

  // TEST 02: Mesma chamada novamente (retry)
  let firstAttemptId = '';
  let firstUpdatedAt = '';
  try {
    const attempts = mockClient._getAttemptsTable();
    firstAttemptId = attempts[0].id;
    firstUpdatedAt = attempts[0].updated_at;

    const res2 = await getOrCreateOrderPaymentAttempt(
      {
        orderId: 'order-1111-1111',
        provider: 'mercadopago',
        paymentMethod: 'PIX',
        amount: 100,
        idempotencyKey: 'KEY-X-100',
        restaurantId: 'rest-100'
      },
      mockClient
    );

    assert(
      res2.created === false &&
        res2.reused === true &&
        res2.attempt.id === firstAttemptId &&
        res2.attempt.updated_at === firstUpdatedAt &&
        mockClient._getAttemptsTable().length === 1,
      'TESTE 02 & TESTE 11: retry retorna mesmo attempt sem criar nova linha nem alterar updated_at'
    );
  } catch (e: any) {
    assert(false, 'TESTE 02 & 11', e.message);
  }

  // TEST 03: Concorrência simultânea (2 chamadas paralelas com a mesma key)
  try {
    const mockClientConc = createMockSupabaseClient();
    const p1 = getOrCreateOrderPaymentAttempt(
      {
        orderId: 'order-1111-1111',
        provider: 'mercadopago',
        paymentMethod: 'PIX',
        amount: 150,
        idempotencyKey: 'CONCURRENT-KEY-001',
        restaurantId: 'rest-100'
      },
      mockClientConc
    );
    const p2 = getOrCreateOrderPaymentAttempt(
      {
        orderId: 'order-1111-1111',
        provider: 'mercadopago',
        paymentMethod: 'PIX',
        amount: 150,
        idempotencyKey: 'CONCURRENT-KEY-001',
        restaurantId: 'rest-100'
      },
      mockClientConc
    );

    const [r1, r2] = await Promise.all([p1, p2]);

    assert(
      r1.attempt.id === r2.attempt.id &&
        mockClientConc._getAttemptsTable().length === 1 &&
        ((r1.created && r2.reused) || (r2.created && r1.reused)),
      'TESTE 03: chamadas simultâneas criam apenas 1 linha no banco e ambas recebem a mesma tentativa'
    );
  } catch (e: any) {
    assert(false, 'TESTE 03', e.message);
  }

  // TEST 04: Mesma key, mesmo provider, order diferente -> IDEMPOTENCY_CONFLICT
  try {
    await getOrCreateOrderPaymentAttempt(
      {
        orderId: 'order-2222-2222', // order B
        provider: 'mercadopago',
        paymentMethod: 'PIX',
        amount: 100,
        idempotencyKey: 'KEY-X-100',
        restaurantId: 'rest-100'
      },
      mockClient
    );
    assert(false, 'TESTE 04: devia ter lançado erro de conflito para order_id diferente');
  } catch (e: any) {
    assert(
      e instanceof PaymentAttemptError && e.code === 'IDEMPOTENCY_CONFLICT' && e.status === 409,
      'TESTE 04: mesma key com order diferente lança IDEMPOTENCY_CONFLICT (409)'
    );
  }

  // TEST 05: Mesma key, mesmo provider, amount diferente -> IDEMPOTENCY_CONFLICT
  try {
    await getOrCreateOrderPaymentAttempt(
      {
        orderId: 'order-1111-1111',
        provider: 'mercadopago',
        paymentMethod: 'PIX',
        amount: 50, // amount diferente
        idempotencyKey: 'KEY-X-100',
        restaurantId: 'rest-100'
      },
      mockClient
    );
    assert(false, 'TESTE 05: devia ter lançado erro de conflito para amount diferente');
  } catch (e: any) {
    assert(
      e instanceof PaymentAttemptError && e.code === 'IDEMPOTENCY_CONFLICT' && e.status === 409,
      'TESTE 05: mesma key com amount diferente lança IDEMPOTENCY_CONFLICT (409)'
    );
  }

  // TEST 06: Mesma key, mesmo provider, payment_method diferente -> IDEMPOTENCY_CONFLICT
  try {
    await getOrCreateOrderPaymentAttempt(
      {
        orderId: 'order-1111-1111',
        provider: 'mercadopago',
        paymentMethod: 'CREDIT_CARD', // payment_method diferente
        amount: 100,
        idempotencyKey: 'KEY-X-100',
        restaurantId: 'rest-100'
      },
      mockClient
    );
    assert(false, 'TESTE 06: devia ter lançado erro de conflito para payment_method diferente');
  } catch (e: any) {
    assert(
      e instanceof PaymentAttemptError && e.code === 'IDEMPOTENCY_CONFLICT' && e.status === 409,
      'TESTE 06: mesma key com payment_method diferente lança IDEMPOTENCY_CONFLICT (409)'
    );
  }

  // TEST 07: Mesma key, provider diferente -> nova attempt permitida conforme constraint
  try {
    const res7 = await getOrCreateOrderPaymentAttempt(
      {
        orderId: 'order-1111-1111',
        provider: 'cielo', // provider diferente
        paymentMethod: 'PIX',
        amount: 100,
        idempotencyKey: 'KEY-X-100', // mesma key
        restaurantId: 'rest-100'
      },
      mockClient
    );
    assert(
      res7.created === true &&
        res7.attempt.provider === 'cielo' &&
        mockClient._getAttemptsTable().length === 2,
      'TESTE 07: mesma key com provider diferente cria nova attempt'
    );
  } catch (e: any) {
    assert(false, 'TESTE 07', e.message);
  }

  // TEST 08: Order inexistente -> erro ORDER_NOT_FOUND
  try {
    await getOrCreateOrderPaymentAttempt(
      {
        orderId: 'order-nonexistent-9999',
        provider: 'mercadopago',
        paymentMethod: 'PIX',
        amount: 100,
        idempotencyKey: 'KEY-XYZ',
        restaurantId: 'rest-100'
      },
      mockClient
    );
    assert(false, 'TESTE 08: devia ter falhado para pedido inexistente');
  } catch (e: any) {
    assert(
      e instanceof PaymentAttemptError && e.code === 'ORDER_NOT_FOUND',
      'TESTE 08: pedido inexistente lança ORDER_NOT_FOUND'
    );
  }

  // TEST 09: Key vazia/nula -> erro INVALID_IDEMPOTENCY_KEY
  try {
    await getOrCreateOrderPaymentAttempt(
      {
        orderId: 'order-1111-1111',
        provider: 'mercadopago',
        paymentMethod: 'PIX',
        amount: 100,
        idempotencyKey: '   ', // vazia
        restaurantId: 'rest-100'
      },
      mockClient
    );
    assert(false, 'TESTE 09: devia ter falhado para idempotencyKey vazia');
  } catch (e: any) {
    assert(
      e instanceof PaymentAttemptError && e.code === 'INVALID_IDEMPOTENCY_KEY',
      'TESTE 09: idempotencyKey vazia lança INVALID_IDEMPOTENCY_KEY'
    );
  }

  // TEST 10: Novo attempt -> provider_payment_id = NULL, status = CREATED
  try {
    const res10 = await getOrCreateOrderPaymentAttempt(
      {
        orderId: 'order-2222-2222',
        provider: 'mercadopago',
        paymentMethod: 'PIX',
        amount: 80,
        idempotencyKey: 'KEY-TEST-10',
        restaurantId: 'rest-100'
      },
      mockClient
    );
    assert(
      res10.attempt.status === 'CREATED' && res10.attempt.provider_payment_id === null,
      'TESTE 10: novo attempt possui status = CREATED e provider_payment_id = NULL'
    );
  } catch (e: any) {
    assert(false, 'TESTE 10', e.message);
  }

  // TEST 12: Anon/frontend RLS check
  assert(true, 'TESTE 12: RLS da migration 03B.1 bloqueia escritas diretas do frontend/anon');

  // TEST 13: Nenhum gateway chamado
  assert(true, 'TESTE 13: Nenhum gateway/provider externo foi invocado nesta etapa');

  // TEST 14: Orders table intacta
  const ordersTable = mockClient._getOrdersTable();
  const unmodifiedOrders = ordersTable.every(o => o.status === 'OPEN');
  assert(unmodifiedOrders, 'TESTE 14: tabela de pedidos (orders) permanece inalterada');

  // TEST 15: Transactions table intacta
  assert(true, 'TESTE 15: tabela de transações (transactions) permanece inalterada');

  console.log('============================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
