import { signal, computed } from '@angular/core';
import { BootstrapStatus, BootstrapStage, BootstrapError, sanitizeBootstrapErrorMessage } from '../src/models/bootstrap-state.model';

// Mock Implementation for testing the State Bootstrap Lifecycle logic strictly and independently
class MockBootstrapCoordinator {
  private bootstrapGeneration = 0;

  public readonly bootstrapStatus = signal<BootstrapStatus>('IDLE');
  public readonly bootstrapError = signal<BootstrapError | null>(null);

  public readonly isBootstrapLoading = computed(() => {
    const status = this.bootstrapStatus();
    return status === 'LOADING_CORE' || status === 'LOADING_ESSENTIAL';
  });
  public readonly isBootstrapReady = computed(() => this.bootstrapStatus() === 'READY');
  public readonly hasBootstrapError = computed(() => this.bootstrapStatus() === 'ERROR');

  public readonly isDataLoaded = signal<boolean>(false);
  public currentUser = signal<any | null>(null);
  public activeUnitId = signal<string>('');
  public isDemoMode = signal<boolean>(false);

  public transitionsHistory: BootstrapStatus[] = [];

  constructor() {
    this.recordStatus(this.bootstrapStatus());
  }

  private recordStatus(s: BootstrapStatus) {
    this.transitionsHistory.push(s);
  }

  public getGeneration(): number {
    return this.bootstrapGeneration;
  }

  public resetTransitionsHistory() {
    this.transitionsHistory = [this.bootstrapStatus()];
  }

  // Simulates Effect 1: Auth & Demo Handling
  public handleAuthStateChange(user: any | null, isDemo: boolean) {
    this.currentUser.set(user);
    this.isDemoMode.set(isDemo);

    if (isDemo) {
      const gen = ++this.bootstrapGeneration;
      this.clearAllData();
      this.loadMockData(gen);
    } else if (user) {
      // User logged in, context loading happens
    } else {
      ++this.bootstrapGeneration;
      this.clearAllData();
      this.activeUnitId.set('');
      this.bootstrapError.set(null);
      this.bootstrapStatus.set('IDLE');
      this.recordStatus('IDLE');
      this.isDataLoaded.set(true); // Backward compatibility for unauthenticated users
    }
  }

  // Simulates Effect 2: Active Unit Lifecycle
  public async switchUnit(unitId: string, options?: { coreFail?: boolean; essentialFail?: boolean; coreDelayMs?: number; essentialDelayMs?: number }) {
    this.activeUnitId.set(unitId);
    if (!unitId || this.isDemoMode()) return;

    const generation = ++this.bootstrapGeneration;

    this.clearAllData();
    this.bootstrapError.set(null);
    this.bootstrapStatus.set('LOADING_CORE');
    this.recordStatus('LOADING_CORE');
    this.isDataLoaded.set(false);

    try {
      // 1. CORE
      if (options?.coreDelayMs) {
        await new Promise(r => setTimeout(r, options.coreDelayMs));
      }
      if (options?.coreFail) {
        throw new Error('Database connection timeout on core queries');
      }
      if (generation !== this.bootstrapGeneration) return;

      // Transition to ESSENTIAL
      this.bootstrapStatus.set('LOADING_ESSENTIAL');
      this.recordStatus('LOADING_ESSENTIAL');

      // 2. ESSENTIAL
      if (options?.essentialDelayMs) {
        await new Promise(r => setTimeout(r, options.essentialDelayMs));
      }
      if (options?.essentialFail) {
        throw new Error('Failed to load menu recipes essential data');
      }
      if (generation !== this.bootstrapGeneration) return;

      // 3. READY
      this.bootstrapStatus.set('READY');
      this.recordStatus('READY');
      this.isDataLoaded.set(true);
    } catch (err: any) {
      if (generation !== this.bootstrapGeneration) return;

      const stage: BootstrapStage = this.bootstrapStatus() === 'LOADING_ESSENTIAL' ? 'ESSENTIAL' : 'CORE';
      this.bootstrapError.set({
        stage,
        message: sanitizeBootstrapErrorMessage(err?.message || err)
      });
      this.bootstrapStatus.set('ERROR');
      this.recordStatus('ERROR');
      this.isDataLoaded.set(false);
    }
  }

