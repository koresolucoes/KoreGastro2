import { Component, ChangeDetectionStrategy, inject, signal, computed, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DeliveryStateService } from '../../../services/delivery-state.service';
import { SettingsStateService } from '../../../services/settings-state.service';
import { DeliveryDriver } from '../../../models/db.models';
import { supabase } from '../../../services/supabase-client';
import { RealtimeChannel } from '@supabase/supabase-js';

declare var L: any; // Declare Leaflet

type DriverWithLocation = DeliveryDriver & { last_latitude: number; last_longitude: number; last_updated_at: string; };

@Component({
  selector: 'app-delivery-tracking',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './delivery-tracking.component.html',
  styleUrls: ['./delivery-tracking.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeliveryTrackingComponent implements AfterViewInit, OnDestroy {
  private deliveryState = inject(DeliveryStateService);
  private settingsState = inject(SettingsStateService);

  @ViewChild('mapContainer') mapContainer!: ElementRef;
  private map: any;
  private driverMarkers = new Map<string, any>(); // Using 'any' for L.Marker
  private channel: RealtimeChannel | null = null;
  
  isLoadingMap = signal(true);
  selectedDriverId = signal<string | null>(null);

  drivers = computed(() => 
    this.deliveryState.deliveryDrivers()
      .filter(d => d.is_active)
      .sort((a, b) => a.name.localeCompare(b.name))
  );
  
  companyProfile = this.settingsState.companyProfile;

  ngAfterViewInit(): void {
    if (typeof L !== 'undefined') {
      this.initMap();
      this.plotInitialDrivers();
      this.subscribeToLocationChanges();
      this.isLoadingMap.set(false);
    } else {
      console.error('Leaflet library not loaded.');
      this.isLoadingMap.set(false);
    }
  }

  ngOnDestroy(): void {
    if (this.channel) {
      supabase.removeChannel(this.channel);
    }
    if (this.map) {
      this.map.remove();
    }
  }

  private initMap(): void {
    const profile = this.companyProfile();
    const lat = profile?.latitude ?? -15.793889; // Default to Brasília
    const lon = profile?.longitude ?? -47.882778;

    this.map = L.map(this.mapContainer.nativeElement).setView([lat, lon], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);

    // Restaurant Marker
    if (profile?.latitude && profile.longitude) {
      L.marker([profile.latitude, profile.longitude], {
        icon: L.icon({
            iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
        })
      }).addTo(this.map).bindPopup('Seu Restaurante');
    }
  }

  private plotInitialDrivers(): void {
    this.drivers().forEach(driver => {
      if (this.hasRecentLocation(driver)) {
        this.updateMarker(driver as DriverWithLocation);
      }
    });
  }

  private subscribeToLocationChanges(): void {
    this.channel = supabase.channel('public:delivery_drivers')
      .on('postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'delivery_drivers' },
        (payload) => {
          console.log('Realtime location update received:', payload);
          const updatedDriver = payload.new as DriverWithLocation;
          if (this.hasRecentLocation(updatedDriver)) {
            this.updateMarker(updatedDriver);
          }
        }
      )
      .subscribe();
  }

  private updateMarker(driver: DriverWithLocation): void {
    if (!this.map) return;

    const latLng: [number, number] = [driver.last_latitude, driver.last_longitude];
    const popupContent = `
      <strong>${driver.name}</strong><br>
      <span class="status">Última atualização: ${this.formatTimeAgo(driver.last_updated_at)}</span>
    `;

    if (this.driverMarkers.has(driver.id)) {
      const marker = this.driverMarkers.get(driver.id);
      marker.setLatLng(latLng);
      marker.getPopup().setContent(popupContent);
    } else {
      const driverIcon = L.divIcon({
        className: 'delivery-driver-icon',
        html: `<span class="material-symbols-outlined text-white p-1">two_wheeler</span>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const newMarker = L.marker(latLng, { icon: driverIcon })
        .addTo(this.map)
        .bindPopup(popupContent, { className: 'driver-popup' });
      
      this.driverMarkers.set(driver.id, newMarker);
    }
  }

  panToDriver(driver: DeliveryDriver): void {
    this.selectedDriverId.set(driver.id);
    const marker = this.driverMarkers.get(driver.id);
    if (marker && this.map) {
      this.map.flyTo(marker.getLatLng(), 15);
      marker.openPopup();
    }
  }

  isDriverSelected(driver: DeliveryDriver): boolean {
    return this.selectedDriverId() === driver.id;
  }

  hasRecentLocation(driver: DeliveryDriver): driver is DriverWithLocation {
    return !!driver.last_latitude && !!driver.last_longitude && !!driver.last_updated_at;
  }

  formatTimeAgo(timestamp: string | null): string {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return `${seconds}s atrás`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m atrás`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h atrás`;
    
    return date.toLocaleDateString('pt-BR');
  }
}
