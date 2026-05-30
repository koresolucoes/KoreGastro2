import { Component, ChangeDetectionStrategy, signal, computed, inject, effect, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Customer } from '../../models/db.models';
import { PosStateService } from '../../services/pos-state.service';
import { SettingsDataService } from '../../services/settings-data.service';
import { NotificationService } from '../../services/notification.service';
import { CustomerDetailsModalComponent } from './customer-details-modal/customer-details-modal.component';
import { SettingsStateService } from '../../services/settings-state.service';
import { supabase } from '../../services/supabase-client';
import { UnitContextService } from '../../services/unit-context.service';

declare var L: any;

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [CommonModule, FormsModule, CustomerDetailsModalComponent],
  templateUrl: './customers.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomersComponent {
  private posState = inject(PosStateService);
  private settingsDataService = inject(SettingsDataService);
  private notificationService = inject(NotificationService);
  private settingsState = inject(SettingsStateService);
  private unitContextService = inject(UnitContextService);

  customers = this.posState.customers;
  searchTerm = signal('');

  isModalOpen = signal(false);
  editingCustomer = signal<Partial<Customer> | null>(null);
  customerForm = signal<Partial<Customer>>({});
  customerPendingDeletion = signal<Customer | null>(null);

  isDetailsModalOpen = signal(false);
  selectedCustomerForDetails = signal<Customer | null>(null);

  // Address search signals
  addressSearchTerm = signal('');
  addressSearchResults = signal<any[]>([]);
  isSearchingAddress = signal(false);
  private debounceTimer: any;
  
  // New separate address fields
  addressStreet = signal('');
  addressNumber = signal('');
  addressComplement = signal('');

  // Map related state
  @ViewChild('addEditMapContainer') mapContainer: ElementRef | undefined;
  private map: any;
  private marker: any;
  private mapInitialized = false;

  constructor() {
    effect(() => {
        if (this.isModalOpen()) {
            // Defer map initialization to ensure view is ready
            setTimeout(() => this.initMap(), 100);
        } else {
            this.destroyMap();
        }
    });
  }

  activeTab = signal<'list' | 'rfm'>('list');

  // RFM Signals
  rfmSegments = signal<any[]>([]);
  isRfmLoading = signal(false);
  rfmSummaryOptions = [
    { id: 'campeoes', label: 'Campeões', icon: 'workspace_premium', color: 'text-success', bg: 'bg-success/10', border: 'border-success' },
    { id: 'fieis', label: 'Clientes Fiéis', icon: 'favorite', color: 'text-brand', bg: 'bg-brand/10', border: 'border-brand' },
    { id: 'potenciais', label: 'Potenciais Fiéis', icon: 'trending_up', color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500' },
    { id: 'novos', label: 'Novos e Promissores', icon: 'fiber_new', color: 'text-cyan-500', bg: 'bg-cyan-500/10', border: 'border-cyan-500' },
    { id: 'risco', label: 'Em Risco', icon: 'error_outline', color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning' },
    { id: 'perdidos', label: 'Hibernando / Perdidos', icon: 'cloud_off', color: 'text-danger', bg: 'bg-danger/10', border: 'border-danger' },
  ];

  filteredCustomers = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const allCustomers = this.customers();
    if (!term) return allCustomers;
    return allCustomers.filter(c =>
      c.name.toLowerCase().includes(term) ||
      c.phone?.toLowerCase().includes(term) ||
      c.email?.toLowerCase().includes(term) ||
      c.cpf?.toLowerCase().includes(term)
    );
  });
  
  setActiveTab(tab: 'list' | 'rfm') {
    this.activeTab.set(tab);
    if (tab === 'rfm' && this.rfmSegments().length === 0) {
        this.loadRfmAnalysis();
    }
  }

  getSegmentMembers(categoryId: string) {
    return this.rfmSegments().filter(s => s.segmentId === categoryId);
  }

  getSegmentStyle(segmentId: string) {
    return this.rfmSummaryOptions.find(o => o.id === segmentId) || this.rfmSummaryOptions[this.rfmSummaryOptions.length - 1];
  }

  async loadRfmAnalysis() {
    this.isRfmLoading.set(true);
    const unitId = this.unitContextService.activeUnitId();
    if (!unitId) {
       this.isRfmLoading.set(false);
       return;
    }

    try {
        const { data: customerOrders, error } = await supabase
            .from('orders')
            .select('customer_id, completed_at, order_items(quantity, price)')
            .eq('user_id', unitId)
            .eq('status', 'COMPLETED')
            .not('customer_id', 'is', null);

        if (error) throw error;

        // Group by customer
        const customerMaps = new Map<string, { lastOrderDate: Date, totalOrders: number, totalSpent: number }>();
        
        customerOrders?.forEach((order: any) => {
            const sum = order.order_items.reduce((acc: number, item: any) => acc + (item.price * item.quantity), 0);
            const date = new Date(order.completed_at);
            
            const existing = customerMaps.get(order.customer_id) || { lastOrderDate: new Date(0), totalOrders: 0, totalSpent: 0 };
            
            customerMaps.set(order.customer_id, {
                lastOrderDate: date > existing.lastOrderDate ? date : existing.lastOrderDate,
                totalOrders: existing.totalOrders + 1,
                totalSpent: existing.totalSpent + sum
            });
        });

        const today = new Date();
        const segments: any[] = [];
        const allCust = this.customers();

        customerMaps.forEach((metrics, customerId) => {
            const customer = allCust.find(c => c.id === customerId);
            if (!customer) return;

            const recency = Math.floor((today.getTime() - metrics.lastOrderDate.getTime()) / (1000 * 3600 * 24));
            const frequency = metrics.totalOrders;
            const monetary = metrics.totalSpent;

            // Simple Scoring logic or static boundaries
            let segmentId = 'perdidos';
            
            if (recency <= 30 && frequency >= 4 && monetary >= 200) {
                segmentId = 'campeoes';
            } else if (recency <= 60 && frequency >= 3) {
                segmentId = 'fieis';
            } else if (recency <= 60 && frequency >= 2) {
                segmentId = 'potenciais';
            } else if (recency <= 30 && frequency === 1) {
                segmentId = 'novos';
            } else if (recency > 60 && recency <= 120 && frequency >= 2) {
                segmentId = 'risco';
            } else {
                segmentId = 'perdidos';
            }

            segments.push({
                customer,
                recency,
                frequency,
                monetary,
                segmentId
            });
        });

        // Add customers with no orders as "novos" or "perdidos" ? Let's just say "perdidos"
        allCust.forEach(c => {
           if (!customerMaps.has(c.id)) {
               segments.push({
                   customer: c,
                   recency: 999,
                   frequency: 0,
                   monetary: 0,
                   segmentId: 'perdidos'
               });
           }
        });

        // Sort by Monetary mostly
        segments.sort((a,b) => b.monetary - a.monetary);
        this.rfmSegments.set(segments);
        
    } catch (e: any) {
        console.error('RFM Analysis Error:', e);
        this.notificationService.show('Erro ao carregar análise RFM.', 'error');
    } finally {
        this.isRfmLoading.set(false);
    }
  }

  openDetailsModal(customer: Customer) {
    this.selectedCustomerForDetails.set(customer);
    this.isDetailsModalOpen.set(true);
  }

  openAddModal() {
    this.customerForm.set({});
    this.editingCustomer.set(null);
    this.addressStreet.set('');
    this.addressNumber.set('');
    this.addressComplement.set('');
    this.isModalOpen.set(true);
  }

  openEditModal(customer: Customer) {
    this.editingCustomer.set(customer);
    this.customerForm.set({ ...customer });
    this.isModalOpen.set(true);

    // Parse address
    const address = customer.address || '';
    const parts = address.split(',');
    this.addressStreet.set(parts[0].trim());
    
    if (parts.length > 1) {
        const remainder = parts.slice(1).join(',').trim();
        const complementParts = remainder.split(' - ');
        this.addressNumber.set(complementParts[0].trim());
        if (complementParts.length > 1) {
            this.addressComplement.set(complementParts.slice(1).join(' - ').trim());
        } else {
            this.addressComplement.set('');
        }
    } else {
        this.addressNumber.set('');
        this.addressComplement.set('');
    }
  }

  closeModal() {
    this.isModalOpen.set(false);
    this.addressSearchTerm.set('');
    this.addressSearchResults.set([]);
  }

  updateCustomerFormField(field: keyof Omit<Customer, 'id' | 'created_at' | 'user_id'>, value: string) {
    this.customerForm.update(form => {
        const newForm: Partial<Customer> = { ...form };
        if (field === 'latitude' || field === 'longitude') {
            (newForm as any)[field] = parseFloat(value) || null;
            if (this.marker && newForm.latitude && newForm.longitude) {
                this.marker.setLatLng([newForm.latitude, newForm.longitude]);
            }
        } else {
            (newForm as any)[field] = value || null;
        }
        return newForm;
    });
  }

  async saveCustomer() {
    const form = this.customerForm();
    if (!form.name?.trim()) {
      await this.notificationService.alert('O nome do cliente é obrigatório.');
      return;
    }
    
    // Compose the full address string from the separate fields
    let fullAddress = this.addressStreet().trim();
    const number = this.addressNumber().trim();
    const complement = this.addressComplement().trim();

    if (number) {
        fullAddress += `, ${number}`;
    }
    if (complement) {
        fullAddress += ` - ${complement}`;
    }
    
    const formWithFullAddress = { ...form, address: fullAddress };


    let res;
    if (this.editingCustomer()) {
      res = await this.settingsDataService.updateCustomer({ ...formWithFullAddress, id: this.editingCustomer()!.id });
    } else {
      res = await this.settingsDataService.addCustomer(formWithFullAddress);
    }

    if (res.success) {
      this.closeModal();
    } else {
      await this.notificationService.alert(`Falha ao salvar cliente: ${res.error?.message}`);
    }
  }

  requestDeleteCustomer(customer: Customer) {
    this.customerPendingDeletion.set(customer);
  }

  cancelDeleteCustomer() {
    this.customerPendingDeletion.set(null);
  }

  async confirmDeleteCustomer() {
    const customer = this.customerPendingDeletion();
    if (!customer) return;
    const { success, error } = await this.settingsDataService.deleteCustomer(customer.id);
    if (!success) {
      await this.notificationService.alert(`Falha ao excluir cliente: ${error?.message}`);
    }
    this.customerPendingDeletion.set(null);
  }
  
  private initMap(): void {
    if (this.mapInitialized || !this.mapContainer?.nativeElement) {
      return;
    }
    
    const form = this.customerForm();
    const profile = this.settingsState.companyProfile();
    
    const initialLat = form.latitude ?? profile?.latitude ?? -15.793889; // Default to Brasília
    const initialLon = form.longitude ?? profile?.longitude ?? -47.882778;
    const initialZoom = (form.latitude && form.longitude) ? 17 : 13;
    
    this.map = L.map(this.mapContainer.nativeElement).setView([initialLat, initialLon], initialZoom);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);
    
    this.marker = L.marker([initialLat, initialLon]).addTo(this.map);
    
    this.map.on('click', (e: any) => {
      const { lat, lng } = e.latlng;
      this.marker.setLatLng([lat, lng]);
      this.customerForm.update(f => ({ ...f, latitude: lat, longitude: lng }));
      this.reverseGeocode(lat, lng);
    });
    
    this.mapInitialized = true;
  }
  
  private destroyMap(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
      this.mapInitialized = false;
    }
  }

  onAddressSearchChange(event: Event) {
    const term = (event.target as HTMLInputElement).value;
    this.addressSearchTerm.set(term);

    clearTimeout(this.debounceTimer);
    if (term.length < 3) {
        this.addressSearchResults.set([]);
        return;
    }

    this.isSearchingAddress.set(true);
    this.debounceTimer = setTimeout(() => {
        this.searchAddress(term);
    }, 500);
  }

  async searchAddress(term: string) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(term)}&countrycodes=br&limit=5`);
        if (!response.ok) throw new Error('A resposta da rede não foi OK');
        const data = await response.json();
        this.addressSearchResults.set(data);
    } catch (error) {
        console.error('Erro ao buscar endereço:', error);
        this.notificationService.show('Erro ao buscar endereço.', 'error');
    } finally {
        this.isSearchingAddress.set(false);
    }
  }

  selectAddress(result: any) {
    this.addressSearchTerm.set('');
    this.addressSearchResults.set([]);
    
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);

    this.addressStreet.set(result.display_name);
    this.addressNumber.set('');
    this.addressComplement.set('');

    this.customerForm.update(form => ({
        ...form,
        latitude: lat,
        longitude: lon
    }));

    if (this.map) {
        const newLatLng = L.latLng(lat, lon);
        this.map.flyTo(newLatLng, 17);
        if (this.marker) {
            this.marker.setLatLng(newLatLng);
        }
    }
  }
  
  async reverseGeocode(lat: number, lon: number) {
      this.isSearchingAddress.set(true);
      try {
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
          if (!response.ok) throw new Error('A geocodificação reversa falhou');
          const data = await response.json();
          if (data && data.display_name) {
              this.addressStreet.set(data.display_name);
          }
      } catch (error) {
          console.error('Erro na geocodificação reversa:', error);
      } finally {
          this.isSearchingAddress.set(false);
      }
  }
}