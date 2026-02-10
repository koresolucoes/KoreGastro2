
import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, OnInit, OnDestroy, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Station, Order, OrderItem, OrderItemStatus, Recipe, Employee, OrderType, IfoodOrderStatus } from '../../models/db.models';
import { PrintingService } from '../../services/printing.service';
import { PosDataService } from '../../services/pos-data.service';
import { SettingsDataService } from '../../services/settings-data.service';
import { NotificationService } from '../../services/notification.service';
import { SoundNotificationService } from '../../services/sound-notification.service';
import { IfoodDataService } from '../../services/ifood-data.service';

// Import new state services
import { PosStateService } from '../../services/pos-state.service';
import { HrStateService } from '../../services/hr-state.service';
import { RecipeStateService } from '../../services/recipe-state.service';

interface BaseTicket {
  orderId: string;
  tableNumber: number;
  ticketElapsedTime: number;
  ticketTimerColor: string;
  isTicketLate: boolean;
  oldestTimestamp: string;
  orderType: OrderType;
  ifoodDisplayId?: string | null;
  isOrderCancelled?: boolean; 
}

// New Interface for Grouped Items within a Ticket
interface KdsDisplayItem {
  id: string; // ID of the first item in the group (used for tracking in UI)
  ids: string[]; // List of all item IDs in this group (for batch updates)
  name: string;
  quantity: number; // Sum of quantities
  status: OrderItemStatus;
  notes: string | null;
  
  // Computed/Derived properties for display
  timerColor: string;
  isLate: boolean;
  isCritical: boolean;
  attention_acknowledged: boolean;
  isHeld: boolean;
  timeToStart: number;
  stationName?: string;
  isCancelled: boolean;
  elapsedTimeSeconds: number;
  
  status_timestamps?: Record<string, string> | null; // From the representative item
}

// Interface for All Day Production View
interface ProductionAggregateItem {
  name: string;
  quantity: number;
  status: OrderItemStatus;
  notes: string | null;
  minElapsedTime: number; // Time of the oldest item in this group
  maxElapsedTime: number;
  isCritical: boolean;
  ids: string[]; // All item IDs that make up this aggregate
}


interface StationTicket extends BaseTicket {
  items: KdsDisplayItem[]; // Changed from ProcessedOrderItem[]
}

interface ExpoTicket extends BaseTicket {
  items: KdsDisplayItem[]; // Changed from ProcessedOrderItem[]
  isReadyForPickup: boolean;
}

type ProcessedOrderItem = OrderItem & {
  elapsedTimeSeconds: number;
  timerColor: string;
  isLate: boolean;
  isCritical: boolean;
  prepTime: number; // in seconds
  attention_acknowledged: boolean;
  isHeld: boolean;
  timeToStart: number; // in seconds
  stationName?: string;
  isCancelled?: boolean; 
};

