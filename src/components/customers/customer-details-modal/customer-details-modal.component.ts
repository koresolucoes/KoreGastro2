import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, input, output, InputSignal, OutputEmitterRef, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Customer, Order, LoyaltyMovement } from '../../../models/db.models';
import { SettingsDataService } from '../../../services/settings-data.service';
import { NotificationService } from '../../../services/notification.service';
import { SettingsStateService } from '../../../services/settings-state.service';

declare var L: any;

@Component({
  selector: 'app-customer-details-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './customer-details-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerDetailsModalComponent {
  customer: InputSignal<Customer> = input.required<Customer>();
  close: OutputEmitterRef<void> = output<void>();

  private settingsDataService = inject(SettingsDataService);
  private notificationService = inject(NotificationService);
  private settingsState = inject(SettingsStateService);

  activeTab = signal<'details' | 'history' | 'loyalty'>('details');
  isLoadingHistory = signal(false);
  consumptionHistory = signal<Order[]>([]);
  loyaltyMovements = signal<LoyaltyMovement[]>([]);

  @ViewChild('mapContainer') mapContainer: ElementRef | undefined;
  private map: any;
  private mapInitialized = false;

  isLoadingMap = signal(false);
  mapGeocodeError = signal<string | null>(null);

  constructor() {
    effect(() => {
      // This effect runs when the customer input or active tab changes.
      const cust = this.customer();
      const tab = this.activeTab();

      this.destroyMap(); // Always clean up first

      if (tab === 'details') {
          if (cust.latitude && cust.longitude) {
              setTimeout(() => this.initMap(cust.latitude!, cust.longitude!), 0);
          } else if (cust.address) {
              setTimeout(() => this.geocodeAddressAndInitMap(cust.address!), 0);
          }
      }
    }, { allowSignalWrites: true });
  }

  private async geocodeAddressAndInitMap(address: string) {
    if (!this.mapContainer?.nativeElement) return;
    this.isLoadingMap.set(true);
    this.mapGeocodeError.set(null);
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=br&limit=1`);
        if (!response.ok) throw new Error('Falha ao buscar no serviço de geocodificação.');
        const data = await response.json();
        if (data && data.length > 0) {
            const { lat, lon } = data[0];
            this.initMap(parseFloat(lat), parseFloat(lon));
        } else {
            this.mapGeocodeError.set('Endereço não encontrado no mapa.');
        }
    } catch (error) {
        console.error('Geocoding error:', error);
        this.mapGeocodeError.set('Erro ao carregar mapa.');
    } finally {
        this.isLoadingMap.set(false);
    }
}

  private initMap(lat: number, lon: number): void {
    if (this.mapInitialized || !this.mapContainer?.nativeElement) {
        return;
    }

    this.map = L.map(this.mapContainer.nativeElement).setView([lat, lon], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);

    // Customer Marker
    L.marker([lat, lon]).addTo(this.map)
        .bindPopup('Endereço do Cliente').openPopup();

    // Restaurant Marker
    const profile = this.settingsState.companyProfile();
    if (profile?.latitude && profile.longitude) {
        L.marker([profile.latitude, profile.longitude], {
            icon: L.icon({
                iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
            })
        }).addTo(this.map).bindPopup('Seu Restaurante');
    }

    this.mapInitialized = true;
  }

  private destroyMap() {
    if (this.map) {
      this.map.remove();
      this.map = null;
      this.mapInitialized = false;
    }
  }

  async loadConsumptionHistory(customerId: string) {
    this.isLoadingHistory.set(true);
    const { data, error } = await this.settingsDataService.getConsumptionHistory(customerId);
    if (error) {
      this.notificationService.show('Erro ao carregar histórico de consumo.', 'error');
      this.consumptionHistory.set([]);
    } else {
      this.consumptionHistory.set(data || []);
    }
    this.isLoadingHistory.set(false);
  }
  
  async loadLoyaltyHistory(customerId: string) {
    this.isLoadingHistory.set(true);
    const { data, error } = await this.settingsDataService.getLoyaltyMovements(customerId);
    if (error) {
        this.notificationService.show('Erro ao carregar histórico de pontos.', 'error');
        this.loyaltyMovements.set([]);
    } else {
        this.loyaltyMovements.set(data || []);
    }
    this.isLoadingHistory.set(false);
  }
  
  getOrderTotal(order: Order): number {
    return order.order_items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }
}