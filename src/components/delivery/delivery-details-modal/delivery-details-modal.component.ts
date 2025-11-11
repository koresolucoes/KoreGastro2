import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, input, output, InputSignal, OutputEmitterRef, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Order } from '../../../models/db.models';
import { PrintingService } from '../../../services/printing.service';
import { SettingsStateService } from '../../../services/settings-state.service';

declare var L: any; // Declare Leaflet

@Component({
  selector: 'app-delivery-details-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './delivery-details-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeliveryDetailsModalComponent implements OnDestroy {
  order: InputSignal<Order | null> = input.required<Order | null>();
  closeModal: OutputEmitterRef<void> = output<void>();
  
  private printingService = inject(PrintingService);
  private settingsState = inject(SettingsStateService);

  @ViewChild('mapContainer') mapContainer!: ElementRef;
  private map: any;
  private mapInitialized = false;

  constructor() {
    effect(() => {
      const o = this.order();
      if (o && o.customers) {
        // Defer map initialization to ensure the view is ready
        setTimeout(() => this.initMap(), 100);
      } else {
        this.destroyMap();
      }
    });
  }

  ngOnDestroy() {
    this.destroyMap();
  }

  private async initMap() {
    if (this.mapInitialized || !this.mapContainer?.nativeElement) return;
    
    const customer = this.order()!.customers;
    if (!customer) return;

    let lat = customer.latitude;
    let lon = customer.longitude;
    
    // Geocode if lat/lon are missing
    if (!lat || !lon) {
        if (customer.address) {
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(customer.address)}&countrycodes=br&limit=1`);
                const data = await response.json();
                if (data && data.length > 0) {
                    lat = parseFloat(data[0].lat);
                    lon = parseFloat(data[0].lon);
                } else {
                    console.warn("Could not geocode customer address.");
                    return; // Don't show map if geocoding fails
                }
            } catch (error) {
                console.error("Geocoding error:", error);
                return;
            }
        } else {
            return; // No address to geocode
        }
    }
    
    this.map = L.map(this.mapContainer.nativeElement).setView([lat, lon], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(this.map);

    L.marker([lat, lon]).addTo(this.map).bindPopup('Endereço de Entrega');
    
    this.mapInitialized = true;
  }
  
  private destroyMap() {
    if (this.map) {
      this.map.remove();
      this.map = null;
      this.mapInitialized = false;
    }
  }

  getItemSubtotal(order: Order): number {
    return order.order_items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  getOrderTotal(order: Order): number {
    return this.getItemSubtotal(order) + (order.delivery_cost ?? 0);
  }

  printGuide() {
    const orderToPrint = this.order();
    if (orderToPrint) {
      this.printingService.printDeliveryGuide(orderToPrint);
    }
  }
}