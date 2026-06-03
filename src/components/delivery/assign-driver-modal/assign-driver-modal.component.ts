import { Component, ChangeDetectionStrategy, inject, signal, computed, input, output, InputSignal, OutputEmitterRef, AfterViewInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Order } from '../../../models/db.models';
import { DeliveryStateService } from '../../../services/delivery-state.service';
import { SettingsStateService } from '../../../services/settings-state.service';

declare var L: any; // Leaflet

@Component({
  selector: 'app-assign-driver-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './assign-driver-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssignDriverModalComponent implements AfterViewInit, OnDestroy {
  private deliveryState = inject(DeliveryStateService);
  private settingsState = inject(SettingsStateService);

  orders: InputSignal<Order[]> = input.required<Order[]>();
  
  closeModal: OutputEmitterRef<void> = output<void>();
  driverAssigned: OutputEmitterRef<{ driverId: string }> = output();

  @ViewChild('mapContainer') mapContainer!: ElementRef;
  private map: any;

  availableDrivers = computed(() => 
    this.deliveryState.deliveryDrivers().filter(d => d.is_active)
  );

  totalDistance = computed(() => {
     return this.orders().reduce((sum, order) => sum + (order.delivery_distance_km ?? 0), 0);
  });
  
  costForDriver = computed(() => {
    const drivers = this.availableDrivers();
    const distance = this.totalDistance();
    
    const costMap = new Map<string, number>();
    drivers.forEach(driver => {
        const cost = (driver.base_rate ?? 0) + ((driver.rate_per_km ?? 0) * distance);
        costMap.set(driver.id, cost);
    });
    return costMap;
  });

  ngAfterViewInit() {
      setTimeout(() => {
          this.initMap();
      }, 100);
  }

  ngOnDestroy() {
      if (this.map) {
          this.map.remove();
      }
  }

  private initMap() {
      if (!this.mapContainer || !L) return;
      
      const profile = this.settingsState.companyProfile();
      const centerLat = profile?.latitude || -23.55052;
      const centerLon = profile?.longitude || -46.633309;

      this.map = L.map(this.mapContainer.nativeElement).setView([centerLat, centerLon], 13);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>'
      }).addTo(this.map);

      // Add restaurant marker
      if (profile?.latitude && profile?.longitude) {
         L.circleMarker([profile.latitude, profile.longitude], {
            radius: 8, fillColor: '#000', color: '#fff', weight: 2, opacity: 1, fillOpacity: 1
         }).addTo(this.map).bindPopup('Restaurante');
      }

      // Add driver markers (if any) or order markers
      const bounds = L.latLngBounds([]);
      if (profile?.latitude && profile?.longitude) {
         bounds.extend([profile.latitude, profile.longitude]);
      }

      const orders = this.orders();
      orders.forEach((o, i) => {
          const c = o.customers;
          if (c && c.latitude && c.longitude) {
              const marker = L.circleMarker([c.latitude, c.longitude], {
                  radius: 8, fillColor: '#10b981', color: '#fff', weight: 2, opacity: 1, fillOpacity: 0.8
              }).addTo(this.map).bindPopup(`Pedido #${o.id.slice(0,4)}<br>${c.name}`);
              bounds.extend([c.latitude, c.longitude]);
          }
      });

      if (bounds.isValid()) {
         this.map.fitBounds(bounds, { padding: [20, 20] });
      }
  }

  assign(driverId: string) {
    this.driverAssigned.emit({ driverId });
  }
}