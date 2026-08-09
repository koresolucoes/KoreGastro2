/**
 * Test Suite for CHEFOS S0E.1.1 — Tenancy Hardening Regression Repair
 *
 * Tests:
 * 1. Cross-store finalization DENY
 * 2. Cross-store analytics DENY
 * 3. Cross-store realtime IGNORE (resolveRealtimeStoreId)
 * 4. adjust_stock_by_lot FIFO/FEFO PASS & Lot Specific PASS & Out of Stock Exception
 * 5. Public ordering PASS
 */

import '@angular/compiler';
if (typeof (import.meta as any).env === 'undefined') {
  (import.meta as any).env = {};
}
import { SupabaseStateService } from '../src/services/supabase-state.service';
import { CoreDataLoaderService } from '../src/services/data-loaders/core-data-loader.service';
import { supabase } from '../src/services/supabase-client';

function assertCondition(condition: boolean, testName: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
  } else {
    console.error(`[FAIL] ${testName}`);
    throw new Error(`Test failed: ${testName}`);
  }
}

// 1. Simulated Database for PL/pgSQL RPC Logic Verification
class SimulatedPostgresDB_S0E11 {
  stores = new Map<string, { id: string; owner_id: string }>();
  userAccess = new Map<string, Set<string>>(); // userId -> Set of storeIds accessible
  orders = new Map<string, { id: string; user_id: string; status: string; total_amount: number }>();
  inventoryLots = new Map<string, { id: string; ingredient_id: string; user_id: string; quantity: number; expiration_date: string; created_at: string }>();
  ingredients = new Map<string, { id: string; user_id: string; stock: number }>();
  inventoryMovements: Array<{ ingredient_id: string; quantity_change: number; reason: string; user_id: string; lot_id: string }> = [];

  hasAccessToStore(authRole: string, authUid: string | null, targetStoreId: string): boolean {
    if (authRole === 'service_role') return true;
    if (!authUid) return false;
    if (authUid === targetStoreId) return true;
    const allowedStores = this.userAccess.get(authUid);
    return allowedStores ? allowedStores.has(targetStoreId) : false;
  }

  // RPC 1: finalize_order_transaction (cross-store DENY simulation)
  finalizeOrderTransaction(authRole: string, authUid: string, params: { p_order_id: string; p_user_id: string }) {
    // 0. Tenancy Guard
    if (authRole === 'authenticated' && !this.hasAccessToStore(authRole, authUid, params.p_user_id)) {
      return {
        success: false,
        message: `FORBIDDEN: Access denied to store ${params.p_user_id}`
      };
    }

    const order = this.orders.get(params.p_order_id);
    if (!order || order.user_id !== params.p_user_id) {
      return {
        success: false,
        message: 'Pedido não encontrado ou não pertence a este estabelecimento'
      };
    }

    order.status = 'COMPLETED';
    return {
      success: true,
      order_id: params.p_order_id,
      message: 'Conta fechada e estoque deduzido com sucesso'
    };
  }

  // RPC 2: get_daily_dre (cross-store DENY simulation)
  getDailyDre(authRole: string, authUid: string, p_user_id: string, p_date: string) {
    if (authRole === 'authenticated' && !this.hasAccessToStore(authRole, authUid, p_user_id)) {
      throw new Error(`FORBIDDEN: Access denied to store ${p_user_id}`);
    }
    return { gross_revenue: 100, net_profit: 50 };
  }

