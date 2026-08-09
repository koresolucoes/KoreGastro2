
import { Injectable, signal, computed, WritableSignal, inject, effect, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { ProductionPlan, Order, OrderItem } from '../models/db.models';
import { AccountId, StoreId } from '../types';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';
import { PricingService } from './pricing.service';
import { UnitContextService } from './unit-context.service';
import { OperationalAuthService } from './operational-auth.service';

// Import all new state services
import { PosStateService } from './pos-state.service';
import { InventoryStateService } from './inventory-state.service';
import { RecipeStateService } from './recipe-state.service';
import { HrStateService } from './hr-state.service';
import { CashierStateService } from './cashier-state.service';
import { SettingsStateService } from './settings-state.service';
import { IfoodStateService } from './ifood-state.service';
import { SubscriptionStateService } from './subscription-state.service';
import { DashboardStateService } from './dashboard-state.service';
import { DemoService } from './demo.service';
import { NotificationService } from './notification.service';
import * as mockData from '../data/mock-data';
import { ALL_PERMISSION_KEYS } from '../config/permissions';
import { DeliveryStateService } from './delivery-state.service';
import { BootstrapStatus, BootstrapStage, BootstrapError, sanitizeBootstrapErrorMessage } from '../models/bootstrap-state.model';
import { RealtimeCoordinatorService } from './realtime/realtime-coordinator.service';
import { CoreDataLoaderService } from './data-loaders/core-data-loader.service';
import { PosDataLoaderService } from './data-loaders/pos-data-loader.service';
import { CatalogDataLoaderService } from './data-loaders/catalog-data-loader.service';
import { InventoryDataLoaderService } from './data-loaders/inventory-data-loader.service';
import { OperationsDataLoaderService } from './data-loaders/operations-data-loader.service';

@Injectable({
  providedIn: 'root',
})
export class SupabaseStateService {
  private authService = inject(AuthService);
  private pricingService = inject(PricingService);
  private unitContextService = inject(UnitContextService);
  private operationalAuthService = inject(OperationalAuthService);
  private router: Router = inject(Router);
  
  // Inject all modular state services
  private posState = inject(PosStateService);
  private inventoryState = inject(InventoryStateService);
  private recipeState = inject(RecipeStateService);
  private hrState = inject(HrStateService);
  private cashierState = inject(CashierStateService);
  private settingsState = inject(SettingsStateService);
  private ifoodState = inject(IfoodStateService);
  private subscriptionState = inject(SubscriptionStateService);
  private dashboardState = inject(DashboardStateService);
  private demoService = inject(DemoService);
  private deliveryState = inject(DeliveryStateService);
  private notificationService = inject(NotificationService);

  private coreDataLoader = inject(CoreDataLoaderService);
  private posDataLoader = inject(PosDataLoaderService);
  private catalogDataLoader = inject(CatalogDataLoaderService);
  private inventoryDataLoader = inject(InventoryDataLoaderService);
  private operationsDataLoader = inject(OperationsDataLoaderService);
  private realtimeCoordinator = inject(RealtimeCoordinatorService);

  private currentUser = this.authService.currentUser;
  private kdsPollerInterval: any = null;
  private bootstrapGeneration = 0;

  // Explicit Bootstrap Lifecycle Signals (Etapa 04B)
  public readonly bootstrapStatus = signal<BootstrapStatus>('IDLE');
  public readonly bootstrapError = signal<BootstrapError | null>(null);

  // Computeds for bootstrap readiness and status
  public readonly isBootstrapLoading = computed(() => {
    const status = this.bootstrapStatus();
    return status === 'LOADING_CORE' || status === 'LOADING_ESSENTIAL';
  });
  public readonly isBootstrapReady = computed(() => this.bootstrapStatus() === 'READY');
  public readonly hasBootstrapError = computed(() => this.bootstrapStatus() === 'ERROR');

  // Flag to indicate Core data (permissions, profile) is ready (Backward Compatibility)
  isDataLoaded = signal(false);

  constructor() {
    // EFFECT 1: Handle User Authentication State & Demo Mode
    effect(async () => {
        const user = this.currentUser();
        const isDemo = this.demoService.isDemoMode();

        if (isDemo) {
            const generation = ++this.bootstrapGeneration;
            this.unsubscribeFromChanges();
            this.clearAllData();
            this.loadMockData(generation);
        } else if (user) {
            await this.unitContextService.loadContext(user.id);
        } else {
            ++this.bootstrapGeneration;
            this.unsubscribeFromChanges();
            this.clearAllData();
            if (this.unitContextService.activeStoreId()) {
                this.unitContextService.activeUnitId.set('');
            }
            this.bootstrapError.set(null);
            this.bootstrapStatus.set('IDLE');
            this.isDataLoaded.set(true); // Signal completion so guards don't hang for unauthenticated users
        }
    }, { allowSignalWrites: true });

    // EFFECT 2: React to Active Unit Changes
    // Handles Data Loading AND Operator Auto-Switch
    effect(async () => {
        const activeStoreId = this.unitContextService.activeStoreId();
        const isDemo = this.demoService.isDemoMode();
        
        if (activeStoreId && !isDemo) {
            const generation = ++this.bootstrapGeneration;

            // IMMEDIATELY cleanup old unit realtime & clear state
            this.unsubscribeFromChanges();
            this.clearAllData();
            this.bootstrapError.set(null);
            this.bootstrapStatus.set('LOADING_CORE');
            this.isDataLoaded.set(false);

            try {
                // 2. Load Core Data (Permissions, Settings, Roles) - Critical for Auth
                await this.loadCoreDataForGeneration(activeStoreId, generation);
                if (generation !== this.bootstrapGeneration) return;
                
                // Transition to LOADING_ESSENTIAL
                this.bootstrapStatus.set('LOADING_ESSENTIAL');

                // 3. Load Catalogs & Active State (Menu, Current Stock, Open Orders) - Critical for Operations
                await this.loadEssentialDataForGeneration(activeStoreId, generation);
                if (generation !== this.bootstrapGeneration) return;

                // 4. Start Realtime
                this.subscribeToChanges(activeStoreId, generation);

                if (generation !== this.bootstrapGeneration) return;

                // 5. Mark data loaded SUCCESS
                this.bootstrapStatus.set('READY');
                this.isDataLoaded.set(true);

                // 6. If no employee is logged in, navigate to employee selection
                untracked(() => {
                    if (generation === this.bootstrapGeneration && !this.operationalAuthService.activeEmployee()) {
                        this.router.navigate(['/employee-selection']);
                    }
                });
            } catch (err: any) {
                if (generation !== this.bootstrapGeneration) return;

                console.error("Critical error loading unit data:", err);
                const stage: BootstrapStage = this.bootstrapStatus() === 'LOADING_ESSENTIAL' ? 'ESSENTIAL' : 'CORE';
                this.bootstrapError.set({
                    stage,
                    message: sanitizeBootstrapErrorMessage(err?.message || err)
                });
                this.bootstrapStatus.set('ERROR');
                this.isDataLoaded.set(false);
            }
        }
    }, { allowSignalWrites: true });

    effect(() => {
      this.pricingService.promotions.set(this.recipeState.promotions());
      this.pricingService.promotionRecipes.set(this.recipeState.promotionRecipes());
    });
  }

  // --- 1. CORE DATA (Required for basic app structure) ---
  public async loadCoreData(storeId: StoreId) {
    return this.loadCoreDataForGeneration(storeId, this.bootstrapGeneration);
  }

  private async loadCoreDataForGeneration(storeId: StoreId, generation: number) {
    const permCacheKey = `chefos_role_perms_${storeId}`;
    const cachedPerms = localStorage.getItem(permCacheKey);
    if (cachedPerms && generation === this.bootstrapGeneration) {
      try {
        this.hrState.rolePermissions.set(JSON.parse(cachedPerms));
      } catch {
        // ignore invalid cache
      }
    }

    const coreData = await this.coreDataLoader.load(storeId);

    if (generation !== this.bootstrapGeneration) return;

    this.settingsState.companyProfile.set(coreData.companyProfile || null);
    this.hrState.roles.set(coreData.roles);
    
    this.hrState.rolePermissions.set(coreData.rolePermissions);
    localStorage.setItem(permCacheKey, JSON.stringify(coreData.rolePermissions));

    this.hrState.employees.set(coreData.employees);
    this.settingsState.webhooks.set(coreData.webhooks);
  }

  // --- 2. ESSENTIAL DATA (Required for POS/KDS/Inventory to function) ---
  public async loadEssentialData(storeId: StoreId) {
    return this.loadEssentialDataForGeneration(storeId, this.bootstrapGeneration);
  }

  private async loadEssentialDataForGeneration(storeId: StoreId, generation: number) {
    const [
      posData,
      catalogData,
      inventoryData,
      operationsData
    ] = await Promise.all([
      this.posDataLoader.load(storeId),
      this.catalogDataLoader.load(storeId),
      this.inventoryDataLoader.load(storeId),
      this.operationsDataLoader.load(storeId)
    ]);

    if (generation !== this.bootstrapGeneration) return;

    // Populate State
    this.posState.halls.set(posData.halls);
    this.posState.tables.set(posData.tables);
    this.posState.stations.set(posData.stations);
    
    this.recipeState.categories.set(catalogData.categories);
    this.recipeState.recipes.set(catalogData.recipes);
    this.recipeState.promotions.set(catalogData.promotions);
    this.recipeState.promotionRecipes.set(catalogData.promotionRecipes);
    this.recipeState.recipeIngredients.set(catalogData.recipeIngredients);
    this.recipeState.recipePreparations.set(catalogData.recipePreparations);
    this.recipeState.recipeSubRecipes.set(catalogData.recipeSubRecipes);
    this.pricingService.customPrices.set(catalogData.storeCustomPrices);

    this.inventoryState.ingredients.set(inventoryData.ingredients);
    this.inventoryState.ingredientCategories.set(inventoryData.ingredientCategories);
    this.inventoryState.suppliers.set(inventoryData.suppliers);
    this.inventoryState.stationStocks.set(inventoryData.stationStocks);

    this.posState.customers.set(posData.customers);
    this.setOrdersWithPrices(posData.orders);
    this.deliveryState.deliveryDrivers.set(operationsData.deliveryDrivers);
    
    this.settingsState.loyaltySettings.set(operationsData.loyaltySettings);
    this.settingsState.loyaltyRewards.set(operationsData.loyaltyRewards);
    this.settingsState.reservationSettings.set(operationsData.reservationSettings);
    this.settingsState.paymentTerminals.set(operationsData.paymentTerminals);
    
    this.ifoodState.ifoodWebhookLogs.set(operationsData.ifoodWebhookLogs);
  }

  public async refetchRecipesData() {
    const storeId = this.unitContextService.activeStoreId();
    if (!storeId) return;
    const currentGen = this.bootstrapGeneration;

    const [
        recipes,
        recipeIngredients,
        recipePreparations,
        recipeSubRecipes,
        storeCustomPrices
    ] = await Promise.all([
        supabase.from('recipes').select('*').eq('store_id', storeId),
        supabase.from('recipe_ingredients').select('*, ingredients(name, unit, cost)').eq('user_id', storeId),
        supabase.from('recipe_preparations').select('*').eq('user_id', storeId),
        supabase.from('recipe_sub_recipes').select('*, recipes:recipes!child_recipe_id(name, id)').eq('user_id', storeId),
        supabase.from('store_custom_prices').select('*').eq('store_id', storeId),
    ]);

    if (currentGen !== this.bootstrapGeneration || storeId !== this.unitContextService.activeStoreId()) {
        return;
    }

    this.recipeState.recipes.set(recipes.data || []);
    this.recipeState.recipeIngredients.set(recipeIngredients.data || []);
    this.recipeState.recipePreparations.set(recipePreparations.data || []);
    this.recipeState.recipeSubRecipes.set(recipeSubRecipes.data || []);
    this.pricingService.customPrices.set(storeCustomPrices.data || []);
  }

  // --- 3. ON-DEMAND DATA (Heavy/Historical) ---
  // Called by Inventory, Reports, HR components on init
  public async loadBackOfficeData() {
     const storeId = this.unitContextService.activeStoreId();
     if (!storeId) return;
     const currentGen = this.bootstrapGeneration;

     const yesterday = new Date();
     yesterday.setDate(yesterday.getDate() - 1);
     yesterday.setHours(0, 0, 0, 0);

     const [
        purchaseOrders, inventoryLots, productionPlans, 
        requisitions, schedules, leaveRequests, 
        activeReservations
     ] = await Promise.all([
        supabase.from('purchase_orders').select('*, suppliers(name), purchase_order_items(*, ingredients(name, unit)), created_by_employee:employees!purchase_orders_created_by_employee_id_fkey(name), received_by_employee:employees!purchase_orders_received_by_employee_id_fkey(name)').eq('user_id', storeId).order('created_at', { ascending: false }).limit(50),
        supabase.from('inventory_lots').select('*').eq('user_id', storeId).gt('quantity', 0).order('created_at', { ascending: true }),
        supabase.from('production_plans').select('*, production_tasks(*, recipes(name, source_ingredient_id), stations(name), employees(name))').eq('user_id', storeId).order('plan_date', { ascending: false }).limit(20),
        supabase.from('requisitions').select('*, requisition_items(*, ingredients(name)), stations(name), requester:employees!requested_by(name), processor:employees!processed_by(name), target_unit:stores!requisitions_target_unit_id_fkey(name)').eq('user_id', storeId).order('created_at', { ascending: false }).limit(50),
        supabase.from('schedules').select('*, shifts(*, employees(name))').eq('user_id', storeId).order('week_start_date', { ascending: false }).limit(10),
        supabase.from('leave_requests').select('*, employees(name, role)').eq('user_id', storeId).order('start_date', { ascending: false }).limit(50),
        // Load only future or today's reservations to save bandwidth
        supabase.from('reservations').select('*').eq('user_id', storeId).gte('reservation_time', yesterday.toISOString()).order('reservation_time', { ascending: true })
     ]);

     if (currentGen !== this.bootstrapGeneration || storeId !== this.unitContextService.activeStoreId()) {
         return;
     }

     this.inventoryState.purchaseOrders.set(purchaseOrders.data || []);
     this.inventoryState.inventoryLots.set(inventoryLots.data || []); 
     this.inventoryState.productionPlans.set(productionPlans.data || []);
     this.inventoryState.requisitions.set(requisitions.data || []);
     this.hrState.schedules.set(schedules.data || []);
     this.hrState.leaveRequests.set(leaveRequests.data || []);
     this.settingsState.reservations.set(activeReservations.data || []);
  }

  public async refetchIfoodLogs() {
    const storeId = this.unitContextService.activeStoreId();
    if (!storeId) return;
    await this.refetchSimpleTable('ifood_webhook_logs', '*', this.ifoodState.ifoodWebhookLogs, true, 100);
  }

  // --- REALTIME SUBSCRIPTION ---

  private unsubscribeFromChanges() {
    this.realtimeCoordinator.stop();
    this.stopKdsPoller();
  }

  private subscribeToChanges(storeId: StoreId, generation = this.bootstrapGeneration) {
    this.unsubscribeFromChanges();

    if (generation !== this.bootstrapGeneration || storeId !== this.unitContextService.activeStoreId()) {
      return;
    }
    
    this.startKdsPoller();

    this.realtimeCoordinator.start(storeId, generation, (payload) => {
        this.handleChanges(payload, generation);
    });
  }

  private handleChanges(payload: any, generation = this.bootstrapGeneration) {
    const storeId = this.unitContextService.activeStoreId();
    if (!storeId || generation !== this.bootstrapGeneration) return;

    switch (payload.table) {
        case 'ifood_webhook_logs':
            this.handleSimpleUpdate(this.ifoodState.ifoodWebhookLogs, payload);
            break;
        case 'orders':
            this.handleOrderChange(payload);
            break;
        case 'order_items':
            this.handleOrderItemChange(payload);
            break;
        case 'tables': 
            this.handleTableChange(payload); 
            break;
        case 'delivery_drivers':
            this.handleSimpleUpdate(this.deliveryState.deliveryDrivers, payload);
            break;
        case 'halls': this.handleSimpleUpdate(this.posState.halls, payload); break;
        case 'stations': this.handleSimpleUpdate(this.posState.stations, payload, '*, employees(*)'); break;
        case 'categories': this.handleSimpleUpdate(this.recipeState.categories, payload); break;
        case 'recipes': this.handleSimpleUpdate(this.recipeState.recipes, payload); break;
        case 'recipe_preparations':
        case 'recipe_ingredients':
        case 'recipe_sub_recipes':
        case 'store_custom_prices':
            this.refetchRecipesData();
            break;
        case 'employees': this.handleSimpleUpdate(this.hrState.employees, payload); break;
        case 'ingredients': 
             this.handleIngredientChange(payload);
             break;
        case 'station_stocks': this.handleSimpleUpdate(this.inventoryState.stationStocks, payload, '*, stations(name), ingredients(name, unit)'); break;
        case 'requisitions': this.handleSimpleUpdate(this.inventoryState.requisitions, payload, '*, requisition_items(*, ingredients(name)), stations(name), requester:employees!requested_by(name), processor:employees!processed_by(name)'); break;
        
        // HR Updates
        case 'schedules':
             this.handleSimpleUpdate(this.hrState.schedules, payload, '*, shifts(*, employees(name))');
             break;
        case 'shifts':
             this.handleShiftChange(payload);
             break;
        case 'leave_requests':
             this.handleLeaveRequestChange(payload);
             break;

        case 'whatsapp_messages':
             this.handleWhatsAppMessage(payload);
             break;
             
        case 'temperature_logs':
             this.handleTemperatureLogChange(payload);
             break;
        
        // Loyalty Updates
        case 'loyalty_settings':
             if (payload.new) {
                 this.settingsState.loyaltySettings.set(payload.new);
             }
             break;
        case 'loyalty_rewards':
             this.handleSimpleUpdate(this.settingsState.loyaltyRewards, payload);
             break;
             
        // Reservation Updates
        case 'reservation_settings':
             if (payload.new) {
                 this.settingsState.reservationSettings.set(payload.new);
             }
             break;
        case 'reservations':
             this.handleSimpleUpdate(this.settingsState.reservations, payload);
             break;

        // Transactional logs - append only if matching date
        case 'transactions':
            this.handleTransactionChange(payload);
            break;
        case 'cashier_closings':
            this.refreshDashboardAndCashierData();
            break;

        // Mise en Place Realtime Updates
        case 'production_plans':
             this.handleSimpleUpdate(this.inventoryState.productionPlans, payload, '*, production_tasks(*, recipes(name, source_ingredient_id), stations(name), employees(name))');
             break;
        case 'production_tasks':
             this.handleProductionTaskChange(payload);
             break;
    }
  }

  private async handleIngredientChange(payload: any) {
      if (payload.eventType === 'UPDATE') {
          const oldStock = payload.old.stock;
          const newStock = payload.new.stock;
          const minStock = payload.new.min_stock;
          
          if (oldStock > minStock && newStock <= minStock) {
               this.notificationService.addSystemNotification({
                  title: `Estoque Crítico: ${payload.new.name}`,
                  message: `Estoque atingiu ${newStock} ${payload.new.unit} (Mínimo: ${minStock}).`,
                  type: 'inventory',
                  severity: 'warning',
                  actionUrl: '/inventory',
                  actionLabel: 'Ver Estoque'
               });
          }
      }
      this.handleSimpleUpdate(this.inventoryState.ingredients, payload, '*, ingredient_categories(name), suppliers(name)');
  }

  private async handleLeaveRequestChange(payload: any) {
      if (payload.eventType === 'INSERT') {
          this.notificationService.addSystemNotification({
              title: `Nova Solicitação de Ausência RH`,
              message: `Um colaborador solicitou ausência para análise.`,
              type: 'rh',
              severity: 'info',
              actionUrl: '/leave-management',
              actionLabel: 'Analisar RH'
          });
      }
      this.handleSimpleUpdate(this.hrState.leaveRequests, payload, '*, employees(name, role)');
  }

  private async handleWhatsAppMessage(payload: any) {
      if (payload.eventType === 'INSERT' && payload.new.sender_type === 'customer') {
           this.notificationService.addSystemNotification({
              title: `Nova Mensagem no WhatsApp`,
              message: payload.new.content ? (payload.new.content.substring(0, 50) + (payload.new.content.length > 50 ? '...' : '')) : 'Nova mensagem recebida.',
              type: 'whatsapp',
              severity: 'info',
              actionUrl: '/whatsapp-chats',
              actionLabel: 'Ver Chat'
           });
      }
  }

  private async handleTableChange(payload: any) {
      if (payload.eventType === 'UPDATE') {
          const oldStatus = payload.old.status;
          const newStatus = payload.new.status;
          
          if (oldStatus !== 'CHAMANDO_GARCOM' && newStatus === 'CHAMANDO_GARCOM') {
               this.notificationService.addSystemNotification({
                  title: `Chamar Garçom - Mesa ${payload.new.number}`,
                  message: `A Mesa ${payload.new.number} solicitou atendimento.`,
                  type: 'waiter',
                  severity: 'warning',
                  actionUrl: '/pos',
                  actionLabel: 'Atender Mesa'
               });
          }
      }
      this.handleSimpleUpdate(this.posState.tables, payload);
  }

  // Generic Helper for simple flat lists
  private async handleSimpleUpdate<T extends { id: string }>(
      signal: WritableSignal<T[]>, 
      payload: any, 
      fetchQuery?: string
  ) {
      if (payload.eventType === 'DELETE') {
          signal.update(items => items.filter(i => i.id !== payload.old.id));
      } else if (payload.eventType === 'INSERT') {
          let newItem = payload.new;
          if (fetchQuery) {
             const { data } = await supabase.from(payload.table).select(fetchQuery).eq('id', newItem.id).single();
             if (data) newItem = data;
          }
          signal.update(items => [newItem as T, ...items]); // Prepend new items
      } else if (payload.eventType === 'UPDATE') {
           let updatedItem = payload.new;
           if (fetchQuery) {
              const { data } = await supabase.from(payload.table).select(fetchQuery).eq('id', updatedItem.id).single();
              if (data) updatedItem = data;
           }
           signal.update(items => items.map(i => i.id === updatedItem.id ? updatedItem as T : i));
      }
  }

  // Specific Handler for Orders (Deep Fetch Relations)
  private async handleOrderChange(payload: any) {
    if (payload.eventType === 'DELETE') {
        this.posState.orders.update(orders => orders.filter(o => o.id !== payload.old.id));
        return;
    }

    // Crucial: Fetch full order with relations (items, customer)
    const { data: fullOrder, error } = await supabase
        .from('orders')
        .select('*, order_items(*), customers(*), delivery_drivers(*), waiter:employees!created_by_employee_id(name)')
        .eq('id', payload.new.id)
        .single();
    
    if (error || !fullOrder) return;

    const processedOrder = (this.processOrdersWithPrices([fullOrder]))[0];
    const isRelevantForPos = 
        processedOrder.status === 'OPEN' || 
        processedOrder.status === 'PAYING' ||
        processedOrder.status === 'AWAITING' ||
        (processedOrder.status === 'CANCELLED' && new Date().getTime() - new Date(processedOrder.completed_at || '').getTime() < 12 * 60 * 60 * 1000);

    this.posState.orders.update(orders => {
        const exists = orders.find(o => o.id === processedOrder.id);
        
        // Trigger notification for new orders
        if (!exists && payload.eventType === 'INSERT') {
            const orderTotal = (processedOrder.ifood_payments as any)?.total?.orderAmount ?? 
                               processedOrder.order_items?.reduce((sum: number, i: any) => sum + (i.price * i.quantity), 0) ?? 0;
            
            if (processedOrder.order_type.startsWith('iFood')) {
                 this.notificationService.addSystemNotification({
                    title: `Novo Pedido iFood #${processedOrder.ifood_display_id || processedOrder.id.slice(0,4).toUpperCase()}`,
                    message: `Pedido recebido no valor de R$ ${orderTotal.toFixed(2)}.`,
                    type: 'ifood',
                    severity: 'info',
                    actionUrl: '/ifood-kds',
                    actionLabel: 'Ver no KDS'
                 });
            } else if (processedOrder.order_type === 'Delivery') {
                 this.notificationService.addSystemNotification({
                    title: `Novo Pedido Delivery #${processedOrder.id.slice(0,4).toUpperCase()}`,
                    message: `Pedido recebido.`,
                    type: 'waiter',
                    severity: 'info',
                    actionUrl: '/delivery',
                    actionLabel: 'Ver Entregas'
                 });
            }
        }

        if (isRelevantForPos) {
            return exists ? orders.map(o => o.id === processedOrder.id ? processedOrder : o) : [...orders, processedOrder];
        } else {
            return orders.filter(o => o.id !== processedOrder.id);
        }
    });
    
    // Maintain recently finished list for iFood KDS
    if (processedOrder.order_type.startsWith('iFood') && (processedOrder.status === 'COMPLETED' || processedOrder.status === 'CANCELLED')) {
        this.ifoodState.recentlyFinishedIfoodOrders.update(orders => {
             const exists = orders.find(o => o.id === processedOrder.id);
             const list = exists ? orders.map(o => o.id === processedOrder.id ? processedOrder : o) : [processedOrder, ...orders];
             return list.slice(0, 50);
        });
    }
  }

  // Specific Handler for Order Items
  private async handleOrderItemChange(payload: any) {
     // If an item is deleted, remove from local order
     if (payload.eventType === 'DELETE') {
         this.posState.orders.update(orders => orders.map(order => {
             if (order.id === payload.old.order_id) {
                 return { ...order, order_items: order.order_items.filter(i => i.id !== payload.old.id) };
             }
             return order;
         }));
         return;
     }

     // Use the payload.new directly for speed, but ideally we'd fetch full item if it had complex relations
     const newItem = payload.new;
     
     // Update POS State
     this.posState.orders.update(orders => orders.map(order => {
         if (order.id === newItem.order_id) {
             const existingItemIndex = order.order_items.findIndex(i => i.id === newItem.id);
             let newItems = [...order.order_items];
             
             if (existingItemIndex >= 0) {
                 // Preserve fields that might not be in payload if we didn't fetch relations, 
                 // but typically raw payload has all DB fields. 
                 // Important: Pricing might need re-calculation if not stored on item.
                 const mergedItem = { ...newItems[existingItemIndex], ...newItem };
                 newItems[existingItemIndex] = mergedItem;
             } else {
                 // For new items, we might miss the recipe relation if we don't fetch. 
                 // But typically the Order panel adds it optimistically or refreshes via 'order.updated' event
                 newItems.push(newItem);
             }
             return { ...order, order_items: newItems };
         }
         return order;
     }));
  }

  private async handleTransactionChange(payload: any) {
      if (payload.eventType === 'INSERT') {
          const today = new Date().toISOString().split('T')[0];
          if (payload.new.date.startsWith(today)) {
              this.cashierState.transactions.update(txs => [...txs, payload.new]);
              this.dashboardState.dashboardTransactions.update(txs => [...txs, payload.new]);
          }
          
          if (payload.new.type === 'Estorno' || (payload.new.description && payload.new.description.toLowerCase().includes('estorno'))) {
              this.notificationService.addSystemNotification({
                 title: `Estorno Registrado`,
                 message: `Um estorno de R$ ${Math.abs(payload.new.amount).toFixed(2)} foi lançado no caixa.`,
                 type: 'payment',
                 severity: 'warning',
                 actionUrl: '/cashier',
                 actionLabel: 'Ver Caixa',
                 showToast: true
              });
          }
      }
  }

  // Handle updates to tasks within plans
  private async handleProductionTaskChange(payload: any) {
    const planId = payload.new?.production_plan_id || payload.old?.production_plan_id;
    if (!planId) return;

    let taskWithRelations: any = payload.new;

    // Fetch full structure for INSERT/UPDATE to get joined fields
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
       const { data } = await supabase
         .from('production_tasks')
         .select('*, recipes(name, source_ingredient_id), stations(name), employees(name)')
         .eq('id', taskWithRelations.id)
         .single();
       if (data) taskWithRelations = data;
    }

    this.inventoryState.productionPlans.update(plans => {
        return plans.map(plan => {
            if (plan.id === planId) {
                const currentTasks = plan.production_tasks || [];
                if (payload.eventType === 'INSERT') {
                    // Prevent duplicates
                    if (!currentTasks.find(t => t.id === taskWithRelations.id)) {
                        return { ...plan, production_tasks: [...currentTasks, taskWithRelations] };
                    }
                } else if (payload.eventType === 'UPDATE') {
                    return { ...plan, production_tasks: currentTasks.map(t => t.id === taskWithRelations.id ? taskWithRelations : t) };
                } else if (payload.eventType === 'DELETE') {
                    return { ...plan, production_tasks: currentTasks.filter(t => t.id !== payload.old.id) };
                }
            }
            return plan;
        });
    });
  }

  // Handle updates to shifts within schedules
  private async handleShiftChange(payload: any) {
    const scheduleId = payload.new?.schedule_id || payload.old?.schedule_id;
    if (!scheduleId) return;

    let shiftWithRelations: any = payload.new;

    // Fetch full data for Insert/Update to get Employee Name
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const { data } = await supabase
            .from('shifts')
            .select('*, employees(name)')
            .eq('id', shiftWithRelations.id)
            .single();
        if (data) shiftWithRelations = data;
    }

    this.hrState.schedules.update(schedules => {
        return schedules.map(schedule => {
            if (schedule.id === scheduleId) {
                const currentShifts = schedule.shifts || [];

                if (payload.eventType === 'INSERT') {
                     if (!currentShifts.find(s => s.id === shiftWithRelations.id)) {
                         return { ...schedule, shifts: [...currentShifts, shiftWithRelations] };
                     }
                } else if (payload.eventType === 'UPDATE') {
                    return { ...schedule, shifts: currentShifts.map(s => s.id === shiftWithRelations.id ? shiftWithRelations : s) };
                } else if (payload.eventType === 'DELETE') {
                    return { ...schedule, shifts: currentShifts.filter(s => s.id !== payload.old.id) };
                }
            }
            return schedule;
        });
    });
  }

  public async refreshDashboardAndCashierData() {
    const userId = this.unitContextService.activeStoreId();
    if (!userId) return;
    
    const { data: closings } = await supabase.from('cashier_closings').select('*').eq('user_id', userId).order('closed_at', { ascending: false }).limit(5);
    this.cashierState.cashierClosings.set(closings || []);
    
    const today = new Date();
    const isoEndDate = today.toISOString();
    today.setHours(0, 0, 0, 0); 
    const isoStartDate = today.toISOString();
    
    const { data: transactions } = await supabase.from('transactions').select('*').gte('date', isoStartDate).lte('date', isoEndDate).eq('user_id', userId);
    this.dashboardState.dashboardTransactions.set(transactions || []);
  }

  private async refetchSimpleTable<T>(tableName: string, selectQuery: string, signal: WritableSignal<T[]>, orderByDesc = false, limit?: number) {
    const userId = this.unitContextService.activeStoreId();
    if (!userId) return;
    let query = supabase.from(tableName).select(selectQuery).eq('user_id', userId);
    
    // Heuristic for created_at or other date field
    const orderColumn = ['purchase_orders', 'production_plans', 'schedules', 'leave_requests', 'ifood_webhook_logs', 'portioning_events', 'requisitions'].includes(tableName) 
        ? (tableName === 'production_plans' ? 'plan_date' : tableName === 'schedules' ? 'week_start_date' : tableName === 'leave_requests' ? 'start_date' : 'created_at')
        : 'created_at';
        
    query = query.order(orderColumn, { ascending: !orderByDesc });
    if (limit) query = query.limit(limit);
    
    const { data, error } = await query;
    if (!error) signal.set(data as T[] || []);
  }

  private setOrdersWithPrices(orders: any[]) { this.posState.orders.set(this.processOrdersWithPrices(orders)); }
  
  private processOrdersWithPrices(orders: any[]): any[] {
    return orders
        .filter(o => !!o)
        .map(o => ({ 
            ...o, 
            order_items: (o.order_items || []).map((item: any) => {
                // If DB price is null (rare), fetch from recipe state
                const effectivePrice = item.price ?? this.pricingService.getEffectivePrice(this.recipeState.recipesById().get(item.recipe_id)!) ?? 0;
                return { ...item, price: effectivePrice };
            }) 
        }));
  }

  private processCompletedOrdersWithPrices(orders: any[]): any[] {
    return orders.map(o => ({ ...o, order_items: (o.order_items || []).map((item: any) => ({ ...item, price: item.price ?? this.recipeState.recipesById().get(item.recipe_id)?.price ?? 0 })) }));
  }

  private clearAllData() {
    this.posState.clearData();
    this.inventoryState.clearData();
    this.recipeState.clearData();
    this.hrState.clearData();
    this.cashierState.clearData();
    this.settingsState.clearData();
    this.ifoodState.clearData();
    this.subscriptionState.clearData();
    this.dashboardState.clearData();
    this.deliveryState.clearData();
    this.pricingService.customPrices.set([]);
    this.pricingService.promotions.set([]);
    this.pricingService.promotionRecipes.set([]);
    this.isDataLoaded.set(false);
  }
  
  // --- MOCK DATA ---
  private loadMockData(generation = this.bootstrapGeneration) {
    if (generation !== this.bootstrapGeneration) return;

    this.bootstrapError.set(null);
    this.bootstrapStatus.set('LOADING_CORE');
    this.isDataLoaded.set(false);

    try {
        this.posState.halls.set(mockData.MOCK_HALLS);
        this.posState.tables.set(mockData.MOCK_TABLES);
        this.posState.stations.set(mockData.MOCK_STATIONS);
        this.posState.orders.set(mockData.MOCK_ORDERS);
        this.posState.customers.set(mockData.MOCK_CUSTOMERS);
        this.inventoryState.ingredients.set(mockData.MOCK_INGREDIENTS);
        this.inventoryState.ingredientCategories.set(mockData.MOCK_INGREDIENT_CATEGORIES);
        this.inventoryState.suppliers.set(mockData.MOCK_SUPPLIERS);
        this.recipeState.categories.set(mockData.MOCK_RECIPE_CATEGORIES);
        this.recipeState.recipes.set(mockData.MOCK_RECIPES);
        this.hrState.employees.set(mockData.MOCK_EMPLOYEES);
        this.hrState.roles.set(mockData.MOCK_ROLES);
        this.hrState.rolePermissions.set(mockData.MOCK_ROLE_PERMISSIONS);
        
        const today = new Date().toISOString().split('T')[0];
        const transactionsToday = mockData.MOCK_TRANSACTIONS.filter(t => t.date.startsWith(today));
        this.dashboardState.performanceTransactions.set(mockData.MOCK_TRANSACTIONS);
        this.dashboardState.dashboardTransactions.set(transactionsToday);
        this.cashierState.transactions.set(mockData.MOCK_TRANSACTIONS);

        this.settingsState.companyProfile.set({ 
            company_name: 'Restaurante Demonstração', 
            cnpj: '00.000.000/0001-00', 
            user_id: 'demo-user', 
            created_at: new Date().toISOString(),
            address: null, phone: null, logo_url: null, ifood_merchant_id: null,
            menu_cover_url: null, menu_header_url: null, external_api_key: null,
            latitude: null, longitude: null, time_clock_radius: null
        });
        
        this.subscriptionState.activeUserPermissions.set(new Set(ALL_PERMISSION_KEYS));

        if (generation === this.bootstrapGeneration) {
            this.bootstrapStatus.set('READY');
            this.isDataLoaded.set(true);
        }
    } catch (e: any) {
        console.error("Failed to load mock data:", e);
        this.clearAllData();
        if (generation === this.bootstrapGeneration) {
            this.bootstrapError.set({
                stage: 'CORE',
                message: sanitizeBootstrapErrorMessage(e)
            });
            this.bootstrapStatus.set('ERROR');
            this.isDataLoaded.set(false);
        }
    }
  }

  async fetchPerformanceDataForPeriod(startDate: Date, endDate: Date): Promise<{ success: boolean; error: any }> {
    const userId = this.unitContextService.activeStoreId();
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    
    const [transactionsRes, completedOrdersRes] = await Promise.all([
      supabase.from('transactions').select('*').eq('user_id', userId).in('type', ['Gorjeta', 'Receita', 'Despesa']).gte('date', startDate.toISOString()).lte('date', endDate.toISOString()),
      supabase.from('orders').select('*, order_items(*), customers(*), delivery_drivers(*), waiter:employees!created_by_employee_id(name)').eq('user_id', userId).eq('status', 'COMPLETED').gte('completed_at', startDate.toISOString()).lte('completed_at', endDate.toISOString())
    ]);
      
    if (transactionsRes.error || completedOrdersRes.error) { 
      return { success: false, error: transactionsRes.error || completedOrdersRes.error };
    }
    
    this.dashboardState.performanceTransactions.set(transactionsRes.data || []);
    this.dashboardState.performanceCompletedOrders.set(this.processCompletedOrdersWithPrices(completedOrdersRes.data || []));
    return { success: true, error: null };
  }

  private startKdsPoller() {
      this.stopKdsPoller();
      this.kdsPollerInterval = setInterval(() => {
          const orders = this.posState.orders();
          const now = Date.now();
          
          orders.forEach(order => {
              if (order.status !== 'OPEN') return;
              
              order.order_items.forEach(item => {
                  if (item.status === 'AGUARDANDO' || item.status === 'EM_PREPARO') {
                       const itemCreated = new Date(item.status_timestamps?.['AGUARDANDO'] || item.created_at || order.timestamp).getTime();
                       const diffMins = (now - itemCreated) / 60000;
                       
                       if (diffMins > 30) {
                           const hasActiveNotif = this.notificationService.systemNotifications().find(n => n.type === 'kds' && n.message.includes(`Pedido #${order.id.slice(0, 4).toUpperCase()}`));
                           if (!hasActiveNotif) {
                               this.notificationService.addSystemNotification({
                                  title: `Atraso na Cozinha`,
                                  message: `O item ${item.name} do Pedido #${order.id.slice(0, 4).toUpperCase()} está há mais de 30 min aguardando preparo.`,
                                  type: 'kds',
                                  severity: 'error',
                                  actionUrl: '/kds',
                                  actionLabel: 'Abrir KDS',
                                  showToast: true
                               });
                           }
                       }
                  }
              });
          });
      }, 60000); // Check every 60 seconds
  }
  
  private stopKdsPoller() {
      if (this.kdsPollerInterval) {
          clearInterval(this.kdsPollerInterval);
          this.kdsPollerInterval = null;
      }
  }

  private async handleTemperatureLogChange(payload: any) {
      if (payload.eventType === 'INSERT') {
          const log = payload.new;
          const { data: equipment } = await supabase.from('equipment').select('*').eq('id', log.equipment_id).single();
          if (equipment && (equipment.min_temp !== null || equipment.max_temp !== null)) {
               if ((equipment.min_temp !== null && log.temperature < equipment.min_temp) || 
                   (equipment.max_temp !== null && log.temperature > equipment.max_temp)) {
                   this.notificationService.addSystemNotification({
                      title: `Alerta de Temperatura: ${equipment.name}`,
                      message: `A temperatura registrada (${log.temperature}°C) está fora do padrão (Min: ${equipment.min_temp ?? '-'}, Max: ${equipment.max_temp ?? '-'}).`,
                      type: 'inventory',
                      severity: 'error',
                      actionUrl: '/temperatures',
                      actionLabel: 'Ver Registros',
                      showToast: true
                   });
               }
          }
      }
  }
}
