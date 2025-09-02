import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';
import { Station, Order, OrderItem, OrderItemStatus, Recipe } from '../../models/db.models';
import { PrintingService } from '../../services/printing.service';

// Define a type for a consolidated ticket grouped by table
interface GroupedTicket {
  tableNumber: number;
  items: ProcessedOrderItem[];
  ticketElapsedTime: number;
  ticketTimerColor: string;
  isTicketLate: boolean;
  oldestTimestamp: string;
}

// Define a more specific type for the processed KDS order item
type ProcessedOrderItem = OrderItem & {
  elapsedTimeSeconds: number;
  timerColor: string;
  isLate: boolean;
  isCritical: boolean; // Flag for items needing special attention
  prepTime: number; // Prep time in minutes for sorting
  attention_acknowledged: boolean;
};

@Component({
  selector: 'app-kds',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './kds.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KdsComponent implements OnInit, OnDestroy {
    dataService = inject(SupabaseService);
    printingService = inject(PrintingService);
    stations = this.dataService.stations;
    recipesById = this.dataService.recipesById;
    selectedStation = signal<Station | null>(null);

    // Timer for real-time updates
    private timerInterval: any;
    currentTime = signal(Date.now());
    
    // Modal management
    isDetailModalOpen = signal(false);
    selectedTicketForDetail = signal<GroupedTicket | null>(null);

    constructor() {
        effect(() => {
            const stations = this.stations();
            if (stations.length > 0 && !this.selectedStation()) {
                this.selectStation(stations[0]);
            }
        });
    }

    ngOnInit(): void {
        this.timerInterval = setInterval(() => {
            this.currentTime.set(Date.now());
        }, 1000); // Update every second
    }

    ngOnDestroy(): void {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
    }

    groupedKdsTickets = computed<GroupedTicket[]>(() => {
        const station = this.selectedStation();
        const now = this.currentTime();
        const recipesMap = this.recipesById();
        if (!station) return [];

        const criticalKeywords = ['alergia', 'sem glúten', 'sem lactose', 'celíaco', 'nozes', 'amendoim', 'vegetariano', 'vegano'];

        // 1. Group items by table number from all open orders
        const itemsByTable = new Map<number, ProcessedOrderItem[]>();
        for (const order of this.dataService.openOrders()) {
            const relevantItems = order.order_items.filter(
                item => item.station_id === station.id && item.status !== 'AGUARDANDO' && item.status !== 'PRONTO'
            );
            
            if (!itemsByTable.has(order.table_number)) {
                itemsByTable.set(order.table_number, []);
            }
            const tableItems = itemsByTable.get(order.table_number)!;

            for (const item of relevantItems) {
                const recipe = recipesMap.get(item.recipe_id);
                const prepTimeMins = recipe?.prep_time_in_minutes ?? 15;
                const prepTimeSecs = prepTimeMins * 60;
                const pendingTimestamp = new Date(item.status_timestamps?.['PENDENTE'] ?? item.created_at).getTime();
                const elapsedTimeSeconds = Math.floor((now - pendingTimestamp) / 1000);
                const percentage = prepTimeSecs > 0 ? (elapsedTimeSeconds / prepTimeSecs) * 100 : 0;
                
                let timerColor = 'text-green-300';
                if (percentage > 50) timerColor = 'text-yellow-300';
                if (percentage > 80) timerColor = 'text-red-300';
                
                const isLate = elapsedTimeSeconds > prepTimeSecs;
                const note = item.notes?.toLowerCase() ?? '';
                const isCritical = criticalKeywords.some(keyword => note.includes(keyword));
                const attention_acknowledged = !!item.status_timestamps?.['ATTENTION_ACKNOWLEDGED'];

                tableItems.push({ ...item, elapsedTimeSeconds, timerColor, isLate, isCritical, prepTime: prepTimeMins, attention_acknowledged });
            }
        }

        // 2. Process each group into a final GroupedTicket
        const tickets: GroupedTicket[] = [];
        for (const [tableNumber, items] of itemsByTable.entries()) {
            if (items.length === 0) continue;

            // Optimized Flow: Sort items by prep time (longest first)
            items.sort((a, b) => b.prepTime - a.prepTime);

            const oldestItem = items.reduce((oldest, current) => 
                (new Date(current.status_timestamps?.['PENDENTE'] ?? current.created_at).getTime() < new Date(oldest.status_timestamps?.['PENDENTE'] ?? oldest.created_at).getTime()) ? current : oldest
            );
            const oldestPendingTimestamp = new Date(oldestItem.status_timestamps?.['PENDENTE'] ?? oldestItem.created_at).getTime();
            const oldestTimestampString = new Date(oldestPendingTimestamp).toISOString();
            const ticketElapsedTime = Math.floor((now - oldestPendingTimestamp) / 1000);
            
            const avgPrepTime = items.reduce((acc, item) => acc + (item.prepTime * 60), 0) / items.length;
            const ticketPercentage = avgPrepTime > 0 ? (ticketElapsedTime / avgPrepTime) * 100 : 0;
            
            let ticketTimerColor = 'bg-green-600';
            if (ticketPercentage > 50) ticketTimerColor = 'bg-yellow-600';
            if (ticketPercentage > 80) ticketTimerColor = 'bg-red-600';
            
            const isTicketLate = ticketElapsedTime > avgPrepTime;

            tickets.push({ tableNumber, items, ticketElapsedTime, ticketTimerColor, isTicketLate, oldestTimestamp: oldestTimestampString });
        }

        // 3. Sort tickets by which has been waiting the longest
        return tickets.sort((a, b) => new Date(a.oldestTimestamp).getTime() - new Date(b.oldestTimestamp).getTime());
    });

    selectStation(station: Station) {
        this.selectedStation.set(station);
    }
    
    async acknowledgeAttention(item: ProcessedOrderItem, event: MouseEvent) {
        event.stopPropagation();
        await this.dataService.acknowledgeOrderItemAttention(item.id);
    }
    
    async updateStatus(item: OrderItem) {
        let nextStatus: OrderItemStatus;
        switch (item.status) {
            case 'PENDENTE': nextStatus = 'EM_PREPARO'; break;
            case 'EM_PREPARO': nextStatus = 'PRONTO'; break;
            default: return;
        }
        await this.dataService.updateOrderItemStatus(item.id, nextStatus);
    }
    
    openDetailModal(ticket: GroupedTicket) {
        this.selectedTicketForDetail.set(ticket);
        this.isDetailModalOpen.set(true);
    }

    closeDetailModal() {
        this.isDetailModalOpen.set(false);
        this.selectedTicketForDetail.set(null);
    }

    printTicket(ticket: GroupedTicket) {
        const station = this.selectedStation();
        if (station) {
            // Create a pseudo-order object for the printing service
            const orderShellForPrinting = {
                id: ticket.items[0]?.order_id || 'N/A', // Use an item's order_id for reference
                table_number: ticket.tableNumber,
                timestamp: ticket.oldestTimestamp,
            } as Order;
            this.printingService.printOrder(orderShellForPrinting, ticket.items, station);
        } else {
            console.error('Nenhuma estação selecionada, não é possível imprimir.');
            alert('Erro: Nenhuma estação selecionada.');
        }
    }

    formatTime(seconds: number): string {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    getStatusHistory(timestamps: any): { status: string; time: string }[] {
        if (!timestamps) return [];
        return Object.entries(timestamps)
            .map(([status, time]) => ({ status, time: time as string }))
            .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    }

    getItemStatusClass(status: OrderItemStatus): string {
        switch (status) {
            case 'PENDENTE': return 'border-yellow-500';
            case 'EM_PREPARO': return 'border-blue-500';
            default: return 'border-gray-500';
        }
    }
}