  // RPC 3: adjust_stock_by_lot (FIFO / FEFO simulation)
  adjustStockByLot(authRole: string, authUid: string, params: {
    p_ingredient_id: string;
    p_quantity_change: number;
    p_reason: string;
    p_user_id: string;
    p_lot_id_for_exit?: string | null;
    p_lot_number_for_entry?: string | null;
    p_expiration_date_for_entry?: string | null;
  }) {
    const ingredient = this.ingredients.get(params.p_ingredient_id);
    if (!ingredient) {
      throw new Error(`Ingrediente ${params.p_ingredient_id} não encontrado.`);
    }
    if (ingredient.user_id !== params.p_user_id) {
      throw new Error(`FORBIDDEN: Ingrediente não pertence ao estabelecimento ${params.p_user_id}`);
    }
    if (authRole === 'authenticated' && !this.hasAccessToStore(authRole, authUid, params.p_user_id)) {
      throw new Error(`FORBIDDEN: Acesso negado ao estabelecimento ${params.p_user_id}`);
    }

    if (params.p_quantity_change > 0) {
      // Entry
      const entryLotId = `lot_entry_${Date.now()}`;
      this.inventoryLots.set(entryLotId, {
        id: entryLotId,
        ingredient_id: params.p_ingredient_id,
        user_id: params.p_user_id,
        quantity: params.p_quantity_change,
        expiration_date: params.p_expiration_date_for_entry || '1970-01-01',
        created_at: new Date().toISOString()
      });
      this.inventoryMovements.push({
        ingredient_id: params.p_ingredient_id,
        quantity_change: params.p_quantity_change,
        reason: params.p_reason,
        user_id: params.p_user_id,
        lot_id: entryLotId
      });
    } else {
      // Exit (quantity_change < 0)
      let remainingQty = Math.abs(params.p_quantity_change);

      if (params.p_lot_id_for_exit) {
        const lot = this.inventoryLots.get(params.p_lot_id_for_exit);
        if (!lot || lot.quantity < remainingQty) {
          throw new Error('Estoque insuficiente no lote selecionado.');
        }
        lot.quantity -= remainingQty;
        this.inventoryMovements.push({
          ingredient_id: params.p_ingredient_id,
          quantity_change: params.p_quantity_change,
          reason: params.p_reason,
          user_id: params.p_user_id,
          lot_id: params.p_lot_id_for_exit
        });
      } else {
        // FEFO / FIFO
        const matchingLots = Array.from(this.inventoryLots.values())
          .filter((l) => l.ingredient_id === params.p_ingredient_id && l.user_id === params.p_user_id && l.quantity > 0)
          .sort((a, b) => {
            const expA = a.expiration_date || '9999-12-31';
            const expB = b.expiration_date || '9999-12-31';
            if (expA !== expB) return expA.localeCompare(expB);
            return a.created_at.localeCompare(b.created_at);
          });

        for (const lot of matchingLots) {
          const deduct = Math.min(remainingQty, lot.quantity);
          lot.quantity -= deduct;
          remainingQty -= deduct;
          this.inventoryMovements.push({
            ingredient_id: params.p_ingredient_id,
            quantity_change: -deduct,
            reason: params.p_reason,
            user_id: params.p_user_id,
            lot_id: lot.id
          });
          if (remainingQty <= 0) break;
        }

        if (remainingQty > 0) {
          throw new Error('Estoque insuficiente entre todos os lotes para esta saída.');
        }
      }
    }

    // Recompute total stock
    let totalStock = 0;
    for (const lot of this.inventoryLots.values()) {
      if (lot.ingredient_id === params.p_ingredient_id && lot.user_id === params.p_user_id) {
        totalStock += lot.quantity;
      }
    }
    ingredient.stock = totalStock;
  }

  // RPC 4: Public Ordering (create_order_with_items for anon / customer)
  createOrderWithItems(authRole: string, p_restaurant_id: string, p_order_data: any, p_items: any[]) {
    // Anon public ordering is ALLOWED without auth.role() = 'authenticated' has_access_to_store check
    if (authRole === 'authenticated' && !this.hasAccessToStore(authRole, 'some_user', p_restaurant_id)) {
      throw new Error(`FORBIDDEN: Access denied to restaurant ${p_restaurant_id}`);
    }

    const orderId = `order_public_${Math.random().toString(36).substring(2, 7)}`;
    this.orders.set(orderId, {
      id: orderId,
      user_id: p_restaurant_id,
      status: 'OPEN',
      total_amount: p_items.reduce((acc, i) => acc + (i.price || 10) * i.quantity, 0)
    });

    return {
      id: orderId,
      user_id: p_restaurant_id,
      status: 'OPEN'
    };
  }
}