@Component({
  selector: 'app-kds',
  standalone: true,
  imports: [CommonModule],
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
    
    stations = this.posState.stations;
    employees = this.hrState.employees;
    recipesById = this.recipeState.recipesById;
    stationsById = computed(() => new Map(this.stations().map(s => [s.id, s.name])));

    selectedStation = signal<Station | null>(null);
    viewMode = signal<'station' | 'expo' | 'production'>('station');

    private timerInterval: ReturnType<typeof setInterval> | undefined;
    currentTime = signal(Date.now());
    
    updatingItems = signal<Set<string>>(new Set());
    updatingTickets = signal<Set<string>>(new Set());
    isDetailModalOpen = signal(false);
    selectedTicketForDetail = signal<StationTicket | ExpoTicket | null>(null);
    isAssignEmployeeModalOpen = signal(false);

    // State for sound alerts
    private processedNewItems = signal<Set<string>>(new Set());
    private alertedLateItems = signal<Set<string>>(new Set());

    constructor() {
        effect(() => {
            const stations = this.stations();
            if (stations.length > 0 && !this.selectedStation()) {
                this.selectStation(stations[0]);
            }
        });
        
        // Main effect for sound notifications
        effect(() => {
            const allItems = this.allKdsItemsProcessed();
            const currentItemIds = new Set(allItems.map(i => i.id));
            const currentStationId = this.selectedStation()?.id;
            
            untracked(() => {
                const previouslyProcessed = this.processedNewItems();
                const previouslyLate = this.alertedLateItems();
                
                // 1. Check for new items
                for (const item of allItems) {
                    if (!previouslyProcessed.has(item.id)) {
                        const isForThisView = this.viewMode() === 'expo' || item.station_id === currentStationId;
                        if (isForThisView) {
                            if (item.isCancelled) {
                                this.soundNotificationService.playAllergyAlertSound(); // Urgent sound for cancellation
                            } else if (item.isCritical && !item.attention_acknowledged) {
                                this.soundNotificationService.playAllergyAlertSound();
                            } else {
                                this.soundNotificationService.playNewOrderSound();
                            }
                        }
                    }
                }
                
                // 2. Check for newly late items (ignore if cancelled)
                for (const item of allItems) {
                    if (item.isLate && !item.isCancelled && !previouslyLate.has(item.id)) {
                         const isForThisView = this.viewMode() === 'expo' || item.station_id === currentStationId;
                         if(isForThisView) {
                            this.soundNotificationService.playDelayedOrderSound();
                            previouslyLate.add(item.id);
                         }
                    }
                }

                // 3. Update state for next run
                this.processedNewItems.set(currentItemIds);
                // Clean up alertedLateItems set from items that are no longer visible
                const currentLateIds = new Set(allItems.filter(i => i.isLate).map(i => i.id));
                this.alertedLateItems.set(currentLateIds);
            });
        });
    }

    ngOnInit(): void {
        this.timerInterval = setInterval(() => this.currentTime.set(Date.now()), 1000);
    }

    ngOnDestroy(): void {
        if (this.timerInterval) clearInterval(this.timerInterval);
    }

    // Central computed signal to process all KDS items with timing logic
    private allKdsItemsProcessed = computed<ProcessedOrderItem[]>(() => {
        const now = this.currentTime();
        const recipesMap = this.recipesById();
        const stationsMap = this.stationsById();
        const criticalKeywords = ['alergia', 'sem glúten', 'sem lactose', 'celíaco', 'nozes', 'amendoim', 'vegetariano', 'vegano'];

        const itemsByOrder = new Map<string, ProcessedOrderItem[]>();

        // 1. Group all relevant items by their order ID and process them
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

                const recipe = recipesMap.get(item.recipe_id);
                const prepTimeSecs = (recipe?.prep_time_in_minutes ?? 15) * 60;
                
                const startTime = item.status_timestamps?.['PENDENTE'] ?? item.created_at;
                const pendingTimestamp = new Date(startTime).getTime();
                const elapsedTimeSeconds = Math.floor((now - pendingTimestamp) / 1000);
                const percentage = prepTimeSecs > 0 ? (elapsedTimeSeconds / prepTimeSecs) * 100 : 0;
                
                let timerColor = 'text-green-300';
                if (percentage > 50) timerColor = 'text-yellow-300';
                if (percentage > 80) timerColor = 'text-red-300';
                if (isItemCancelled) timerColor = 'text-gray-400';
                
                const note = item.notes?.toLowerCase() ?? '';
                orderItems.push({
                    ...item,
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

        // 2. Apply hold logic
        const finalItems: ProcessedOrderItem[] = [];
        for (const orderItems of itemsByOrder.values()) {
            if (orderItems.length === 0) continue;
            
            const activeItems = orderItems.filter(i => !i.isCancelled);
            const longestPrepTime = activeItems.length > 0 ? Math.max(...activeItems.map(item => item.prepTime)) : 0;
            
            for (const item of orderItems) {
                if (!item.isCancelled) {
                    const timeToStart = longestPrepTime - item.prepTime;
                    if (item.status === 'PENDENTE' && item.elapsedTimeSeconds < timeToStart) {
                        item.isHeld = true;
                        item.timeToStart = timeToStart - item.elapsedTimeSeconds;
                    }
                }
                finalItems.push(item);
            }
        }
        return finalItems;
    });
    
    // Computed for Station View
    groupedKdsTickets = computed<StationTicket[]>(() => {
        const station = this.selectedStation();
        if (!station) return [];

        const itemsForStation = this.allKdsItemsProcessed().filter(item => 
          item.station_id === station.id &&
          (item.status === 'PENDENTE' || item.status === 'EM_PREPARO' || item.isCancelled)
        );
        return this.groupItemsIntoTickets(itemsForStation);
    });

    // Computed for Expo View
    expoViewTickets = computed<ExpoTicket[]>(() => {
        const allItems = this.allKdsItemsProcessed().filter(item => 
          item.status === 'PENDENTE' || item.status === 'EM_PREPARO' || item.status === 'PRONTO' || item.isCancelled
        );
        const tickets = this.groupItemsIntoTickets(allItems);
        
        return tickets.map(ticket => {
            if (ticket.isOrderCancelled) {
                return { ...ticket, isReadyForPickup: false };
            }
            const allOrderItems = this.posState.orders().find(o => o.id === ticket.orderId)?.order_items ?? [];
            const isReadyForPickup = allOrderItems.length > 0 && allOrderItems.every(item => item.status === 'PRONTO' || item.status === 'SERVIDO' || item.status === 'CANCELADO');
            return { ...ticket, isReadyForPickup };
        });
    });

    // Computed for Production View (All Day)
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
            // Group by Recipe ID + Notes + Status
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

        // Sort by longest wait time (maxElapsedTime) descending
        return Array.from(groups.values()).sort((a, b) => b.maxElapsedTime - a.maxElapsedTime);
    });

    // GROUPING LOGIC (SMART ROUTING)
    private groupItemsForDisplay(items: ProcessedOrderItem[]): KdsDisplayItem[] {
        const groupedMap = new Map<string, KdsDisplayItem>();

        for (const item of items) {
            // Create a unique key for grouping.
            // Items are identical if they have same Recipe, Status, Notes, and Held Status/Criticality
            const key = `${item.recipe_id}_${item.status}_${item.notes || ''}_${item.isHeld}_${item.isCritical}_${item.isCancelled}`;

            if (groupedMap.has(key)) {
                const group = groupedMap.get(key)!;
                group.quantity += item.quantity;
                group.ids.push(item.id);
            } else {
                groupedMap.set(key, {
                    id: item.id, // ID of the first one
                    ids: [item.id],
                    name: item.name,
                    quantity: item.quantity,
                    status: item.status,
                    notes: item.notes,
                    
                    // Display properties taken from the first item
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
        
        // Return sorted (e.g., critical first)?
        // Current logic preserves implicit order based on when the first item was encountered.
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
            
            let ticketTimerColor = 'bg-green-600';
            if (percentage > 50) ticketTimerColor = 'bg-yellow-600';
            if (percentage > 80) ticketTimerColor = 'bg-red-600';
            
            const isOrderCancelled = order.status === 'CANCELLED';
            if (isOrderCancelled) {
                ticketTimerColor = 'bg-red-800'; 
            }

            // Apply Grouping Here
            const groupedItems = this.groupItemsForDisplay(orderItems);

            tickets.push({
                orderId: order.id,
                tableNumber: order.table_number,
                items: groupedItems,
                ticketElapsedTime,
                ticketTimerColor,
                isTicketLate: !isOrderCancelled && ticketElapsedTime > avgPrepTime,
                oldestTimestamp: new Date(oldestTimestamp).toISOString(),
                orderType: order.order_type,
                ifoodDisplayId: order.ifood_display_id,
                isOrderCancelled
            });
        }
        return tickets.sort((a, b) => new Date(a.oldestTimestamp).getTime() - new Date(b.oldestTimestamp).getTime());
    }

    selectStation(station: Station) { this.selectedStation.set(station); }
    setViewMode(mode: 'station' | 'expo' | 'production') { this.viewMode.set(mode); }

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

        // Process all IDs concurrently
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
    
    async markAsReady(item: KdsDisplayItem, event: MouseEvent) {
        event.stopPropagation();
        if (this.updatingItems().has(item.id) || item.status === 'PRONTO') {
            return;
        }

        this.soundNotificationService.playConfirmationSound();
        this.setUpdatingForGroup(item.ids, true);

        const { success, error } = await this.posDataService.updateMultipleItemStatuses(item.ids, 'PRONTO');
        
        if (!success) {
            await this.notificationService.alert(`Erro ao marcar como pronto: ${error?.message}`);
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

    // New: Batch actions for Production View
    async advanceProductionItems(item: ProductionAggregateItem) {
        if(this.updatingItems().has(item.ids[0])) return;
        
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

    // Helper to manage loading state for groups
    private setUpdatingForGroup(ids: string[], isUpdating: boolean) {
        this.updatingItems.update(set => {
            const newSet = new Set(set);
            ids.forEach(id => isUpdating ? newSet.add(id) : newSet.delete(id));
            return newSet;
        });
    }

    // ... (rest of methods like markOrderAsServed remain the same as they work on orderId) ...
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
            // Need to map KdsDisplayItem back to OrderItem structure for printing
            // We use the properties available in KdsDisplayItem which cover basic printing needs
            // Note: Printing service expects OrderItem[], KdsDisplayItem extends a subset but is compatible structurally for key fields
             const itemsForPrint: any[] = ticket.items.map(item => ({
                name: item.name,
                quantity: item.quantity,
                notes: item.notes
             }));

            const orderShellForPrinting = { id: ticket.orderId, table_number: ticket.tableNumber, timestamp: ticket.oldestTimestamp } as Order;
            this.printingService.printOrder(orderShellForPrinting, itemsForPrint, station);
        } else {
            await this.notificationService.alert('Erro: Nenhuma estação selecionada.');
        }
    }

    formatTime(seconds: number): string {
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
}