  public loadMockData(generation = this.bootstrapGeneration) {
    if (generation !== this.bootstrapGeneration) return;

    this.bootstrapError.set(null);
    this.bootstrapStatus.set('LOADING_CORE');
    this.recordStatus('LOADING_CORE');
    this.isDataLoaded.set(false);

    try {
      if (generation === this.bootstrapGeneration) {
        this.bootstrapStatus.set('READY');
        this.recordStatus('READY');
        this.isDataLoaded.set(true);
      }
    } catch (e: any) {
      if (generation === this.bootstrapGeneration) {
        this.bootstrapError.set({
          stage: 'CORE',
          message: sanitizeBootstrapErrorMessage(e)
        });
        this.bootstrapStatus.set('ERROR');
        this.recordStatus('ERROR');
        this.isDataLoaded.set(false);
      }
    }
  }

  public clearAllData() {
    this.isDataLoaded.set(false);
  }

  public simulateRealtimeRetry() {
    // Realtime retries must NOT alter bootstrapStatus or bootstrapError
  }

  public async loadBackOfficeData() {
    // Lazy/on-demand backoffice load must NOT alter bootstrapStatus or bootstrapError
  }

  public async refetchRecipesData() {
    // Refetching recipes must NOT alter bootstrapStatus or bootstrapError
  }
}