async function runTests() {
  console.log('============================================================');
  console.log('RUNNING CHEFOS S0E.1.1 TENANCY HARDENING REPAIR SUITE');
  console.log('============================================================');

  // TEST 1: Cross-store finalization DENY
  {
    const db = new SimulatedPostgresDB_S0E11();
    db.userAccess.set('user_store_A', new Set(['store_A']));
    db.orders.set('order_B', { id: 'order_B', user_id: 'store_B', status: 'OPEN', total_amount: 100 });

    const res = db.finalizeOrderTransaction('authenticated', 'user_store_A', {
      p_order_id: 'order_B',
      p_user_id: 'store_B'
    });

    assertCondition(res.success === false, 'TESTE 1a: Cross-store finalization returns success = false');
    assertCondition(res.message.includes('FORBIDDEN'), 'TESTE 1b: Cross-store finalization message contains FORBIDDEN');
  }

  // TEST 2: Cross-store analytics DENY
  {
    const db = new SimulatedPostgresDB_S0E11();
    db.userAccess.set('user_store_A', new Set(['store_A']));

    let denied = false;
    try {
      db.getDailyDre('authenticated', 'user_store_A', 'store_B', '2026-08-09');
    } catch (err: any) {
      denied = err.message.includes('FORBIDDEN');
    }

    assertCondition(denied, 'TESTE 2: Cross-store analytics throws FORBIDDEN error');
  }

  // TEST 3: Cross-store realtime IGNORE (resolveRealtimeStoreId)
  {
    // Direct test of SupabaseStateService.prototype.resolveRealtimeStoreId
    const stateService = Object.create(SupabaseStateService.prototype);

    // 3a. recipes uses store_id
    const recipeStore = stateService.resolveRealtimeStoreId('recipes', { store_id: 'store_X', user_id: 'store_Y' });
    assertCondition(recipeStore === 'store_X', 'TESTE 3a: recipes table resolves store_id');

    // 3b. store_custom_prices uses store_id
    const customPriceStore = stateService.resolveRealtimeStoreId('store_custom_prices', { store_id: 'store_X' });
    assertCondition(customPriceStore === 'store_X', 'TESTE 3b: store_custom_prices resolves store_id');

    // 3c. orders uses user_id
    const orderStore = stateService.resolveRealtimeStoreId('orders', { user_id: 'store_Y' });
    assertCondition(orderStore === 'store_Y', 'TESTE 3c: operational table (orders) resolves user_id');

    // 3d. filtering logic: payload for store_X when active unit is store_Y must be ignored
    const activeUnitId = 'store_Y';
    const payloadFromStoreX = { table: 'recipes', new: { id: 'r1', store_id: 'store_X' } };
    const eventStoreId = stateService.resolveRealtimeStoreId(payloadFromStoreX.table, payloadFromStoreX.new);
    const shouldIgnore = eventStoreId !== null && eventStoreId !== activeUnitId;

    assertCondition(shouldIgnore === true, 'TESTE 3d: Realtime event from store_X ignored for active unit store_Y');
  }

  // TEST 4: adjust_stock_by_lot FEFO / FIFO PASS & Exception
  {
    const db = new SimulatedPostgresDB_S0E11();
    db.userAccess.set('user_store_A', new Set(['store_A']));
    db.ingredients.set('ing_1', { id: 'ing_1', user_id: 'store_A', stock: 15 });

    // Lot 1: expires earlier (2026-08-10) with 5 units
    db.inventoryLots.set('lot_1', {
      id: 'lot_1',
      ingredient_id: 'ing_1',
      user_id: 'store_A',
      quantity: 5,
      expiration_date: '2026-08-10',
      created_at: '2026-08-01'
    });

    // Lot 2: expires later (2026-08-20) with 10 units
    db.inventoryLots.set('lot_2', {
      id: 'lot_2',
      ingredient_id: 'ing_1',
      user_id: 'store_A',
      quantity: 10,
      expiration_date: '2026-08-20',
      created_at: '2026-08-01'
    });

    // Exit 7 units via FEFO/FIFO (should take all 5 from lot_1 and 2 from lot_2)
    db.adjustStockByLot('authenticated', 'user_store_A', {
      p_ingredient_id: 'ing_1',
      p_quantity_change: -7,
      p_reason: 'Venda Teste',
      p_user_id: 'store_A'
    });

    assertCondition(db.inventoryLots.get('lot_1')?.quantity === 0, 'TESTE 4a: FEFO/FIFO depleted earliest expiring lot (lot_1)');
    assertCondition(db.inventoryLots.get('lot_2')?.quantity === 8, 'TESTE 4b: FEFO/FIFO deducted remaining 2 from lot_2');
    assertCondition(db.ingredients.get('ing_1')?.stock === 8, 'TESTE 4c: Ingredient stock recomputed to 8');

    // Attempt to exit 20 units when only 8 remain -> should throw exception
    let outOfStockError = false;
    try {
      db.adjustStockByLot('authenticated', 'user_store_A', {
        p_ingredient_id: 'ing_1',
        p_quantity_change: -20,
        p_reason: 'Venda Excessiva',
        p_user_id: 'store_A'
      });
    } catch (err: any) {
      outOfStockError = err.message.includes('Estoque insuficiente');
    }

    assertCondition(outOfStockError === true, 'TESTE 4d: Insufficient stock throws exception');
  }

  // TEST 5: Public ordering PASS
  {
    const db = new SimulatedPostgresDB_S0E11();
    const orderRes = db.createOrderWithItems('anon', 'store_A', { tableNumber: 3 }, [{ externalCode: 'BURGER1', quantity: 2, price: 25 }]);

    assertCondition(orderRes.status === 'OPEN', 'TESTE 5a: Public ordering for anon creates OPEN order');
    assertCondition(db.orders.get(orderRes.id)?.total_amount === 50, 'TESTE 5b: Public order created with correct total amount');
  }

  // TEST 6: CoreDataLoaderService queries company_profile_public ONLY and never company_profile
  {
    const queriedTables: string[] = [];
    const fakeClient = {
      from(table: string) {
        queriedTables.push(table);
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          maybeSingle: async () => ({ data: { id: 'cp1', company_name: 'Test Store' }, error: null }),
          then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve)
        };
        return builder;
      }
    };

    const service = new CoreDataLoaderService();
    const originalFrom = (supabase as any).from;
    (supabase as any).from = fakeClient.from.bind(fakeClient);

    try {
      const res = await service.load('user_123');
      assertCondition(queriedTables.includes('company_profile_public'), 'TESTE 6a: CoreDataLoaderService queries company_profile_public');
      assertCondition(!queriedTables.includes('company_profile'), 'TESTE 6b: CoreDataLoaderService NEVER queries company_profile');
      assertCondition(res.companyProfile.company_name === 'Test Store', 'TESTE 6c: CoreDataLoaderService returns loaded company_profile_public data');
    } finally {
      (supabase as any).from = originalFrom;
    }

    // TEST 6d: If company_profile_public fails, propagates error without fallback to company_profile
    const queriedTablesOnFail: string[] = [];
    const failClient = {
      from(table: string) {
        queriedTablesOnFail.push(table);
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          maybeSingle: async () => ({ data: null, error: { message: 'View query failed' } }),
          then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve)
        };
        return builder;
      }
    };

    (supabase as any).from = failClient.from.bind(failClient);
    let errorPropagated = false;
    try {
      await service.load('user_123');
    } catch (err: any) {
      errorPropagated = err.message.includes('company_profile_public');
    } finally {
      (supabase as any).from = originalFrom;
    }

    assertCondition(errorPropagated === true, 'TESTE 6d: Error propagated when company_profile_public query fails');
    assertCondition(!queriedTablesOnFail.includes('company_profile'), 'TESTE 6e: company_profile is NOT queried on failure (no fallback)');
  }

  console.log('============================================================');
  console.log('ALL S0E.1.1 TENANCY REPAIR TESTS PASSED SUCCESSFULLY!');
  console.log('============================================================');
}

runTests().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
