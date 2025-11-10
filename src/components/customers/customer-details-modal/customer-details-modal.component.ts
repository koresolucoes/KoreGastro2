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

  constructor() {
    effect(() => {
      // This effect runs when the customer input or active tab changes.
      const cust = this.customer();
      const tab = this.activeTab();

      // Teardown map if we are not on the details tab
      if (tab !== 'details') {
        this.destroyMap();
      }

      // Logic for each tab
      switch (tab) {
        case 'details':
          // The map container is only in the DOM on this tab.
          // We use a timeout to ensure the @if has rendered the container
          // before we try to initialize the map.
          setTimeout(() => this.initMap(), 0);
          break;
        case 'history':
          if (this.consumptionHistory().length === 0) {
            this.loadConsumptionHistory(cust.id);
          }
          break;
        case 'loyalty':
          if (this.loyaltyMovements().length === 0) {
            this.loadLoyaltyHistory(cust.id);
          }
          break;
      }
    }, { allowSignalWrites: true });
  }

  private initMap(): void {
    const cust = this.customer();
    // Check if map is already there, or if container/data is missing
    if (this.mapInitialized || !this.mapContainer?.nativeElement || !cust.latitude || !cust.longitude) {
        return;
    }

    this.map = L.map(this.mapContainer.nativeElement).setView([cust.latitude, cust.longitude], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);

    // Customer Marker
    L.marker([cust.latitude, cust.longitude]).addTo(this.map)
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