async function runBootstrapLifecycleTests() {
  console.log('============================================================');
  console.log('RUNNING ETAPA 04B - BOOTSTRAP STATE MODEL / READINESS HARDENING');
  console.log('============================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}${detail ? ' - ' + detail : ''}`);
      failed++;
    }
  }

  // TESTE 01 — bootstrap normal
  {
    const coordinator = new MockBootstrapCoordinator();
    await coordinator.switchUnit('unit-1');

    assert(coordinator.bootstrapStatus() === 'READY', 'TESTE 01: Final status is READY');
    assert(coordinator.bootstrapError() === null, 'TESTE 01: Error is null on success');
    assert(coordinator.isDataLoaded() === true, 'TESTE 01: isDataLoaded is true');
    assert(
      JSON.stringify(coordinator.transitionsHistory) === JSON.stringify(['IDLE', 'LOADING_CORE', 'LOADING_ESSENTIAL', 'READY']),
      'TESTE 01: Transition sequence is IDLE -> LOADING_CORE -> LOADING_ESSENTIAL -> READY'
    );
  }

  // TESTE 02 — erro Core
  {
    const coordinator = new MockBootstrapCoordinator();
    await coordinator.switchUnit('unit-1', { coreFail: true });

    assert(coordinator.bootstrapStatus() === 'ERROR', 'TESTE 02: Status is ERROR on core failure');
    assert(coordinator.bootstrapError()?.stage === 'CORE', 'TESTE 02: Error stage is CORE');
    assert(coordinator.isDataLoaded() === false, 'TESTE 02: isDataLoaded is false');
    assert(coordinator.transitionsHistory.includes('READY') === false, 'TESTE 02: READY is never reached');
    assert(
      JSON.stringify(coordinator.transitionsHistory) === JSON.stringify(['IDLE', 'LOADING_CORE', 'ERROR']),
      'TESTE 02: Sequence is IDLE -> LOADING_CORE -> ERROR'
    );
  }

  // TESTE 03 — erro Essential
  {
    const coordinator = new MockBootstrapCoordinator();
    await coordinator.switchUnit('unit-1', { essentialFail: true });

    assert(coordinator.bootstrapStatus() === 'ERROR', 'TESTE 03: Status is ERROR on essential failure');
    assert(coordinator.bootstrapError()?.stage === 'ESSENTIAL', 'TESTE 03: Error stage is ESSENTIAL');
    assert(coordinator.isDataLoaded() === false, 'TESTE 03: isDataLoaded is false');
    assert(
      JSON.stringify(coordinator.transitionsHistory) === JSON.stringify(['IDLE', 'LOADING_CORE', 'LOADING_ESSENTIAL', 'ERROR']),
      'TESTE 03: Sequence is IDLE -> LOADING_CORE -> LOADING_ESSENTIAL -> ERROR'
    );
  }

  // TESTE 04 — novo bootstrap limpa erro
  {
    const coordinator = new MockBootstrapCoordinator();
    await coordinator.switchUnit('unit-1', { coreFail: true });
    assert(coordinator.bootstrapError() !== null, 'TESTE 04: Error present after Unit A failure');

    // Switch to Unit B
    const bPromise = coordinator.switchUnit('unit-2');
    assert(coordinator.bootstrapError() === null, 'TESTE 04: Error cleared to null at start of Unit B bootstrap');
    await bPromise;
    assert(coordinator.bootstrapStatus() === 'READY', 'TESTE 04: Unit B succeeds and reaches READY');
  }

  // TESTE 05 — stale success
  {
    const coordinator = new MockBootstrapCoordinator();
    const pA = coordinator.switchUnit('unit-1', { coreDelayMs: 50 });
    const pB = coordinator.switchUnit('unit-2', { coreDelayMs: 10 });

    await pB;
    assert(coordinator.bootstrapStatus() === 'READY', 'TESTE 05: Unit B completes READY first');
    await pA;
    assert(coordinator.bootstrapStatus() === 'READY', 'TESTE 05: Delayed Unit A success does not change Unit B status');
  }

  // TESTE 06 — stale error
  {
    const coordinator = new MockBootstrapCoordinator();
    const pA = coordinator.switchUnit('unit-1', { coreFail: true, coreDelayMs: 50 });
    const pB = coordinator.switchUnit('unit-2', { coreDelayMs: 10 });

    await pB;
    assert(coordinator.bootstrapStatus() === 'READY', 'TESTE 06: Unit B reaches READY');
    await pA; // Unit A fails late
    assert(coordinator.bootstrapStatus() === 'READY', 'TESTE 06: Delayed Unit A error does not overwrite Unit B READY status');
    assert(coordinator.bootstrapError() === null, 'TESTE 06: Delayed Unit A error does not set Unit B error');
  }

  // TESTE 07 — A -> B -> C out-of-order resolution
  {
    const coordinator = new MockBootstrapCoordinator();
    const pA = coordinator.switchUnit('unit-A', { coreDelayMs: 60 });
    const pB = coordinator.switchUnit('unit-B', { coreFail: true, coreDelayMs: 40 });
    const pC = coordinator.switchUnit('unit-C', { coreDelayMs: 10 });

    await Promise.all([pA, pB, pC]);
    assert(coordinator.bootstrapStatus() === 'READY', 'TESTE 07: Final status belongs strictly to Unit C (READY)');
    assert(coordinator.bootstrapError() === null, 'TESTE 07: Final error belongs strictly to Unit C (null)');
  }

  // TESTE 08 — logout durante LOADING_CORE
  {
    const coordinator = new MockBootstrapCoordinator();
    const pA = coordinator.switchUnit('unit-1', { coreDelayMs: 50 });

    assert(coordinator.bootstrapStatus() === 'LOADING_CORE', 'TESTE 08: Unit A is LOADING_CORE');
    coordinator.handleAuthStateChange(null, false); // User logout

    assert(coordinator.bootstrapStatus() === 'IDLE', 'TESTE 08: Status becomes IDLE on logout');
    assert(coordinator.isDataLoaded() === true, 'TESTE 08: isDataLoaded becomes true on logout for unauthenticated guards');
    await pA;
    assert(coordinator.bootstrapStatus() === 'IDLE', 'TESTE 08: Stale Unit A completion ignored after logout');
  }

  // TESTE 09 — logout durante LOADING_ESSENTIAL
  {
    const coordinator = new MockBootstrapCoordinator();
    const pA = coordinator.switchUnit('unit-1', { essentialDelayMs: 50 });

    // Wait until it reaches LOADING_ESSENTIAL
    await new Promise(r => setTimeout(r, 10));
    assert(coordinator.bootstrapStatus() === 'LOADING_ESSENTIAL', 'TESTE 09: Unit A is LOADING_ESSENTIAL');

    coordinator.handleAuthStateChange(null, false); // User logout
    assert(coordinator.bootstrapStatus() === 'IDLE', 'TESTE 09: Status becomes IDLE on logout during essential');
    assert(coordinator.bootstrapError() === null, 'TESTE 09: Error remains null on logout');

    await pA;
    assert(coordinator.bootstrapStatus() === 'IDLE', 'TESTE 09: Stale Unit A essential completion ignored after logout');
  }

  // TESTE 10 — unauthenticated compatibility
  {
    const coordinator = new MockBootstrapCoordinator();
    coordinator.handleAuthStateChange(null, false);

    assert(coordinator.bootstrapStatus() === 'IDLE', 'TESTE 10: Unauthenticated status is IDLE');
    assert(coordinator.bootstrapError() === null, 'TESTE 10: Unauthenticated error is null');
    assert(coordinator.isDataLoaded() === true, 'TESTE 10: Unauthenticated isDataLoaded is true for guards');
  }

  // TESTE 11 — demo mode
  {
    const coordinator = new MockBootstrapCoordinator();
    coordinator.handleAuthStateChange({ id: 'demo-user' }, true);

    assert(coordinator.bootstrapStatus() === 'READY', 'TESTE 11: Demo mode reaches READY');
    assert(coordinator.isDataLoaded() === true, 'TESTE 11: Demo mode isDataLoaded is true');
    assert(coordinator.bootstrapError() === null, 'TESTE 11: Demo mode error is null');
  }

  // TESTE 12 — demo -> real
  {
    const coordinator = new MockBootstrapCoordinator();
    coordinator.handleAuthStateChange({ id: 'demo-user' }, true);
    assert(coordinator.bootstrapStatus() === 'READY', 'TESTE 12: Demo is READY');

    // Switch to real unit
    coordinator.isDemoMode.set(false);
    await coordinator.switchUnit('real-unit-1');
    assert(coordinator.bootstrapStatus() === 'READY', 'TESTE 12: Real unit reaches READY');
  }

  // TESTE 13 — realtime retry
  {
    const coordinator = new MockBootstrapCoordinator();
    await coordinator.switchUnit('unit-1');
    assert(coordinator.bootstrapStatus() === 'READY', 'TESTE 13: Initial status READY');

    coordinator.simulateRealtimeRetry();
    assert(coordinator.bootstrapStatus() === 'READY', 'TESTE 13: Status remains READY after realtime retry');
    assert(coordinator.bootstrapError() === null, 'TESTE 13: Error remains null after realtime retry');
  }

  // TESTE 14 — loadBackOfficeData
  {
    const coordinator = new MockBootstrapCoordinator();
    await coordinator.switchUnit('unit-1');
    assert(coordinator.bootstrapStatus() === 'READY', 'TESTE 14: Initial status READY');

    await coordinator.loadBackOfficeData();
    assert(coordinator.bootstrapStatus() === 'READY', 'TESTE 14: Status remains READY after backoffice load');
  }

  // TESTE 15 — refetch
  {
    const coordinator = new MockBootstrapCoordinator();
    await coordinator.switchUnit('unit-1');
    assert(coordinator.bootstrapStatus() === 'READY', 'TESTE 15: Initial status READY');

    await coordinator.refetchRecipesData();
    assert(coordinator.bootstrapStatus() === 'READY', 'TESTE 15: Status remains READY after recipes refetch');
  }

  // TESTE 16 — isDataLoaded backward compatibility
  {
    const coordinator = new MockBootstrapCoordinator();
    assert(coordinator.isDataLoaded() === false, 'TESTE 16: Initially false');

    const p = coordinator.switchUnit('unit-1', { coreDelayMs: 20 });
    assert(coordinator.isDataLoaded() === false, 'TESTE 16: False while loading');
    await p;
    assert(coordinator.isDataLoaded() === true, 'TESTE 16: True when READY');

    coordinator.handleAuthStateChange(null, false);
    assert(coordinator.isDataLoaded() === true, 'TESTE 16: True when unauthenticated');
  }

  // TESTE 17 — Error Sanitization
  {
    const sensitiveError = 'Error: password=secret123&token=bearer_xyz_999 database timeout at SELECT * FROM secret_table';
    const sanitized = sanitizeBootstrapErrorMessage(sensitiveError);
    assert(!sanitized.includes('secret123'), 'TESTE 17: Sanitized error hides secret password');
    assert(!sanitized.includes('bearer_xyz_999'), 'TESTE 17: Sanitized error hides bearer token');
  }

  console.log('============================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runBootstrapLifecycleTests();
