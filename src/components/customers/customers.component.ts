import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  effect,
  ViewChild,
  ElementRef,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Customer } from "../../models/db.models";
import { PosStateService } from "../../services/pos-state.service";
import { SettingsDataService } from "../../services/settings-data.service";
import { NotificationService } from "../../services/notification.service";
import { CustomerDetailsModalComponent } from "./customer-details-modal/customer-details-modal.component";
import { SettingsStateService } from "../../services/settings-state.service";

declare var L: any;

@Component({
  selector: "app-customers",
  standalone: true,
  imports: [CommonModule, FormsModule, CustomerDetailsModalComponent],
  templateUrl: "./customers.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomersComponent {
  private posState = inject(PosStateService);
  private settingsDataService = inject(SettingsDataService);
  private notificationService = inject(NotificationService);
  private settingsState = inject(SettingsStateService);

  customers = this.posState.customers;
  searchTerm = signal("");

  isModalOpen = signal(false);
  editingCustomer = signal<Partial<Customer> | null>(null);
  customerForm = signal<Partial<Customer>>({});
  customerPendingDeletion = signal<Customer | null>(null);

  isDetailsModalOpen = signal(false);
  selectedCustomerForDetails = signal<Customer | null>(null);

  // Address search signals
  addressSearchTerm = signal("");
  addressSearchResults = signal<any[]>([]);
  isSearchingAddress = signal(false);
  private debounceTimer: any;

  // New separate address fields
  addressStreet = signal("");
  addressNumber = signal("");
  addressComplement = signal("");
  addressNeighborhood = signal("");
  addressCity = signal("");

  // Map related state
  @ViewChild("addEditMapContainer") mapContainer: ElementRef | undefined;
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

  filteredCustomers = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const allCustomers = this.customers();
    if (!term) return allCustomers;
    return allCustomers.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.phone?.toLowerCase().includes(term) ||
        c.email?.toLowerCase().includes(term) ||
        c.cpf?.toLowerCase().includes(term),
    );
  });

  openDetailsModal(customer: Customer) {
    this.selectedCustomerForDetails.set(customer);
    this.isDetailsModalOpen.set(true);
  }

  openAddModal() {
    this.customerForm.set({});
    this.editingCustomer.set(null);
    this.addressStreet.set("");
    this.addressNumber.set("");
    this.addressComplement.set("");
    this.addressNeighborhood.set("");
    this.addressCity.set("");
    this.isModalOpen.set(true);
  }

  openEditModal(customer: Customer) {
    this.editingCustomer.set(customer);
    this.customerForm.set({ ...customer });
    this.isModalOpen.set(true);

    // Parse address dynamically without breaking comma-separated street names
    const address = customer.address || "";
    this.addressStreet.set("");
    this.addressNumber.set("");
    this.addressComplement.set("");
    this.addressNeighborhood.set("");
    this.addressCity.set("");

    const numMatch = address.match(
      /(?:Nº|N|n|Número)\s?(.*?)(?:, Compl:|, Bairro:|, Cidade:|$)/,
    );
    const compMatch = address.match(/Compl: (.*?)(?:, Bairro:|, Cidade:|$)/);
    const bairroMatch = address.match(/Bairro: (.*?)(?:, Cidade:|$)/);
    const cidadeMatch = address.match(/Cidade: (.*?)$/);

    if (numMatch || compMatch || bairroMatch || cidadeMatch) {
      if (numMatch) this.addressNumber.set(numMatch[1].trim());
      if (compMatch) this.addressComplement.set(compMatch[1].trim());
      if (bairroMatch) this.addressNeighborhood.set(bairroMatch[1].trim());
      if (cidadeMatch) this.addressCity.set(cidadeMatch[1].trim());

      const streetMatch = address.split(/, (?:Nº|Compl:|Bairro:|Cidade:)/)[0];
      this.addressStreet.set(streetMatch.trim());
    } else {
      // Fallback for older address formats
      const parts = address.split(",");
      this.addressStreet.set(parts[0]?.trim() || "");
      if (parts.length > 1) {
        const remainder = parts.slice(1).join(",").trim();
        const complementParts = remainder.split(" - ");
        this.addressNumber.set(complementParts[0]?.trim() || "");
        if (complementParts.length > 1) {
          this.addressComplement.set(
            complementParts.slice(1).join(" - ").trim(),
          );
        }
      }
    }
  }

  closeModal() {
    this.isModalOpen.set(false);
    this.addressSearchTerm.set("");
    this.addressSearchResults.set([]);
  }

  updateCustomerFormField(
    field: keyof Omit<Customer, "id" | "created_at" | "user_id">,
    value: string,
  ) {
    this.customerForm.update((form) => {
      const newForm: Partial<Customer> = { ...form };
      if (field === "latitude" || field === "longitude") {
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
      await this.notificationService.alert("O nome do cliente é obrigatório.");
      return;
    }

    // Compose the full address string from the separate fields
    const parts = [];
    if (this.addressStreet().trim()) parts.push(this.addressStreet().trim());
    if (this.addressNumber().trim())
      parts.push(`Nº ${this.addressNumber().trim()}`);
    if (this.addressComplement().trim())
      parts.push(`Compl: ${this.addressComplement().trim()}`);
    if (this.addressNeighborhood().trim())
      parts.push(`Bairro: ${this.addressNeighborhood().trim()}`);
    if (this.addressCity().trim())
      parts.push(`Cidade: ${this.addressCity().trim()}`);

    const fullAddress = parts.join(", ");

    const formWithFullAddress = { ...form, address: fullAddress || null };

    let res;
    if (this.editingCustomer()) {
      res = await this.settingsDataService.updateCustomer({
        ...formWithFullAddress,
        id: this.editingCustomer()!.id,
      });
    } else {
      res = await this.settingsDataService.addCustomer(formWithFullAddress);
    }

    if (res.success) {
      this.closeModal();
    } else {
      await this.notificationService.alert(
        `Falha ao salvar cliente: ${res.error?.message}`,
      );
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
    const { success, error } = await this.settingsDataService.deleteCustomer(
      customer.id,
    );
    if (!success) {
      await this.notificationService.alert(
        `Falha ao excluir cliente: ${error?.message}`,
      );
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
    const initialZoom = form.latitude && form.longitude ? 17 : 13;

    this.map = L.map(this.mapContainer.nativeElement).setView(
      [initialLat, initialLon],
      initialZoom,
    );

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.map);

    this.marker = L.marker([initialLat, initialLon]).addTo(this.map);

    this.map.on("click", (e: any) => {
      const { lat, lng } = e.latlng;
      this.marker.setLatLng([lat, lng]);
      this.customerForm.update((f) => ({
        ...f,
        latitude: lat,
        longitude: lng,
      }));
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

  async searchCep(event: Event) {
    let cep = (event.target as HTMLInputElement).value;
    cep = cep.replace(/\D/g, "");

    if (cep.length !== 8) return;

    this.isSearchingAddress.set(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await response.json();
      if (!data.erro) {
        this.addressStreet.set(data.logradouro || "");
        this.addressNeighborhood.set(data.bairro || "");
        this.addressCity.set(`${data.localidade || ""} - ${data.uf || ""}`);
        const fullAddress = `${data.logradouro}, ${data.bairro}, ${data.localidade} - ${data.uf}`;
        // Search this constructed address in nominatim to plot on map
        this.searchAddressForMap(fullAddress);
      } else {
        this.notificationService.show("CEP não encontrado.", "error");
      }
    } catch (err) {
      this.notificationService.show("Erro ao buscar CEP.", "error");
    } finally {
      this.isSearchingAddress.set(false);
    }
  }

  async searchAddressForMap(term: string) {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(term)}&countrycodes=br&limit=1`,
      );
      const data = await response.json();
      if (data && data.length > 0) {
        this.selectAddress(data[0], false);
      }
    } catch (e) {}
  }

  async searchAddress(term: string) {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(term)}&countrycodes=br&limit=5`,
      );
      if (!response.ok) throw new Error("A resposta da rede não foi OK");
      const data = await response.json();
      this.addressSearchResults.set(data);
    } catch (error) {
      console.error("Erro ao buscar endereço:", error);
      this.notificationService.show("Erro ao buscar endereço.", "error");
    } finally {
      this.isSearchingAddress.set(false);
    }
  }

  selectAddress(result: any, overrideStreet = true) {
    this.addressSearchTerm.set("");
    this.addressSearchResults.set([]);

    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);

    if (overrideStreet) {
      if (result.address) {
        this.addressStreet.set(
          result.address.road || result.display_name.split(",")[0],
        );
        this.addressNeighborhood.set(
          result.address.suburb ||
            result.address.neighbourhood ||
            result.address.city_district ||
            "",
        );
        this.addressCity.set(
          `${result.address.city || result.address.town || result.address.village || ""} - ${result.address.state || ""}`,
        );
      } else {
        this.addressStreet.set(result.display_name);
      }
      this.addressNumber.set("");
      this.addressComplement.set("");
    }

    this.customerForm.update((form) => ({
      ...form,
      latitude: lat,
      longitude: lon,
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
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lon}`,
      );
      if (!response.ok) throw new Error("A geocodificação reversa falhou");
      const data = await response.json();
      if (data) {
        if (data.address) {
          this.addressStreet.set(
            data.address.road || data.display_name.split(",")[0],
          );
          this.addressNeighborhood.set(
            data.address.suburb ||
              data.address.neighbourhood ||
              data.address.city_district ||
              "",
          );
          this.addressCity.set(
            `${data.address.city || data.address.town || data.address.village || ""} - ${data.address.state || ""}`,
          );
        } else if (data.display_name) {
          this.addressStreet.set(data.display_name);
        }
      }
    } catch (error) {
      console.error("Erro na geocodificação reversa:", error);
    } finally {
      this.isSearchingAddress.set(false);
    }
  }
}
