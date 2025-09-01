import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';
import { Station, Order, OrderItem, OrderItemStatus } from '../../models/db.models';

@Component({
  selector: 'app-kds',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './kds.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KdsComponent {
    dataService = inject(SupabaseService);
    stations = this.dataService.stations;
    selectedStation = signal<Station | null>(null);

    constructor() {
        effect(() => {
            const stations = this.stations();
            if (stations.length > 0 && !this.selectedStation()) {
                this.selectStation(stations[0]);
            }
        });
    }
    
    kdsOrders = computed(() => {
        const station = this.selectedStation();
        if (!station) return [];
        
        return this.dataService.openOrders()
            .map(order => ({
                ...order,
                order_items: order.order_items.filter(item => item.station_id === station.id && item.status !== 'AGUARDANDO' && item.status !== 'PRONTO')
            }))
            .filter(order => order.order_items.length > 0);
    });

    selectStation(station: Station) {
        this.selectedStation.set(station);
    }
    
    async updateStatus(order: Order, item: OrderItem) {
        let nextStatus: OrderItemStatus;
        switch (item.status) {
            case 'PENDENTE':
                nextStatus = 'EM_PREPARO';
                break;
            case 'EM_PREPARO':
                nextStatus = 'PRONTO';
                break;
            default:
                return;
        }
        await this.dataService.updateOrderItemStatus(item.id, nextStatus);
    }

    getItemStatusClass(status: OrderItemStatus): string {
        switch (status) {
            case 'PENDENTE': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500';
            case 'EM_PREPARO': return 'bg-blue-500/20 text-blue-300 border-blue-500';
            case 'PRONTO': return 'bg-green-500/20 text-green-300 border-green-500';
            default: return 'bg-gray-500/20 text-gray-300 border-gray-500';
        }
    }

    getTicketHeaderClass(items: OrderItem[]): string {
        if (items.some(i => i.status === 'EM_PREPARO')) return 'bg-blue-600';
        if (items.every(i => i.status === 'PENDENTE')) return 'bg-yellow-600';
        return 'bg-gray-600';
    }
}
