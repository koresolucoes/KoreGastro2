

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
}

interface StationTicket extends BaseTicket {
  items: ProcessedOrderItem[];
}

interface ExpoTicket extends BaseTicket {
  items: ProcessedOrderItem[];
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
    viewMode = signal<'station' | 'expo'>('station');

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
                            if (item.isCritical && !item.attention_acknowledged) {
                                this.soundNotificationService.playAllergyAlertSound();
                            } else {
                                this.soundNotificationService.playNewOrderSound();
                            }
                        }
                    }
                }
                
                // 2. Check for newly late items
                for (const item of allItems) {
                    if (item.isLate && !previouslyLate.has(item.id)) {
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
        for (const order of this.posState.openOrders()) {
            if (!itemsByOrder.has(order.id)) itemsByOrder.set(order.id, []);
            const orderItems = itemsByOrder.get(order.id)!;

            for (const item of order.order_items) {
                const recipe = recipesMap.get(item.recipe_id);
                const prepTimeSecs = (recipe?.prep_time_in_minutes ?? 15) * 60;
                const pendingTimestamp = new Date(item.status_timestamps?.['PENDENTE'] ?? item.created_at).getTime();
                const elapsedTimeSeconds = Math.floor((now - pendingTimestamp) / 1000);
                const percentage = prepTimeSecs > 0 ? (elapsedTimeSeconds / prepTimeSecs) * 100 : 0;
                
                let timerColor = 'text-green-300';
                if (percentage > 50) timerColor = 'text-yellow-300';
                if (percentage > 80) timerColor = 'text-red-300';
                
                const note = item.notes?.toLowerCase() ?? '';
                orderItems.push({
                    ...item,
                    elapsedTimeSeconds,
                    timerColor,
                    isLate: elapsedTimeSeconds > prepTimeSecs,
                    isCritical: criticalKeywords.some(keyword => note.includes(keyword)),
                    prepTime: prepTimeSecs,
                    attention_acknowledged: !!item.status_timestamps?.['ATTENTION_ACKNOWLEDGED'],
                    isHeld: false,
                    timeToStart: 0,
                    stationName: stationsMap.get(item.station_id)
                });
            }
        }

        // 2. Apply hold logic based on prep times for each order
        const finalItems: ProcessedOrderItem[] = [];
        for (const orderItems of itemsByOrder.values()) {
            if (orderItems.length === 0) continue;

            const longestPrepTime = Math.max(...orderItems.map(item => item.prepTime));
            
            for (const item of orderItems) {
                const timeToStart = longestPrepTime - item.prepTime;
                if (item.status === 'PENDENTE' && item.elapsedTimeSeconds < timeToStart) {
                    item.isHeld = true;
                    item.timeToStart = timeToStart - item.elapsedTimeSeconds;
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
          (item.status === 'PENDENTE' || item.status === 'EM_PREPARO')
        );
        return this.groupItemsIntoTickets(itemsForStation);
    });

    // Computed for Expo View
    expoViewTickets = computed<ExpoTicket[]>(() => {
        const allItems = this.allKdsItemsProcessed().filter(item => 
          item.status === 'PENDENTE' || item.status === 'EM_PREPARO' || item.status === 'PRONTO'
        );
        const tickets = this.groupItemsIntoTickets(allItems);
        
        return tickets.map(ticket => {
            const allOrderItems = this.posState.openOrders().find(o => o.id === ticket.orderId)?.order_items ?? [];
            const isReadyForPickup = allOrderItems.length > 0 && allOrderItems.every(item => item.status === 'PRONTO' || item.status === 'SERVIDO');
            return { ...ticket, isReadyForPickup };
        });
    });

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
            
            const order = this.posState.openOrders().find(o => o.id === orderId);
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

            tickets.push({
                orderId: order.id,
                tableNumber: order.table_number,
                items: orderItems,
                ticketElapsedTime,
                ticketTimerColor,
                isTicketLate: ticketElapsedTime > avgPrepTime,
                oldestTimestamp: new Date(oldestTimestamp).toISOString(),
                orderType: order.order_type,
                ifoodDisplayId: order.ifood_display_id
            });
        }
        return tickets.sort((a, b) => new Date(a.oldestTimestamp).getTime() - new Date(b.oldestTimestamp).getTime());
    }

    selectStation(station: Station) { this.selectedStation.set(station); }
    setViewMode(mode: 'station' | 'expo') { this.viewMode.set(mode); }

    async assignEmployeeToStation(employeeId: string | null) {
        const station = this.selectedStation();
        if (!station) return;
        
        const { success, error } = await this.settingsDataService.assignEmployeeToStation(station.id, employeeId);
        if (!success) await this.notificationService.alert(`Falha ao atribuir funcionário: ${error?.message}`);
        this.isAssignEmployeeModalOpen.set(false);
    }
    
    async acknowledgeAttention(item: ProcessedOrderItem, event: MouseEvent) {
        event.stopPropagation();
        if (this.updatingItems().has(item.id)) return;

        this.soundNotificationService.playConfirmationSound();
        this.updatingItems.update(set => new Set(set).add(item.id));
        const { success, error } = await this.posDataService.acknowledgeOrderItemAttention(item.id);
        if (!success) await this.notificationService.alert(`Erro ao confirmar ciência: ${error?.message}`);
        this.updatingItems.update(set => { const newSet = new Set(set); newSet.delete(item.id); return newSet; });
    }
    
    async markAsReady(item: OrderItem, event: MouseEvent) {
        event.stopPropagation();
        if (this.updatingItems().has(item.id) || item.status === 'PRONTO') {
            return;
        }

        this.soundNotificationService.playConfirmationSound();
        this.updatingItems.update(set => new Set(set).add(item.id));
        const { success, error } = await this.posDataService.updateOrderItemStatus(item.id, 'PRONTO');
        if (!success) {
            await this.notificationService.alert(`Erro ao marcar como pronto: ${error?.message}`);
        }
        this.updatingItems.update(set => {
            const newSet = new Set(set);
            newSet.delete(item.id);
            return newSet;
        });
    }

    async updateStatus(item: OrderItem, forceStart = false, event?: MouseEvent) {
        event?.stopPropagation();
        if (this.updatingItems().has(item.id) || ((item as ProcessedOrderItem).isHeld && !forceStart)) return;

        let nextStatus: OrderItemStatus;
        switch (item.status) {
            case 'PENDENTE': nextStatus = 'EM_PREPARO'; break;
            case 'EM_PREPARO': nextStatus = 'PRONTO'; break;
            default: return;
        }
        
        this.soundNotificationService.playConfirmationSound();
        this.updatingItems.update(set => new Set(set).add(item.id));
        const { success, error } = await this.posDataService.updateOrderItemStatus(item.id, nextStatus);
        if (!success) await this.notificationService.alert(`Erro ao atualizar o status do item: ${error?.message}`);
        this.updatingItems.update(set => { const newSet = new Set(set); newSet.delete(item.id); return newSet; });
    }

    async startHeldItemNow(item: ProcessedOrderItem, event: MouseEvent) {
        event.stopPropagation();
        const confirmed = await this.notificationService.confirm(`Tem certeza que deseja iniciar o preparo de "${item.name}" antes do tempo programado?`, 'Iniciar Preparo?');
        if (confirmed) {
            await this.updateStatus(item, true);
        }
    }

    async markOrderAsServed(ticket: ExpoTicket) {
        if (this.updatingTickets().has(ticket.orderId)) return;
    
        const order = this.posState.openOrders().find(o => o.id === ticket.orderId);
        if (!order) {
            await this.notificationService.alert('Erro: Pedido não encontrado.');
            return;
        }
    
        this.soundNotificationService.playConfirmationSound();
        this.updatingTickets.update(set => new Set(set).add(ticket.orderId));
    
        try {
            // Step 1: Communicate with iFood if necessary
            if (order.ifood_order_id) {
                const targetStatus: IfoodOrderStatus = order.order_type === 'iFood-Delivery' ? 'DISPATCHED' : 'READY_FOR_PICKUP';
                const { success, error } = await this.ifoodDataService.sendStatusUpdate(order.ifood_order_id, targetStatus);
                if (!success) {
                    throw error || new Error('Falha ao comunicar com a API do iFood.');
                }
            }
    
            // Step 2: Update internal status
            const { success, error } = await this.posDataService.markOrderAsServed(order.id);
            if (!success) {
                throw error;
            }
            // On success, realtime subscription will remove the ticket from view.
    
        } catch (e: any) {
            await this.notificationService.alert(`Ocorreu um erro: ${e.message}`);
            // Reset loading state on any error
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
            const orderShellForPrinting = { id: ticket.orderId, table_number: ticket.tableNumber, timestamp: ticket.oldestTimestamp } as Order;
            this.printingService.printOrder(orderShellForPrinting, ticket.items, station);
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
        default: return 'border-gray-600';
      }
    }
}
