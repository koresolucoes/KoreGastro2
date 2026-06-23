import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, OnInit, OnDestroy, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { CdkDragDrop, moveItemInArray, transferArrayItem, CdkDrag, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';

import { 
  Station, 
  Order, 
  OrderItem, 
  OrderItemStatus, 
  Recipe, 
  Employee, 
  OrderType, 
  IfoodOrderStatus, 
  IfoodWebhookLog 
} from '../../models/db.models';
import { ProcessedIfoodOrder, LogisticsStatus } from '../../models/app.models';

import { PrintingService } from '../../services/printing.service';
import { PosDataService } from '../../services/pos-data.service';
import { SettingsDataService } from '../../services/settings-data.service';
import { NotificationService } from '../../services/notification.service';
import { SoundNotificationService } from '../../services/sound-notification.service';
import { IfoodDataService } from '../../services/ifood-data.service';

// Import state services
import { PosStateService } from '../../services/pos-state.service';
import { HrStateService } from '../../services/hr-state.service';
import { RecipeStateService } from '../../services/recipe-state.service';
import { IfoodStateService } from '../../services/ifood-state.service';
import { DeliveryStateService } from '../../services/delivery-state.service';
import { DeliveryDataService } from '../../services/delivery-data.service';
import { WebhookService } from '../../services/webhook.service';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { IfoodMenuService, IfoodCancellationReason, IfoodTrackingData } from '../../services/ifood-menu.service';
import { OperationalAuthService } from '../../services/operational-auth.service';

// Import subcomponents for iFood and Delivery
import { CancelIfoodOrderModalComponent } from '../ifood-kds/cancel-ifood-order-modal/cancel-ifood-order-modal.component';
import { IfoodTrackingModalComponent } from '../ifood-kds/ifood-tracking-modal/ifood-tracking-modal.component';
import { RejectDisputeModalComponent } from '../ifood-kds/reject-dispute-modal/reject-dispute-modal.component';
import { VerifyCodeModalComponent } from '../ifood-kds/verify-code-modal/verify-code-modal.component';
import { OrderDetailsModalComponent as IfoodOrderDetailsModalComponent } from '../ifood-kds/order-details-modal/order-details-modal.component';
import { ProposeRefundModalComponent } from '../ifood-kds/propose-refund-modal/propose-refund-modal.component';

import { DeliveryDriversModalComponent } from '../delivery/delivery-drivers-modal/delivery-drivers-modal.component';
import { DeliveryOrderModalComponent } from '../delivery/delivery-order-modal/delivery-order-modal.component';
import { AssignDriverModalComponent } from '../delivery/assign-driver-modal/assign-driver-modal.component';
import { DeliveryDetailsModalComponent } from '../delivery/delivery-details-modal/delivery-details-modal.component';
import { DeliveryTrackingComponent } from '../delivery/delivery-tracking/delivery-tracking.component';
import { AssignDriverModalComponent as IfoodAssignDriverModalComponent } from '../ifood-kds/assign-driver-modal/assign-driver-modal.component';

interface BaseTicket {
  orderId: string;
  tableNumber: number;
  commandNumber?: number | null;
  tabName?: string | null;
  ticketElapsedTime: number;
  ticketTimerColor: string;
  isTicketLate: boolean;
  oldestTimestamp: string;
  orderType: OrderType;
  ifoodDisplayId?: string | null;
  isOrderCancelled?: boolean; 
  customerName?: string;
  waiterName?: string;
  isTest?: boolean;
}

interface KdsDisplayItem {
  id: string; 
  ids: string[]; 
  name: string;
  quantity: number; 
  status: OrderItemStatus;
  notes: string | null;
  timerColor: string;
  isLate: boolean;
  isCritical: boolean;
  attention_acknowledged: boolean;
  isHeld: boolean;
  timeToStart: number;
  stationName?: string;
  isCancelled: boolean;
  elapsedTimeSeconds: number;
  status_timestamps?: Record<string, string> | null; 
}

interface ProductionAggregateItem {
  name: string;
  quantity: number;
  status: OrderItemStatus;
  notes: string | null;
  minElapsedTime: number; 
  maxElapsedTime: number;
  isCritical: boolean;
  ids: string[]; 
}

interface StationTicket extends BaseTicket {
  items: KdsDisplayItem[];
}

interface ExpoTicket extends BaseTicket {
  items: KdsDisplayItem[];
  isReadyForPickup: boolean;
  progress: number; 
  completedCount: number;
  totalCount: number;
}

interface RecallItem {
  displayItem: KdsDisplayItem;
  ticketInfo: string; 
  finishedAt: number;
}

type ProcessedOrderItem = OrderItem & {
  elapsedTimeSeconds: number;
  timerColor: string;
  isLate: boolean;
  isCritical: boolean;
  prepTime: number; 
  attention_acknowledged: boolean;
  isHeld: boolean;
  timeToStart: number; 
  stationName?: string;
  isCancelled?: boolean; 
};

interface OrderWithDriver extends Order {
  driverName?: string;
}

@Component({
  selector: 'app-kds',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule,
    CdkDropList, 
    CdkDrag, 
    CdkDropListGroup,
    CancelIfoodOrderModalComponent, 
    IfoodTrackingModalComponent, 
    RejectDisputeModalComponent, 
    VerifyCodeModalComponent, 
    IfoodOrderDetailsModalComponent, 
    ProposeRefundModalComponent,
    DeliveryDriversModalComponent,
    DeliveryOrderModalComponent,
    AssignDriverModalComponent,
    DeliveryDetailsModalComponent,
    DeliveryTrackingComponent,
    IfoodAssignDriverModalComponent
  ],
  templateUrl: './kds.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KdsComponent implements OnInit, OnDestroy {
    posState = inject(PosStateService);
    hrState = inject(HrStateService);
    recipeState = inject(RecipeStateService);
    posDataService = inject(PosDataService);
    settingsDataService = inject(SettingsDataService);
    printingService = inject(PrintingService);
    notificationService = inject(NotificationService);
    soundNotificationService = inject(SoundNotificationService);
    ifoodDataService = inject(IfoodDataService);
    
    // New injected services
    route = inject(ActivatedRoute);
    ifoodState = inject(IfoodStateService);
    deliveryState = inject(DeliveryStateService);
    deliveryDataService = inject(DeliveryDataService);
    webhookService = inject(WebhookService);
    supabaseStateService = inject(SupabaseStateService);
    ifoodMenuService = inject(IfoodMenuService);
    operationalAuthService = inject(OperationalAuthService);

    stations = this.posState.stations;
    employees = this.hrState.employees;
    recipesById = this.recipeState.recipesById;
    stationsById = computed(() => new Map(this.stations().map(s => [s.id, s.name])));

    // Views can be Kitchen-stations, Production aggregate, Expo, or Unified Delivery & iFood!
    viewMode = signal<'station' | 'expo' | 'production' | 'delivery'>('station');
    selectedStation = signal<Station | null>(null);
    isStationDropdownOpen = signal(false);
    isStationSelectionModalOpen = signal(false);

    stationActiveCounts = computed(() => {
        const counts = new Map<string, number>();
        const activeItems = this.allKdsItemsProcessed().filter(item => 
          item.status === 'PENDENTE' || item.status === 'EM_PREPARO'
        );
        for (const item of activeItems) {
            if (item.station_id) {
                counts.set(item.station_id, (counts.get(item.station_id) || 0) + 1);
            }
        }
        return counts;
    });

    private timerInterval: ReturnType<typeof setInterval> | undefined;
    currentTime = signal(Date.now());
    
    updatingItems = signal<Set<string>>(new Set());
    updatingTickets = signal<Set<string>>(new Set());
    isDetailModalOpen = signal(false);
    selectedTicketForDetail = signal<StationTicket | ExpoTicket | null>(null);
    isAssignEmployeeModalOpen = signal(false);

    // RECALL / UNDO Feature
    isRecallModalOpen = signal(false);
    recentlyCompletedItems = signal<RecallItem[]>([]);

    // Sound alert states
    private processedNewItems = signal<Set<string>>(new Set());
    private alertedLateItems = signal<Set<string>>(new Set());
    private processedNewIfoodOrders = signal<Set<string>>(new Set());
    private ifoodAlertedForPrep = signal<Set<string>>(new Set());
    private ifoodProcessedDisputeIds = signal<Set<string>>(new Set());

    // Unified Delivery / iFood view support states
    deliverySubView = signal<'kanban' | 'tracking'>('kanban'); 
    isDriversModalOpen = signal(false);
    orderModalState = signal<'new' | Order | null>(null);
    
    isExternalAssignDriverModalOpen = signal(false);
    ordersToAssignDriver = signal<Order[]>([]);
    
    isDetailsModalOpen = signal(false);
    selectedOrderForDetails = signal<any | null>(null);
    
    isBatchMode = signal(false);
    selectedOrdersForBatch = signal<Set<string>>(new Set());
    
    todayDelivered = signal<any[]>([]);

    // iFood specifics modal support states
    isLogVisible = signal(false);
    selectedLogForDetail = signal<IfoodWebhookLog | null>(null);
    updatingOrders = signal<Set<string>>(new Set());
    isIfoodDetailModalOpen = signal(false);
    selectedOrderForDetail = signal<any | null>(null);
    
    isIfoodAssignDriverModalOpen = signal(false);
    orderForIfoodDriverModal = signal<any | null>(null);
    
    isCancelModalOpen = signal(false);
    orderToCancel = signal<any | null>(null);
    cancellationReasons = signal<IfoodCancellationReason[]>([]);
    isLoadingCancellationReasons = signal(false);
    
    isRejectDisputeModalOpen = signal(false);
    orderToReject = signal<any | null>(null);
    
    isVerifyCodeModalOpen = signal(false);
    orderForCodeModal = signal<any | null>(null);
    codeTypeForModal = signal<'pickup' | 'delivery' | null>(null);
    
    isTrackingModalOpen = signal(false);
    isLoadingTracking = signal(false);
    trackingData = signal<IfoodTrackingData | null>(null);
    orderForTracking = signal<any | null>(null);
    
    isProposeRefundModalOpen = signal(false);
    orderToProposeRefund = signal<any | null>(null);
    refundAmount = signal(0);

    evidenceImagesMap = signal<Map<string, string>>(new Map());

    async loadEvidenceImages(evidences: string[]) {
      for (const url of evidences) {
        if (this.evidenceImagesMap().has(url)) continue;
        try {
          const res = await this.ifoodDataService.getEvidenceImage(url);
          if (res && res.base64Image) {
            const dataUrl = `data:${res.contentType || 'image/jpeg'};base64,${res.base64Image}`;
            this.evidenceImagesMap.update(map => {
              const newMap = new Map(map);
              newMap.set(url, dataUrl);
              return newMap;
            });
          }
        } catch (e) {
          console.error('Failed to load proxy evidence image:', e);
        }
      }
    }

    webhookLogs = computed(() => 
      this.ifoodState.ifoodWebhookLogs()
        .sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    );

    constructor() {
        effect(() => {
            const stations = this.stations();
            if (stations.length > 0 && !this.selectedStation()) {
                this.selectStation(stations[0]);
            }
        });
        
        // Sound notification effect
        effect(() => {
            const allItems = this.allKdsItemsProcessed();
            const currentItemIds = new Set(allItems.map(i => i.id));
            const currentStationId = this.selectedStation()?.id;
            
            untracked(() => {
                const previouslyProcessed = this.processedNewItems();
                const previouslyLate = this.alertedLateItems();
                
                for (const item of allItems) {
                    if (!previouslyProcessed.has(item.id)) {
                        const isForThisView = this.viewMode() === 'expo' || item.station_id === currentStationId;
                        if (isForThisView) {
                            if (item.isCancelled) {
                                this.soundNotificationService.playAllergyAlertSound(); 
                            } else if (item.isCritical && !item.attention_acknowledged) {
                                this.soundNotificationService.playAllergyAlertSound();
                            } else {
                                this.soundNotificationService.playNewOrderSound();
                            }
                        }
                    }
                }
                
                for (const item of allItems) {
                    if (item.isLate && !item.isCancelled && !previouslyLate.has(item.id)) {
                         const isForThisView = this.viewMode() === 'expo' || item.station_id === currentStationId;
                         if (isForThisView) {
                            this.soundNotificationService.playDelayedOrderSound();
                            previouslyLate.add(item.id);
                         }
                    }
                }

                this.processedNewItems.set(currentItemIds);
                const currentLateIds = new Set(allItems.filter(i => i.isLate).map(i => i.id));
                this.alertedLateItems.set(currentLateIds);
            });
        });

        // iFood notification effect
        effect(() => {
            const orders = this.unifiedDeliveryOrders().filter(o => o.source === 'iFood');
            const currentOrderIds = new Set(orders.map(o => o.id));
            
            untracked(() => {
                const previouslyProcessed = this.processedNewIfoodOrders();
                const previouslyAlertedForPrep = this.ifoodAlertedForPrep();
                const now = Date.now();

                for (const order of orders) {
                    if (order.ifoodStatus && !previouslyProcessed.has(order.id) && order.ifoodStatus === 'RECEIVED' && !order.isScheduledAndHeld) {
                        this.soundNotificationService.playNewOrderSound();
                    }
                    
                    if (order.ifood_order_timing === 'SCHEDULED' && order.ifood_scheduled_at && !previouslyAlertedForPrep.has(order.id)) {
                        const prepTime = new Date(order.ifood_scheduled_at).getTime();
                        if (now >= (prepTime - 60000) && now < (prepTime + 60000)) {
                            this.soundNotificationService.playAllergyAlertSound();
                            this.notificationService.show(`Hora de preparar o pedido agendado #${order.ifood_display_id}!`, 'info', 10000);
                            previouslyAlertedForPrep.add(order.id);
                        }
                    }
                }
                this.processedNewIfoodOrders.set(currentOrderIds);
                this.ifoodAlertedForPrep.set(previouslyAlertedForPrep);
            });
        });

        // iFood dispute notification effect
        effect(() => {
          const ordersWithDisputes = this.unifiedDeliveryOrders().filter(o => o.source === 'iFood' && !!o.ifood_dispute_id);
          const currentDisputeIds = new Set(ordersWithDisputes.map(o => o.ifood_dispute_id!));

          untracked(() => {
            const previouslyProcessed = this.ifoodProcessedDisputeIds();
            
            for (const disputeId of currentDisputeIds) {
              if (!previouslyProcessed.has(disputeId)) {
                this.soundNotificationService.playAllergyAlertSound();
              }
            }
          });
          
          this.ifoodProcessedDisputeIds.set(currentDisputeIds);
        });
    }

    async ngOnInit() {
        this.timerInterval = setInterval(() => this.currentTime.set(Date.now()), 1000);
        await this.loadTodayDeliveredOrders();
        
        // Auto-select view mode based on routing path to let `/kds`, `/delivery`, `/ifood-kds` reuse this exact component smoothly
        this.route.url.subscribe(urlSegments => {
            const path = urlSegments[0]?.path;
            if (path === 'delivery' || path === 'ifood-kds') {
                this.setViewMode('delivery');
            }
        });
    }

    ngOnDestroy(): void {
        if (this.timerInterval) clearInterval(this.timerInterval);
    }

    private allKdsItemsProcessed = computed<ProcessedOrderItem[]>(() => {
        const now = this.currentTime();
        const recipesMap = this.recipesById();
        const stationsMap = this.stationsById();
        const criticalKeywords = ['alergia', 'sem glúten', 'sem lactose', 'celíaco', 'nozes', 'amendoim', 'vegetariano', 'vegano'];

        const itemsByOrder = new Map<string, ProcessedOrderItem[]>();

        for (const order of this.posState.orders()) {
            if (order.status !== 'OPEN' && order.status !== 'CANCELLED') continue;

            const isOrderCancelled = order.status === 'CANCELLED';

            if (!itemsByOrder.has(order.id)) itemsByOrder.set(order.id, []);
            const orderItems = itemsByOrder.get(order.id)!;

            for (const item of order.order_items) {
                if (isOrderCancelled && (item.status === 'SERVIDO' || item.status === 'PRONTO')) {
                    if (item.status === 'SERVIDO') continue;
                }

                const isItemCancelled = item.status === 'CANCELADO' || isOrderCancelled;
                
                if (isItemCancelled && item.status_timestamps?.['CANCELLATION_ACKNOWLEDGED']) {
                    continue; 
                }

                // Check for AUX_RECIPE_ID in notes for split KDS items
                let effectiveRecipeId = item.recipe_id;
                let cleanedNotesInitial = item.notes || '';
                const auxIdMatch = cleanedNotesInitial.match(/\[AUX_RECIPE_ID:(.+?)\]/);
                if (auxIdMatch && !effectiveRecipeId) {
                    effectiveRecipeId = auxIdMatch[1];
                }

                const recipe = recipesMap.get(effectiveRecipeId);
                let prepTimeInMinutes = recipe?.prep_time_in_minutes ?? 15;

                if (recipe) {
                    const match = item.name.match(/\((.*?)\)$/);
                    if (match) {
                        const prepName = match[1];
                        const preps = this.recipeState.recipePreparations().filter(p => p.recipe_id === recipe.id);
                        const specificPrep = preps.find(p => p.name === prepName);
                        if (specificPrep && specificPrep.prep_time_in_minutes) {
                            prepTimeInMinutes = specificPrep.prep_time_in_minutes;
                        }
                    }
                }

                const prepTimeSecs = prepTimeInMinutes * 60;
                
                const startTime = item.status_timestamps?.['PENDENTE'] ?? item.created_at;
                const pendingTimestamp = new Date(startTime).getTime();
                const elapsedTimeSeconds = Math.floor((now - pendingTimestamp) / 1000);
                const percentage = prepTimeSecs > 0 ? (elapsedTimeSeconds / prepTimeSecs) * 100 : 0;
                
                let timerColor = 'text-green-300';
                if (percentage > 50) timerColor = 'text-yellow-300';
                if (percentage > 80) timerColor = 'text-red-300';
                if (isItemCancelled) timerColor = 'text-gray-400';
                
                const note = item.notes?.toLowerCase() ?? '';
                let cleanedNotes = item.notes;
                if (cleanedNotes) {
                    cleanedNotes = cleanedNotes.replace(/\n?\[OPT_RECIPE_IDS:[^\]]*\]/g, '').replace(/\n?\[AUX_RECIPE_ID:[^\]]*\]/g, '').replace(/\n?\[AUX_PREP_IDX:[^\]]*\]/g, '').trim();
                    if (!cleanedNotes) cleanedNotes = null;
                }
                
                orderItems.push({
                    ...item,
                    recipe_id: effectiveRecipeId || item.recipe_id,
                    notes: cleanedNotes,
                    elapsedTimeSeconds,
                    timerColor,
                    isLate: !isItemCancelled && elapsedTimeSeconds > prepTimeSecs,
                    isCritical: criticalKeywords.some(keyword => note.includes(keyword)),
                    prepTime: prepTimeSecs,
                    attention_acknowledged: !!item.status_timestamps?.['ATTENTION_ACKNOWLEDGED'],
                    isHeld: false,
                    timeToStart: 0,
                    stationName: stationsMap.get(item.station_id),
                    isCancelled: isItemCancelled
                });
            }
        }

        const finalItems: ProcessedOrderItem[] = [];
        for (const orderItems of itemsByOrder.values()) {
            if (orderItems.length === 0) continue;
            
            const activeItems = orderItems.filter(i => !i.isCancelled && i.status !== 'PRONTO');
            const longestPrepTime = activeItems.length > 0 ? Math.max(...activeItems.map(item => item.prepTime)) : 0;
            
            for (const item of orderItems) {
                if (!item.isCancelled && item.status === 'PENDENTE') {
                    const timeToStart = longestPrepTime - item.prepTime;
                    if (item.elapsedTimeSeconds < timeToStart) {
                        item.timeToStart = timeToStart - item.elapsedTimeSeconds;
                    }
                }
                finalItems.push(item);
            }
        }
        return finalItems;
    });
    
    groupedKdsTickets = computed<StationTicket[]>(() => {
        const station = this.selectedStation();
        if (!station) return [];

        const itemsForStation = this.allKdsItemsProcessed().filter(item => 
          item.station_id === station.id &&
          (item.status === 'PENDENTE' || item.status === 'EM_PREPARO' || item.isCancelled)
        );
        return this.groupItemsIntoTickets(itemsForStation);
    });

    expoViewTickets = computed<ExpoTicket[]>(() => {
        const allItems = this.allKdsItemsProcessed().filter(item => 
          item.status === 'PENDENTE' || item.status === 'EM_PREPARO' || item.status === 'PRONTO' || item.isCancelled
        );
        const tickets = this.groupItemsIntoTickets(allItems);
        
        return tickets.map(ticket => {
            const allOrderItems = this.posState.orders().find(o => o.id === ticket.orderId)?.order_items ?? [];
            const totalCount = allOrderItems.length;
            const completedCount = allOrderItems.filter(item => item.status === 'PRONTO' || item.status === 'SERVIDO' || item.status === 'CANCELADO').length;
            const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

            if (ticket.isOrderCancelled) {
                return { ...ticket, isReadyForPickup: false, progress: 100, completedCount, totalCount };
            }
            
            const isReadyForPickup = totalCount > 0 && completedCount === totalCount;
            return { ...ticket, isReadyForPickup, progress, completedCount, totalCount };
        });
    });

    productionAggregates = computed<ProductionAggregateItem[]>(() => {
        const station = this.selectedStation();
        if (!station) return [];

        const items = this.allKdsItemsProcessed().filter(item => 
            item.station_id === station.id &&
            !item.isCancelled &&
            !item.isHeld &&
            (item.status === 'PENDENTE' || item.status === 'EM_PREPARO')
        );

        const groups = new Map<string, ProductionAggregateItem>();

        for (const item of items) {
            const key = `${item.recipe_id}_${item.notes || ''}_${item.status}`;
            
            if (!groups.has(key)) {
                groups.set(key, {
                    name: item.name,
                    quantity: 0,
                    status: item.status,
                    notes: item.notes,
                    minElapsedTime: item.elapsedTimeSeconds,
                    maxElapsedTime: item.elapsedTimeSeconds,
                    isCritical: item.isCritical,
                    ids: []
                });
            }

            const group = groups.get(key)!;
            group.quantity += item.quantity;
            group.ids.push(item.id);
            group.minElapsedTime = Math.min(group.minElapsedTime, item.elapsedTimeSeconds);
            group.maxElapsedTime = Math.max(group.maxElapsedTime, item.elapsedTimeSeconds);
            if (item.isCritical) group.isCritical = true;
        }

        return Array.from(groups.values()).sort((a, b) => b.maxElapsedTime - a.maxElapsedTime);
    });

    // UNIFIED DELIVERY & iFOOD COMPUTED SIGNAL
    unifiedDeliveryOrders = computed<any[]>(() => {
        const now = this.currentTime();
        const allLogs = this.webhookLogs();

        const ifoodMapped = this.posState.openOrders()
          .filter(o => o.order_type === 'iFood-Delivery' || o.order_type === 'iFood-Takeout')
          .map(order => {
            let isScheduledAndHeld = false;
            let timeToPrepare = 0;
            let startTime = new Date(order.timestamp).getTime();

            if (order.ifood_order_timing === 'SCHEDULED' && order.ifood_scheduled_at) {
              const prepStartTime = new Date(order.ifood_scheduled_at).getTime();

              if (now < prepStartTime) {
                isScheduledAndHeld = true;
                timeToPrepare = Math.floor((prepStartTime - now) / 1000);
              } else {
                startTime = prepStartTime;
              }
            }
            
            const elapsedTime = isScheduledAndHeld ? 0 : Math.floor((now - startTime) / 1000);
            const isLate = elapsedTime > 600;

            const isTest = order.notes ? order.notes.includes('[TESTE IA]') : false;

            let timerColor = 'text-green-300';
            if (isTest) {
                timerColor = 'text-purple-300';
            } else if (elapsedTime > 300) {
                timerColor = 'text-yellow-300';
            } else if (isLate) {
                timerColor = 'text-red-300';
            }
            if (isScheduledAndHeld && !isTest) {
              timerColor = 'text-cyan-300';
            }

            const requiresCode = allLogs.some(log => log.ifood_order_id === order.ifood_order_id && log.event_code === 'DELIVERY_DROP_CODE_REQUESTED');
            
            const paymentDetails = this.getPaymentDetails(order);
            const totalAmount = this.getOrderTotalAmount(order);
            
            let disputeDetails = order.ifood_dispute_details as any;
            if (disputeDetails && typeof disputeDetails === 'string') {
              try { disputeDetails = JSON.parse(disputeDetails); } catch (e) { disputeDetails = null; }
            }

            const evidences = disputeDetails?.metadata?.evidences;
            const disputeEvidences = evidences?.map((e: any) => e.url).filter(Boolean) || [];

            const ifoodStatus = this.getIfoodStatus(order);

            let delivery_status: string;
            if (ifoodStatus === 'RECEIVED') {
              delivery_status = 'AWAITING_PREP';
            } else if (ifoodStatus === 'IN_PREPARATION') {
              delivery_status = 'IN_PREPARATION';
            } else if (ifoodStatus === 'READY_FOR_PICKUP') {
              delivery_status = 'READY_FOR_DISPATCH';
            } else if (ifoodStatus === 'DISPATCHED') {
              delivery_status = 'OUT_FOR_DELIVERY';
            } else {
              delivery_status = 'AWAITING_PREP';
            }

            return {
              ...order,
              source: 'iFood' as const,
              driverName: order.delivery_drivers?.name ?? 'Logística iFood',
              elapsedTime,
              isLate,
              timerColor,
              ifoodStatus,
              logisticsStatus: this.getLogisticsStatus(order, allLogs),
              requiresDeliveryCode: requiresCode,
              paymentDetails: paymentDetails.paymentDetails,
              changeDue: paymentDetails.changeDue,
              isScheduledAndHeld,
              timeToPrepare,
              totalAmount,
              subTotal: (order.ifood_payments as any)?.total?.subTotal ?? order.order_items.filter((i: any) => !(i.notes?.includes('[AUX_PREP_IDX:') && !i.notes?.includes('[AUX_PREP_IDX:0]'))).reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0),
              deliveryFee: (order.ifood_payments as any)?.total?.deliveryFee ?? 0,
              additionalFees: (order.ifood_payments as any)?.total?.additionalFees ?? 0,
              disputeEvidences,
              delivery_status
            };
          });

        const externalMapped = this.posState.openOrders()
          .filter(o => o.order_type === 'External-Delivery' || o.order_type === 'External-Pickup')
          .map(order => {
            const startTime = new Date(order.timestamp).getTime();
            const elapsedTime = Math.floor((now - startTime) / 1000);
            const isLate = elapsedTime > 1800; 

            const isTest = order.notes ? order.notes.includes('[TESTE IA]') : false;

            let timerColor = 'text-green-300';
            if (isTest) {
                timerColor = 'text-purple-300';
            } else if (elapsedTime > 900) {
                timerColor = 'text-yellow-300';
            } else if (isLate) {
                timerColor = 'text-red-300';
            }

            const totalAmount = order.order_items.filter((i: any) => !(i.notes?.includes('[AUX_PREP_IDX:') && !i.notes?.includes('[AUX_PREP_IDX:0]'))).reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0) + (order.delivery_cost ?? 0);

            return {
              ...order,
              source: 'External' as const,
              driverName: order.delivery_drivers?.name ?? 'Não atribuído',
              elapsedTime,
              isLate,
              timerColor,
              ifoodStatus: null,
              logisticsStatus: null,
              requiresDeliveryCode: false,
              paymentDetails: (order as any).payment_method ? `Pago na entrega (${(order as any).payment_method})` : 'A pagar',
              changeDue: 0,
              isScheduledAndHeld: false,
              timeToPrepare: 0,
              totalAmount,
              subTotal: order.order_items.filter((i: any) => !(i.notes?.includes('[AUX_PREP_IDX:') && !i.notes?.includes('[AUX_PREP_IDX:0]'))).reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0),
              deliveryFee: order.delivery_cost ?? 0,
              additionalFees: 0,
              disputeEvidences: [],
              delivery_status: order.delivery_status || 'AWAITING_PREP'
            };
          });

        return [...ifoodMapped, ...externalMapped].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    });

    // Unify lists for Drag Drop Kanban Columns
    deliveryWaiting = computed(() => this.unifiedDeliveryOrders().filter(o => o.delivery_status === 'AWAITING_PREP'));
    deliveryPreparing = computed(() => this.unifiedDeliveryOrders().filter(o => o.delivery_status === 'IN_PREPARATION'));
    deliveryReady = computed(() => this.unifiedDeliveryOrders().filter(o => o.delivery_status === 'READY_FOR_DISPATCH'));
    deliveryEnRoute = computed(() => this.unifiedDeliveryOrders().filter(o => o.delivery_status === 'OUT_FOR_DELIVERY'));
    deliveryCompleted = computed(() => {
        // Traditional delivery orders finished today
        const externalDelivered = this.todayDelivered()
          .map(order => {
            const totalAmount = order.order_items.filter((i: any) => !(i.notes?.includes('[AUX_PREP_IDX:') && !i.notes?.includes('[AUX_PREP_IDX:0]'))).reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0) + (order.delivery_cost ?? 0);
            return {
              ...order,
              source: 'External' as const,
              driverName: order.delivery_drivers?.name ?? 'Não atribuído',
              elapsedTime: 0,
              isLate: false,
              timerColor: order.status === 'CANCELLED' ? 'text-red-400' : 'text-gray-400',
              ifoodStatus: null,
              logisticsStatus: null,
              requiresDeliveryCode: false,
              paymentDetails: order.payment_method ? `Pago na entrega (${order.payment_method})` : 'Pago',
              changeDue: 0,
              isScheduledAndHeld: false,
              timeToPrepare: 0,
              totalAmount,
              subTotal: order.order_items.filter((i: any) => !(i.notes?.includes('[AUX_PREP_IDX:') && !i.notes?.includes('[AUX_PREP_IDX:0]'))).reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0),
              deliveryFee: order.delivery_cost ?? 0,
              additionalFees: 0,
              disputeEvidences: [],
              delivery_status: 'DELIVERED'
            };
          });

        // Mapped finished iFood orders
        const ifoodFinished = this.ifoodState.recentlyFinishedIfoodOrders()
          .map(order => {
            const paymentDetails = this.getPaymentDetails(order);
            const totalAmount = this.getOrderTotalAmount(order);
            const subTotal = (order.ifood_payments as any)?.total?.subTotal ?? order.order_items.filter((i: any) => !(i.notes?.includes('[AUX_PREP_IDX:') && !i.notes?.includes('[AUX_PREP_IDX:0]'))).reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
            const deliveryFee = (order.ifood_payments as any)?.total?.deliveryFee ?? 0;
            
            return {
              ...order,
              source: 'iFood' as const,
              driverName: order.delivery_drivers?.name ?? 'Logística iFood',
              elapsedTime: 0,
              isLate: false,
              timerColor: order.status === 'CANCELLED' ? 'text-red-400' : 'text-gray-400',
              ifoodStatus: order.status as IfoodOrderStatus,
              logisticsStatus: null,
              requiresDeliveryCode: false,
              paymentDetails: paymentDetails.paymentDetails,
              changeDue: paymentDetails.changeDue,
              isScheduledAndHeld: false,
              timeToPrepare: 0,
              totalAmount,
              subTotal,
              deliveryFee,
              additionalFees: 0,
              disputeEvidences: [],
              delivery_status: 'DELIVERED'
            };
          });

        return [...externalDelivered, ...ifoodFinished].sort((a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime());
    });

    private groupItemsForDisplay(items: ProcessedOrderItem[]): KdsDisplayItem[] {
        const groupedMap = new Map<string, KdsDisplayItem>();

        for (const item of items) {
            const key = `${item.recipe_id}_${item.name}_${item.status}_${item.notes || ''}_${item.isHeld}_${item.isCritical}_${item.isCancelled}`;

            if (groupedMap.has(key)) {
                const group = groupedMap.get(key)!;
                group.quantity += item.quantity;
                group.ids.push(item.id);
            } else {
                groupedMap.set(key, {
                    id: item.id, 
                    ids: [item.id],
                    name: item.name,
                    quantity: item.quantity,
                    status: item.status,
                    notes: item.notes,
                    timerColor: item.timerColor,
                    isLate: item.isLate,
                    isCritical: item.isCritical,
                    attention_acknowledged: item.attention_acknowledged,
                    isHeld: item.isHeld,
                    timeToStart: item.timeToStart,
                    stationName: item.stationName,
                    isCancelled: item.isCancelled,
                    elapsedTimeSeconds: item.elapsedTimeSeconds,
                    status_timestamps: item.status_timestamps
                });
            }
        }
        
        return Array.from(groupedMap.values());
    }

    private groupItemsIntoTickets(items: ProcessedOrderItem[]): StationTicket[] {
        const now = this.currentTime();
        const itemsByOrderId = new Map<string, ProcessedOrderItem[]>();

        for (const item of items) {
            if (!itemsByOrderId.has(item.order_id)) {
                itemsByOrderId.set(item.order_id, []);
            }
            itemsByOrderId.get(item.order_id)!.push(item);
        }

        const tickets: StationTicket[] = [];
        for (const [orderId, orderItems] of itemsByOrderId.entries()) {
            if (orderItems.length === 0) continue;
            
            const order = this.posState.orders().find(o => o.id === orderId);
            if (!order) continue;

            orderItems.sort((a, b) => b.prepTime - a.prepTime);

            const oldestItem = orderItems.reduce((oldest, current) => 
                (new Date(current.status_timestamps?.['PENDENTE'] ?? current.created_at) < new Date(oldest.status_timestamps?.['PENDENTE'] ?? oldest.created_at)) ? current : oldest
            );
            const oldestTimestamp = new Date(oldestItem.status_timestamps?.['PENDENTE'] ?? oldestItem.created_at).getTime();
            const ticketElapsedTime = Math.floor((now - oldestTimestamp) / 1000);
            
            const avgPrepTime = orderItems.reduce((acc, item) => acc + item.prepTime, 0) / orderItems.length;
            const percentage = avgPrepTime > 0 ? (ticketElapsedTime / avgPrepTime) * 100 : 0;
            
            const isTest = order.notes ? order.notes.includes('[TESTE IA]') : false;

            let ticketTimerColor = 'bg-green-600';
            if (isTest) {
                ticketTimerColor = 'bg-purple-600';
            } else if (percentage > 50) {
                ticketTimerColor = 'bg-yellow-600';
            } else if (percentage > 80) {
                ticketTimerColor = 'bg-red-600';
            }
            
            const isOrderCancelled = order.status === 'CANCELLED';
            if (isOrderCancelled) {
                ticketTimerColor = 'bg-red-800'; 
            }

            const groupedItems = this.groupItemsForDisplay(orderItems);

            tickets.push({
                orderId: order.id,
                tableNumber: order.table_number,
                commandNumber: order.command_number, 
                tabName: order.tab_name, 
                items: groupedItems,
                ticketElapsedTime,
                ticketTimerColor,
                isTicketLate: !isOrderCancelled && !isTest && ticketElapsedTime > avgPrepTime,
                oldestTimestamp: new Date(oldestTimestamp).toISOString(),
                orderType: order.order_type,
                ifoodDisplayId: order.ifood_display_id,
                isOrderCancelled,
                customerName: order.customers?.name,
                waiterName: order.waiter?.name,
                isTest,
                notes: order.notes
            });
        }
        return tickets.sort((a, b) => new Date(a.oldestTimestamp).getTime() - new Date(b.oldestTimestamp).getTime());
    }

    selectStation(station: Station) { this.selectedStation.set(station); }
    setViewMode(mode: 'station' | 'expo' | 'production' | 'delivery') { this.viewMode.set(mode); }

    getTicketTotalQty(items: KdsDisplayItem[]): number {
        if (!items) return 0;
        return items.reduce((acc, item) => acc + item.quantity, 0);
    }

    async assignEmployeeToStation(employeeId: string | null) {
        const station = this.selectedStation();
        if (!station) return;
        
        const { success, error } = await this.settingsDataService.assignEmployeeToStation(station.id, employeeId);
        if (!success) await this.notificationService.alert(`Falha ao atribuir funcionário: ${error?.message}`);
        this.isAssignEmployeeModalOpen.set(false);
    }
    
    // Batch Update Methods using IDs array
    async acknowledgeAttention(item: KdsDisplayItem, event: MouseEvent) {
        event.stopPropagation();
        if (this.updatingItems().has(item.id)) return;

        this.soundNotificationService.playConfirmationSound();
        this.setUpdatingForGroup(item.ids, true);

        const promises = item.ids.map(id => this.posDataService.acknowledgeOrderItemAttention(id));
        await Promise.all(promises);
        
        this.setUpdatingForGroup(item.ids, false);
    }

    async acknowledgeCancellation(item: KdsDisplayItem, event: MouseEvent) {
        event.stopPropagation();
        if (this.updatingItems().has(item.id)) return;

        this.soundNotificationService.playConfirmationSound();
        this.setUpdatingForGroup(item.ids, true);
        
        const promises = item.ids.map(id => this.posDataService.acknowledgeCancellation(id));
        await Promise.all(promises);
        
        this.setUpdatingForGroup(item.ids, false);
    }
    
    async markAsReady(item: KdsDisplayItem, ticket: BaseTicket | null, event: MouseEvent) {
        event.stopPropagation();
        if (this.updatingItems().has(item.id) || item.status === 'PRONTO') {
            return;
        }

        this.soundNotificationService.playConfirmationSound();
        this.setUpdatingForGroup(item.ids, true);

        const { success, error } = await this.posDataService.updateMultipleItemStatuses(item.ids, 'PRONTO');
        
        if (!success) {
            await this.notificationService.alert(`Erro ao marcar como pronto: ${error?.message}`);
        } else {
             this.addToRecallList(item, ticket);
        }
        
        this.setUpdatingForGroup(item.ids, false);
    }

    async updateStatus(item: KdsDisplayItem, forceStart = false, event?: MouseEvent) {
        event?.stopPropagation();
        if (item.isCancelled) return;
        if (this.updatingItems().has(item.id) || (item.isHeld && !forceStart)) return;

        let nextStatus: OrderItemStatus;
        switch (item.status) {
            case 'PENDENTE': nextStatus = 'EM_PREPARO'; break;
            case 'EM_PREPARO': nextStatus = 'PRONTO'; break;
            default: return;
        }
        
        if (nextStatus === 'PRONTO') {
             const parentTicket = this.groupedKdsTickets().find(t => t.items.some(i => i.id === item.id));
             await this.markAsReady(item, parentTicket || null, event || new MouseEvent('click'));
             return;
        }
        
        this.soundNotificationService.playConfirmationSound();
        this.setUpdatingForGroup(item.ids, true);

        const { success, error } = await this.posDataService.updateMultipleItemStatuses(item.ids, nextStatus);

        if (!success) await this.notificationService.alert(`Erro ao atualizar o status do item: ${error?.message}`);
        
        this.setUpdatingForGroup(item.ids, false);
    }

    async startHeldItemNow(item: KdsDisplayItem, event: MouseEvent) {
        event.stopPropagation();
        const confirmed = await this.notificationService.confirm(`Tem certeza que deseja iniciar o preparo de "${item.quantity}x ${item.name}" antes do tempo programado?`, 'Iniciar Preparo?');
        if (confirmed) {
            await this.updateStatus(item, true);
        }
    }
    
    // Batch Actions for Ticket
    async batchUpdateTicketStatus(ticket: StationTicket, action: 'START_ALL' | 'FINISH_ALL') {
        const itemIdsToUpdate: string[] = [];
        let itemsForRecall: KdsDisplayItem[] = [];

        if (action === 'START_ALL') {
            ticket.items.forEach(item => {
                if (item.status === 'PENDENTE' && !item.isHeld && !item.isCancelled) {
                    itemIdsToUpdate.push(...item.ids);
                }
            });
            if (itemIdsToUpdate.length === 0) return;
            
            this.soundNotificationService.playConfirmationSound();
            await this.posDataService.updateMultipleItemStatuses(itemIdsToUpdate, 'EM_PREPARO');
            
        } else if (action === 'FINISH_ALL') {
             ticket.items.forEach(item => {
                if ((item.status === 'PENDENTE' || item.status === 'EM_PREPARO') && !item.isHeld && !item.isCancelled) {
                    itemIdsToUpdate.push(...item.ids);
                    itemsForRecall.push(item);
                }
            });
            if (itemIdsToUpdate.length === 0) return;

            this.soundNotificationService.playConfirmationSound();
            const { success } = await this.posDataService.updateMultipleItemStatuses(itemIdsToUpdate, 'PRONTO');
            
            if (success) {
                itemsForRecall.forEach(item => this.addToRecallList(item, ticket));
            }
        }
    }

    // Batch actions for Production View
    async advanceProductionItems(item: ProductionAggregateItem) {
        if (this.updatingItems().has(item.ids[0])) return;
        
        let nextStatus: OrderItemStatus;
        if (item.status === 'PENDENTE') nextStatus = 'EM_PREPARO';
        else if (item.status === 'EM_PREPARO') nextStatus = 'PRONTO';
        else return;

        this.soundNotificationService.playConfirmationSound();
        this.setUpdatingForGroup(item.ids, true);

        const { success, error } = await this.posDataService.updateMultipleItemStatuses(item.ids, nextStatus);
        if (!success) await this.notificationService.alert(`Erro ao atualizar itens: ${error?.message}`);
        
        this.setUpdatingForGroup(item.ids, false);
    }

    private setUpdatingForGroup(ids: string[], isUpdating: boolean) {
        this.updatingItems.update(set => {
            const newSet = new Set(set);
            ids.forEach(id => isUpdating ? newSet.add(id) : newSet.delete(id));
            return newSet;
        });
    }

    // --- RECALL (UNDO) LOGIC ---
    private addToRecallList(item: KdsDisplayItem, ticket: BaseTicket | null) {
        let ticketInfo = 'Desconhecido';
        if (ticket) {
            if (ticket.orderType === 'Dine-in') ticketInfo = `Mesa ${ticket.tableNumber}`;
            else if (ticket.orderType === 'Tab') ticketInfo = ticket.tabName || `Comanda #${ticket.commandNumber}`;
            else if (ticket.orderType === 'QuickSale') ticketInfo = 'Caixa';
            else if (ticket.ifoodDisplayId) ticketInfo = `#${ticket.ifoodDisplayId}`;
            else ticketInfo = 'Delivery';
        }

        const recallItem: RecallItem = {
            displayItem: item,
            ticketInfo: ticketInfo,
            finishedAt: Date.now()
        };

        this.recentlyCompletedItems.update(list => [recallItem, ...list].slice(0, 20)); 
    }
    
    async restoreItem(recallItem: RecallItem) {
        const item = recallItem.displayItem;
        this.soundNotificationService.playConfirmationSound();
        await this.posDataService.updateMultipleItemStatuses(item.ids, 'EM_PREPARO');
        
        this.recentlyCompletedItems.update(list => list.filter(i => i !== recallItem));
        
        if (this.recentlyCompletedItems().length === 0) {
            this.isRecallModalOpen.set(false);
        }
    }

    async markOrderAsServed(ticket: ExpoTicket) {
        if (this.updatingTickets().has(ticket.orderId)) return;
    
        const order = this.posState.orders().find(o => o.id === ticket.orderId);
        if (!order) {
            await this.notificationService.alert('Erro: Pedido não encontrado.');
            return;
        }
    
        this.soundNotificationService.playConfirmationSound();
        this.updatingTickets.update(set => new Set(set).add(ticket.orderId));
    
        try {
            if (order.ifood_order_id) {
                const targetStatus: IfoodOrderStatus = order.order_type === 'iFood-Delivery' ? 'DISPATCHED' : 'READY_FOR_PICKUP';
                const { success, error } = await this.ifoodDataService.sendStatusUpdate(order.ifood_order_id, targetStatus);
                if (!success) {
                    throw error || new Error('Falha ao comunicar com a API do iFood.');
                }
            }
    
            const { success, error } = await this.posDataService.markOrderAsServed(order.id);
            if (!success) {
                throw error;
            }
    
        } catch (e: any) {
            await this.notificationService.alert(`Ocorreu um erro: ${e.message}`);
            this.updatingTickets.update(set => {
                const newSet = new Set(set);
                newSet.delete(ticket.orderId);
                return newSet;
            });
        }
    }
    
    openDetailModal(ticket: StationTicket | ExpoTicket) {
        this.selectedTicketForDetail.set(ticket);
        this.isDetailModalOpen.set(true);
    }

    closeDetailModal() {
        this.isDetailModalOpen.set(false);
        this.selectedTicketForDetail.set(null);
    }

    async printTicket(ticket: StationTicket | ExpoTicket) {
        const station = this.selectedStation();
        if (station) {
             const itemsForPrint: any[] = ticket.items.map(item => ({
                name: item.name,
                quantity: item.quantity,
                notes: item.notes
             }));

            const orderShellForPrinting = { 
                id: ticket.orderId, 
                table_number: ticket.tableNumber, 
                timestamp: ticket.oldestTimestamp,
                command_number: ticket.commandNumber,
                tab_name: ticket.tabName 
            } as Order;
            
            this.printingService.printOrder(orderShellForPrinting, itemsForPrint, station);
        } else {
            await this.notificationService.alert('Erro: Nenhuma estação selecionada.');
        }
    }

    formatTime(seconds: number): string {
        if (isNaN(seconds) || seconds < 0) return '00:00';
        
        if (seconds >= 3600) {
          const hours = Math.floor(seconds / 3600);
          const mins = Math.floor((seconds % 3600) / 60);
          const secs = seconds % 60;
          return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    getStatusHistory(timestamps: Record<string, string> | null | undefined): { status: string; time: string }[] {
        if (!timestamps) return [];
        return Object.entries(timestamps)
            .map(([status, time]) => ({ status, time: time as string }))
            .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    }

    getItemStatusClass(status: OrderItemStatus): string {
      switch (status) {
        case 'PENDENTE': return 'border-yellow-500';
        case 'EM_PREPARO': return 'border-blue-500';
        case 'CANCELADO': return 'border-red-600 bg-red-900/30';
        default: return 'border-gray-600';
      }
    }

    // ==========================================
    // UNIFIED DELIVERY BOARD METHODS & DRAG DROP
    // ==========================================
    async loadTodayDeliveredOrders() {
        const { data, error } = await this.deliveryDataService.getTodayDeliveredOrders();
        if (!error && data) {
            this.todayDelivered.set(data);
        }
    }

    drop(event: CdkDragDrop<any[]>) {
      if (event.previousContainer === event.container) {
        moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      } else {
        const movedOrder = event.previousContainer.data[event.previousIndex];
        const newStatus = event.container.id as any;

        if (movedOrder.source === 'iFood') {
          if (newStatus === 'IN_PREPARATION') {
            if (movedOrder.ifoodStatus === 'RECEIVED') {
              this.confirmOrderAndPrepare(movedOrder);
            } else {
              this.notificationService.show('Este pedido iFood não pode ser movido para preparação.', 'info');
            }
          } else if (newStatus === 'READY_FOR_DISPATCH' || newStatus === 'OUT_FOR_DELIVERY') {
            if (movedOrder.ifoodStatus === 'RECEIVED' || movedOrder.ifoodStatus === 'IN_PREPARATION') {
              this.markOrderAsReadyForDispatch(movedOrder);
            } else {
              this.notificationService.show('Este pedido iFood já está pronto ou despachado.', 'info');
            }
          } else {
            this.notificationService.show('Ações de status de iFood dependem do fluxo oficial da API.', 'info');
          }
          return;
        }

        // Traditional Delivery Order
        if (newStatus === 'OUT_FOR_DELIVERY' && !movedOrder.delivery_driver_id) {
          this.notificationService.show('Atribua um entregador antes de mover para "Em Rota".', 'warning');
          this.openExternalAssignDriverModal(movedOrder);
          return;
        }
        
        if (newStatus === 'DELIVERED') {
          this.finalizeDelivery(movedOrder);
          return;
        }

        transferArrayItem(
          event.previousContainer.data,
          event.container.data,
          event.previousIndex,
          event.currentIndex,
        );
        
        this.updateOrderStatus(movedOrder, newStatus);
      }
    }

    async updateOrderStatus(order: Order, status: any) {
      const { success, error } = await this.deliveryDataService.updateDeliveryStatus(order.id, status);
      if (success) {
        this.webhookService.triggerWebhook('delivery.status_updated', {
          orderId: order.id,
          status: status,
          driverId: order.delivery_driver_id,
          timestamp: new Date().toISOString(),
          fullOrder: order
        });
        
        // Notify WhatsApp
        if (order.ifood_order_id?.startsWith('wa-') || order.ifood_order_id?.startsWith('test-ia-')) {
             try {
                  console.log("Calling notify-status for WhatsApp:", order.id, status);
                  const res = await fetch('/api/whatsapp/notify-status', {
                       method: 'POST',
                       headers: { 'Content-Type': 'application/json' },
                       body: JSON.stringify({ orderId: order.id, status })
                  });
                  console.log("Notify Status Res:", res.status, await res.text());
             } catch(e) {
                  console.error("Notify Status Err:", e);
             }
        }
      } else {
        this.notificationService.show(`Erro ao atualizar status do pedido: ${error?.message}`, 'error');
      }
    }

    openEditModal(order: Order) {
      if (order.delivery_status === 'OUT_FOR_DELIVERY' || order.delivery_status === 'DELIVERED') {
        this.notificationService.show('Não é possível editar um pedido que já está em rota ou foi entregue.', 'info');
        return;
      }
      this.orderModalState.set(order);
    }

    openExternalAssignDriverModal(order: any) {
      this.ordersToAssignDriver.set([order]);
      this.isExternalAssignDriverModalOpen.set(true);
    }

    toggleBatchMode() {
        this.isBatchMode.update(v => !v);
        if(!this.isBatchMode()) {
            this.selectedOrdersForBatch.set(new Set());
        }
    }

    toggleOrderSelection(orderId: string) {
        this.selectedOrdersForBatch.update(set => {
            const newSet = new Set(set);
            if(newSet.has(orderId)) newSet.delete(orderId);
            else newSet.add(orderId);
            return newSet;
        });
    }

    openBatchAssignModal() {
        if(this.selectedOrdersForBatch().size === 0) return;
        
        const ordersToAssign = this.deliveryReady().filter(o => this.selectedOrdersForBatch().has(o.id));
        this.ordersToAssignDriver.set(ordersToAssign);
        this.isExternalAssignDriverModalOpen.set(true);
    }

    async handleDriverAssigned(event: { driverId: string }) {
      this.isExternalAssignDriverModalOpen.set(false);
      const orders = this.ordersToAssignDriver();
      if (!orders || orders.length === 0) return;

      const driver = this.deliveryState.deliveryDrivers().find(d => d.id === event.driverId);
      if (!driver) {
          this.notificationService.show('Entregador não encontrado.', 'error');
          return;
      }

      let successCount = 0;
      let lastError: any = null;
      
      for(const order of orders) {
          const distance = order.delivery_distance_km ?? 0;
          const deliveryCost = (driver.base_rate ?? 0) + ((driver.rate_per_km ?? 0) * distance);
          
          const { success, error } = await this.deliveryDataService.assignDriverToOrder(order.id, event.driverId, distance, deliveryCost);
      
          if (success) {
            successCount++;
            this.webhookService.triggerWebhook('delivery.status_updated', {
              orderId: order.id,
              status: 'OUT_FOR_DELIVERY',
              driverId: event.driverId,
              timestamp: new Date().toISOString(),
              fullOrder: order
            });
          } else {
            lastError = error;
          }
      }
      
      if(successCount > 0) {
          this.notificationService.show(`Atribuído(s) com sucesso e movido(s) para "Em Rota"!`, 'success');
          this.selectedOrdersForBatch.set(new Set()); 
          this.isBatchMode.set(false);
      } else {
          const errMsg = lastError?.message || lastError?.details || 'Erro desconhecido';
          this.notificationService.show(`Erro ao atribuir entregador: ${errMsg}`, 'error');
      }
    }

    async finalizeDelivery(order: any) {
      const confirmed = await this.notificationService.confirm(
        `Confirmar a finalização da entrega para o pedido #${order.id.slice(0, 8)}?`,
        'Finalizar Entrega'
      );
      if (!confirmed) return;

      const { success, error } = await this.deliveryDataService.finalizeDeliveryOrder(order);
      if (success) {
        this.notificationService.show('Entrega finalizada com sucesso!', 'success');
        
        this.todayDelivered.update(list => [{
            ...order, 
            status: 'COMPLETED', 
            delivery_status: 'DELIVERED', 
            completed_at: new Date().toISOString()
        }, ...list]);

        this.webhookService.triggerWebhook('delivery.status_updated', {
          orderId: order.id,
          status: 'DELIVERED',
          driverId: order.delivery_driver_id,
          timestamp: new Date().toISOString(),
          fullOrder: order
        });
      } else {
        this.notificationService.show(`Erro ao finalizar entrega: ${error?.message}`, 'error');
      }
    }

    openDetailsModal(order: any) {
      this.selectedOrderForDetails.set(order);
      this.isDetailsModalOpen.set(true);
    }

    closeDetailsModal() {
      this.isDetailsModalOpen.set(false);
      this.selectedOrderForDetails.set(null);
    }
    
    getOrderTotal(order: Order): number {
      const itemsTotal = order.order_items.filter((i: any) => !(i.notes?.includes('[AUX_PREP_IDX:') && !i.notes?.includes('[AUX_PREP_IDX:0]'))).reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
      const deliveryCost = order.delivery_cost ?? 0;
      return itemsTotal + deliveryCost;
    }

    // ==========================================
    // INTEGRATED IFOOD SPECIFICS METHODS
    // ==========================================
    hasRefundAlternative(order: any): boolean {
      return !!order.ifood_dispute_details?.alternatives?.some((alt: any) => alt.type === 'REFUND');
    }

    getRefundAlternative(order: any): any | undefined {
      return order.ifood_dispute_details?.alternatives?.find((alt: any) => alt.type === 'REFUND');
    }

    hasAdditionalTimeAlternative(order: any): boolean {
      return !!order.ifood_dispute_details?.alternatives?.some((alt: any) => alt.type === 'ADDITIONAL_TIME');
    }
    
    getDisputeMessage(order: any | null): string | null {
      if (!order || !order.ifood_dispute_details) return null;
      
      let details = order.ifood_dispute_details as any;
      if (typeof details === 'string') {
        try { details = JSON.parse(details); } catch (e) { return null; }
      }
      
      if (details && typeof details === 'object') {
          if ('message' in details && details.message) {
            return details.message as string;
          }
          if (details.metadata?.items && Array.isArray(details.metadata.items) && details.metadata.items.length > 0) {
              return details.metadata.items.map((item: any) => item.reason).filter(Boolean).join('; ');
          }
      }
      return null;
    }

    private getIfoodStatus(order: Order): IfoodOrderStatus {
      let details: any = order.ifood_dispute_details;
      if (details && typeof details === 'string') {
        try { details = JSON.parse(details); } catch (e) { details = null; }
      }
    
      if (details?.handshakeType === 'AFTER_DELIVERY' || details?.handshakeType === 'AFTER_DELIVERY_PARTIALLY') {
        return 'RECEIVED';
      }
    
      if (order.status === 'CANCELLED') return 'CANCELLED';
    
      const items = order.order_items || [];
      if (items.length === 0) return 'RECEIVED';
    
      const allReadyOrServed = items.every(i => i.status === 'PRONTO' || i.status === 'SERVIDO');
      if (allReadyOrServed) {
        return order.order_type === 'iFood-Delivery' ? 'DISPATCHED' : 'READY_FOR_PICKUP';
      }
    
      const hasPreparing = items.some(i => i.status === 'EM_PREPARO');
      if (hasPreparing) return 'IN_PREPARATION';
      
      return 'RECEIVED';
    }
    
    private getLogisticsStatus(order: Order, logs: IfoodWebhookLog[]): LogisticsStatus | null {
      if (order.delivery_info?.deliveredBy !== 'IFOOD') return null;

      const relevantLogs = logs
          .filter(log => log.ifood_order_id === order.ifood_order_id && log.event_code)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const latestStatusLog = relevantLogs.find(log => 
          ['ASSIGNED_DRIVER', 'GOING_TO_ORIGIN', 'ARRIVED_AT_ORIGIN', 'COLLECTED',
          'DELIVERY_DRIVER_DEALLOCATED', 'DELIVERY_RETURNING_TO_ORIGIN', 'DELIVERY_RETURNED_TO_ORIGIN',
          'DELIVERY_CANCELLATION_REQUESTED', 'DELIVERY_DROP_CODE_REQUESTED', 
          'DELIVERY_DROP_CODE_VALIDATION_SUCCESS', 'DELIVERY_RETURN_CODE_REQUESTED',
          'DELIVERY_PICKUP_CODE_REQUESTED', 'DELIVERY_PICKUP_CODE_VALIDATION_SUCCESS',
          'ARRIVED_AT_DESTINATION'].includes(log.event_code!)
      );

      if (latestStatusLog) {
          switch(latestStatusLog.event_code) {
              case 'ASSIGNED_DRIVER': return 'ASSIGNED';
              case 'GOING_TO_ORIGIN': return 'GOING_TO_ORIGIN';
              case 'ARRIVED_AT_ORIGIN': return 'ARRIVED_AT_ORIGIN';
              case 'DISPATCHED_TO_CUSTOMER':
              case 'COLLECTED': return 'DISPATCHED_TO_CUSTOMER';
              case 'ARRIVED_AT_DESTINATION': return 'ARRIVED_AT_DESTINATION';
          }
      }
      
      const allItemsReady = (order.order_items || []).every(i => i.status === 'PRONTO' || i.status === 'SERVIDO');
      if (allItemsReady) return 'AWAITING_DRIVER';

      return null;
    }

    private getPaymentDetails(order: Order): { paymentDetails: string; changeDue: number } {
      const paymentData = order.ifood_payments as any;
      let paymentDetails = '';
      let changeDue = 0;
    
      if (!paymentData) return { paymentDetails: 'Não informado', changeDue };
    
      const payments = paymentData?.payments || paymentData;
      const isPrepaid = payments?.methods?.some((p: any) => p.prepaid === true) || false;

      paymentDetails = isPrepaid ? 'Pago Online' : 'Pago na Entrega';
      
      let paymentMethodsSource: any[] = [];
      if (payments && Array.isArray(payments.methods)) {
        paymentMethodsSource = payments.methods;
      } else if (Array.isArray(payments)) { 
        paymentMethodsSource = payments;
      }
    
      if (paymentMethodsSource.length > 0) {
        const methodDescriptions = paymentMethodsSource.map(p => {
          const methodType = p.method || p.name || 'OUTRO';
          let description = '';
          switch (methodType.toUpperCase()) {
            case 'CREDIT': description = 'Crédito'; break;
            case 'DEBIT': description = 'Débito'; break;
            case 'CASH': description = 'Dinheiro'; break;
            case 'MEAL_VOUCHER': description = 'Vale Refeição'; break;
            case 'FOOD_VOUCHER': description = 'Vale Alimentação'; break;
            case 'PIX': description = 'PIX'; break;
            default: description = methodType;
          }

          if (p.card && p.card.brand) {
            description += ` (${p.card.brand})`;
          }
          return description;
        }).filter(Boolean); 

        if (methodDescriptions.length > 0) {
          paymentDetails += ` - ${methodDescriptions.join(', ')}`;
        }

        const cashPayment = paymentMethodsSource.find(p => p.method === 'CASH');
        if (cashPayment && cashPayment.cash?.changeFor) {
          changeDue = cashPayment.cash.changeFor;
        }
      }
    
      return { paymentDetails, changeDue };
    }

    private getOrderTotalAmount(order: Order): number {
      const paymentData = order.ifood_payments as any;

      if (paymentData && paymentData.total && typeof paymentData.total.orderAmount === 'number') {
          return paymentData.total.orderAmount;
      }

      const payments = paymentData?.payments || paymentData; 
      
      if (!payments) {
          return order.order_items.filter((i: any) => !(i.notes?.includes('[AUX_PREP_IDX:') && !i.notes?.includes('[AUX_PREP_IDX:0]'))).reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
      }
      
      if (payments.prepaid && typeof payments.prepaid === 'number' && payments.prepaid > 0) {
          return payments.prepaid;
      }

      if (payments.methods && Array.isArray(payments.methods) && payments.methods.length > 0) {
          return payments.methods.reduce((sum: number, method: any) => sum + (method.value || 0), 0);
      }
      
      return order.order_items.filter((i: any) => !(i.notes?.includes('[AUX_PREP_IDX:') && !i.notes?.includes('[AUX_PREP_IDX:0]'))).reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
    }

    async confirmOrderAndPrepare(order: any) {
      if (!order.ifood_order_id) return;
      
      this.updatingOrders.update(set => new Set(set).add(order.id));
      this.soundNotificationService.playConfirmationSound();

      try {
          const { success: apiSuccess, error: apiError } = await this.ifoodDataService.sendStatusUpdate(order.ifood_order_id, 'CONFIRMED');
          if (!apiSuccess) throw apiError;
          
          const itemIdsToUpdate = (order.order_items || []).filter(i => i.status === 'PENDENTE').map(i => i.id);
          if (itemIdsToUpdate.length > 0) {
              const { success: dbSuccess, error: dbError } = await this.posDataService.updateMultipleItemStatuses(itemIdsToUpdate, 'EM_PREPARO');
              if (!dbSuccess) throw dbError;
          }
      } catch (error: any) {
          this.notificationService.show(`Erro ao confirmar pedido iFood: ${error.message}`, 'error');
      } finally {
          this.updatingOrders.update(set => {
              const newSet = new Set(set);
              newSet.delete(order.id);
              return newSet;
          });
      }
    }

    async markOrderAsReadyForDispatch(order: any) {
        if (!order.ifood_order_id) return;
        
        this.updatingOrders.update(set => new Set(set).add(order.id));
        this.soundNotificationService.playConfirmationSound();
        
        let targetStatus: IfoodOrderStatus = 'DISPATCHED'; 
        if (order.order_type === 'iFood-Takeout') {
          targetStatus = 'READY_FOR_PICKUP';
        } else if (order.delivery_info?.deliveredBy === 'IFOOD') {
          targetStatus = 'READY_FOR_PICKUP';
        }

        try {
            const { success: apiSuccess, error: apiError } = await this.ifoodDataService.sendStatusUpdate(order.ifood_order_id, targetStatus);
            if (!apiSuccess) throw apiError;
            
            const itemIdsToUpdate = (order.order_items || []).filter(i => i.status === 'PENDENTE' || i.status === 'EM_PREPARO').map(i => i.id);
            if (itemIdsToUpdate.length > 0) {
                const { success: dbSuccess, error: dbError } = await this.posDataService.updateMultipleItemStatuses(itemIdsToUpdate, 'PRONTO');
                if (!dbSuccess) throw dbError;
            }
        } catch (error: any) {
            this.notificationService.show(`Erro ao marcar iFood como pronto: ${error.message}`, 'error');
        } finally {
            this.updatingOrders.update(set => {
                const newSet = new Set(set);
                newSet.delete(order.id);
                return newSet;
            });
        }
    }

    async cancelOrder(order: any) {
      if (!order.ifood_order_id) return;
    
      this.isLoadingCancellationReasons.set(true);
      this.updatingOrders.update(set => new Set(set).add(order.id));
    
      try {
        const reasons = await this.ifoodMenuService.getCancellationReasons(order.ifood_order_id);
        if (reasons.length === 0) {
          throw new Error('Não foi possível obter os motivos de cancelamento do iFood.');
        }
        this.cancellationReasons.set(reasons);
        this.orderToCancel.set(order);
        this.isCancelModalOpen.set(true);
      } catch (error: any) {
        this.notificationService.show(`Erro: ${error.message}`, 'error');
        this.updatingOrders.update(s => {
          const newSet = new Set(s);
          newSet.delete(order.id);
          return newSet;
        });
      } finally {
        this.isLoadingCancellationReasons.set(false);
      }
    }
    
    handleCancelModalClose() {
      this.isCancelModalOpen.set(false);
      const order = this.orderToCancel();
      if (order) {
        this.updatingOrders.update(s => {
          const newSet = new Set(s);
          newSet.delete(order.id);
          return newSet;
        });
      }
      this.orderToCancel.set(null);
    }

    async handleConfirmCancellation(details: { code: string; reason: string; }) {
      this.isCancelModalOpen.set(false);
      const order = this.orderToCancel();
      if (!order || !order.ifood_order_id) return;

      this.soundNotificationService.playConfirmationSound();
      const employeeId = this.operationalAuthService.activeEmployee()?.id || null;

      try {
        const { success: apiSuccess, error: apiError } = await this.ifoodDataService.sendStatusUpdate(order.ifood_order_id, 'CANCELLED', details);
        if (!apiSuccess) throw apiError;
        
        const { success: dbSuccess, error: dbError } = await this.posDataService.cancelOrder(order.id, details.reason, employeeId);
        if (!dbSuccess) throw dbError;

        this.notificationService.show(`Solicitação de cancelamento para #${order.ifood_display_id} enviada.`, 'success');
        this.closeIfoodDetailModal();

      } catch (error: any) {
        this.notificationService.show(`Erro ao cancelar pedido: ${error.message}`, 'error');
      } finally {
        this.updatingOrders.update(set => {
          const newSet = new Set(set);
          newSet.delete(order.id);
          return newSet;
        });
        this.orderToCancel.set(null);
      }
    }

    async deleteOrder(order: any) {
        const confirmed = await this.notificationService.confirm(`Tem certeza que deseja DELETAR PERMANENTEMENTE o pedido #${order.ifood_display_id}? Esta ação não pode ser desfeita.`, 'Deletar Pedido?');
        if (!confirmed) return;

        this.updatingOrders.update(set => new Set(set).add(order.id));

        try {
            const { success, error } = await this.posDataService.deleteOrderAndItems(order.id);
            if (!success) throw error;
            
            this.notificationService.show(`Pedido #${order.ifood_display_id} deletado com sucesso.`, 'success');
            this.closeIfoodDetailModal();

        } catch (error: any) {
            this.notificationService.show(`Erro ao deletar pedido: ${error.message}`, 'error');
        } finally {
            this.updatingOrders.update(set => {
                const newSet = new Set(set);
                newSet.delete(order.id);
                return newSet;
            });
        }
    }
    
    // Logistics For iFood Merchant
    openIfoodAssignDriverModal(order: any) {
      this.orderForIfoodDriverModal.set(order);
      this.isIfoodAssignDriverModalOpen.set(true);
    }
    closeIfoodAssignDriverModal() { this.isIfoodAssignDriverModalOpen.set(false); }

    async assignIfoodDriver(form: { name: string; phone: string; vehicle: string; }) {
      const order = this.orderForIfoodDriverModal();
      if (!order || !order.ifood_order_id || !form.name || !form.phone) {
        this.notificationService.show('Nome e telefone do entregador são obrigatórios.', 'warning');
        return;
      }
      await this.handleLogisticsAction(order.id, order.ifood_order_id, 'assignDriver', {
        workerName: form.name,
        workerPhone: form.phone,
        workerVehicleType: form.vehicle
      });
      this.closeIfoodAssignDriverModal();
    }

    async updateLogisticsStatus(order: any, action: 'goingToOrigin' | 'arrivedAtOrigin' | 'dispatch' | 'arrivedAtDestination') {
      if (!order.ifood_order_id) return;
      await this.handleLogisticsAction(order.id, order.ifood_order_id, action);
    }

    private async handleLogisticsAction(orderId: string, ifoodOrderId: string, action: string, details?: any) {
      this.updatingOrders.update(set => new Set(set).add(orderId));
      try {
        const { success, error } = await this.ifoodDataService.sendLogisticsAction(ifoodOrderId, action, details);
        if (!success) throw error;
        await this.supabaseStateService.refetchIfoodLogs(); 
      } catch (error: any) {
        this.notificationService.show(`Erro na ação de logística: ${error.message}`, 'error');
      } finally {
         this.updatingOrders.update(set => {
              const newSet = new Set(set);
              newSet.delete(orderId);
              return newSet;
          });
      }
    }
    
    handleResendItem(order: any) {
      this.notificationService.show('Reenviar Item é um processo manual. Por favor coordene diretamente no chat do iFood e re-emita o item usando o PDV se necessário.', 'info', 10000);
    }

    async handleAcceptDispute(order: any) {
      if (!order.ifood_dispute_id) return;
      this.updatingOrders.update(set => new Set(set).add(order.id));
      try {
        const { success, error } = await this.ifoodDataService.sendDisputeAction(order.ifood_dispute_id, 'acceptDispute');
        if (!success) throw error;
        this.notificationService.show('Disputa aceita com sucesso.', 'success');
      } catch (error: any) {
        this.notificationService.show(`Erro ao aceitar disputa: ${error.message}`, 'error');
      } finally {
        this.updatingOrders.update(set => { const newSet = new Set(set); newSet.delete(order.id); return newSet; });
      }
    }

    openRejectDisputeModal(order: any) {
      this.orderToReject.set(order);
      this.isRejectDisputeModalOpen.set(true);
    }

    async handleConfirmRejection(reason: string) {
      this.isRejectDisputeModalOpen.set(false);
      const order = this.orderToReject();
      if (!order || !order.ifood_dispute_id) return;
      this.updatingOrders.update(set => new Set(set).add(order.id));
      try {
        const { success, error } = await this.ifoodDataService.sendDisputeAction(order.ifood_dispute_id, 'rejectDispute', { reason });
        if (!success) throw error;
        this.notificationService.show('Disputa rejeitada com sucesso.', 'success');
      } catch (error: any) {
        this.notificationService.show(`Erro ao rejeitar disputa: ${error.message}`, 'error');
      } finally {
        this.updatingOrders.update(set => { const newSet = new Set(set); newSet.delete(order.id); return newSet; });
        this.orderToReject.set(null);
      }
    }

    openProposeRefundModal(order: any) {
      this.orderToProposeRefund.set(order);
      this.refundAmount.set(0);
      this.isProposeRefundModalOpen.set(true);
    }

    async handleConfirmRefund(details: { amount: number }) {
      this.isProposeRefundModalOpen.set(false);
      const order = this.orderToProposeRefund();
      if (!order || !order.ifood_dispute_id || !order.ifood_dispute_details?.alternatives?.[0]?.id) return;

      const alternativeId = order.ifood_dispute_details.alternatives[0].id;
      const amountInCents = Math.round(details.amount * 100);

      this.updatingOrders.update(set => new Set(set).add(order.id));
      try {
          const { success, error } = await this.ifoodDataService.proposeDisputeAlternative(
              order.ifood_dispute_id,
              alternativeId,
              {
                  type: "REFUND",
                  metadata: {
                      amount: {
                          value: String(amountInCents),
                          currency: "BRL"
                      }
                  }
              }
          );
          if (!success) throw error;
          this.notificationService.show('Contraproposta de reembolso enviada.', 'success');
      } catch (error: any) {
          this.notificationService.show(`Erro ao enviar contraproposta: ${error.message}`);
      } finally {
          this.updatingOrders.update(set => { const newSet = new Set(set); newSet.delete(order.id); return newSet; });
          this.orderToProposeRefund.set(null);
      }
    }
    
    openNegotiateTimeModal(order: any) {
      this.notificationService.alert('A funcionalidade de negociar atraso ainda não foi implementada pelo iFood.', 'Em Breve');
    }

    openVerifyCodeModal(order: any, type: 'pickup' | 'delivery') {
      this.orderForCodeModal.set(order);
      this.codeTypeForModal.set(type);
      this.isVerifyCodeModalOpen.set(true);
    }

    async handleConfirmVerification(code: string) {
      this.isVerifyCodeModalOpen.set(false);
      const order = this.orderForCodeModal();
      const type = this.codeTypeForModal();
      if (!order || !order.ifood_order_id || !code || !type) return;

      const action = type === 'pickup' ? 'validatePickupCode' : 'verifyDeliveryCode';
      this.updatingOrders.update(set => new Set(set).add(order.id));

      try {
        const { success: serviceSuccess, error, data } = await this.ifoodDataService.sendLogisticsAction(order.ifood_order_id, action, { code });
        
        if (!serviceSuccess) throw error;
        
        let isCodeValid = false;
        if (action === 'validatePickupCode') {
            isCodeValid = data?.success === true;
        } else if (action === 'verifyDeliveryCode') {
            isCodeValid = true;
        }

        if (isCodeValid) {
          this.notificationService.show('Código validado com sucesso!', 'success');
        } else {
          this.notificationService.show('Código de verificação inválido.', 'error');
        }
      } catch (error: any) {
        this.notificationService.show(`Erro ao verificar código: ${error.message}`, 'error');
      } finally {
        this.updatingOrders.update(set => { const newSet = new Set(set); newSet.delete(order.id); return newSet; });
        this.orderForCodeModal.set(null);
        this.codeTypeForModal.set(null);
      }
    }
    
    openLogDetailModal(log: IfoodWebhookLog) {
      this.selectedLogForDetail.set(log);
    }
    
    closeLogDetailModal() {
      this.selectedLogForDetail.set(null);
    }
   
    openIfoodDetailModal(order: any) {
      this.selectedOrderForDetail.set(order);
      this.isIfoodDetailModalOpen.set(true);
      if (order?.disputeEvidences && order.disputeEvidences.length > 0) {
        this.loadEvidenceImages(order.disputeEvidences);
      }
    }

    closeIfoodDetailModal() {
      this.isIfoodDetailModalOpen.set(false);
      this.selectedOrderForDetail.set(null);
    }

    getLogStatusClass(status: string | null): string {
      if (!status) return 'bg-muted text-surface-elevated';
      if (status.startsWith('SUCCESS')) return 'bg-success/10 border border-success/20 text-success';
      if (status.startsWith('ERROR')) return 'bg-danger/10 border border-danger/20 text-danger';
      return 'bg-brand/10 border border-brand/20 text-brand';
    }

    getOrderBenefitsTotal(order: any): number {
      if (!order.ifood_benefits || !Array.isArray(order.ifood_benefits)) return 0;
      return order.ifood_benefits.reduce((acc: number, benefit: any) => acc + (benefit.value || 0), 0);
    }

    async openIfoodTrackingModal(order: any) {
      if (!order.ifood_order_id) {
        this.notificationService.show('Este pedido não tem um ID iFood para rastreio.', 'warning');
        return;
      }
      this.isLoadingTracking.set(true);
      this.orderForTracking.set(order);
      this.isTrackingModalOpen.set(true);
      this.closeIfoodDetailModal(); 

      try {
        const data = await this.ifoodMenuService.trackOrder(order.ifood_order_id);
        this.trackingData.set(data);
      } catch (error: any) {
        this.notificationService.show(`Erro ao buscar rastreio: ${error.message}`, 'error');
        this.isTrackingModalOpen.set(false);
      } finally {
        this.isLoadingTracking.set(false);
      }
    }

    closeIfoodTrackingModal() {
      this.isTrackingModalOpen.set(false);
      this.trackingData.set(null);
      this.orderForTracking.set(null);
    }
    
    formatLogisticsStatus(status: LogisticsStatus | null): string {
      if (!status) return '';
      return status.replace(/_/g, ' ').toLowerCase();
    }
}
