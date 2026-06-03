import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  output,
  OutputEmitterRef,
  input,
  InputSignal,
  effect,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { DeliveryDataService } from "../../../services/delivery-data.service";
import { NotificationService } from "../../../services/notification.service";
import { RecipeStateService } from "../../../services/recipe-state.service";
import { Recipe, Customer, Order, OrderItem } from "../../../models/db.models";
import { CustomerSelectModalComponent } from "../../shared/customer-select-modal/customer-select-modal.component";
import { SettingsStateService } from "../../../services/settings-state.service";

interface CartItem {
  recipe: Recipe;
  quantity: number;
  notes: string;
}

@Component({
  selector: "app-delivery-order-modal",
  standalone: true,
  imports: [CommonModule, FormsModule, CustomerSelectModalComponent],
  templateUrl: "./delivery-order-modal.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeliveryOrderModalComponent {
  private deliveryDataService = inject(DeliveryDataService);
  private notificationService = inject(NotificationService);
  private recipeState = inject(RecipeStateService);
  private settingsState = inject(SettingsStateService);

  editingOrder: InputSignal<Order | null> = input<Order | null>(null);
  closeModal: OutputEmitterRef<void> = output<void>();

  isEditing = computed(() => !!this.editingOrder());

  cart = signal<CartItem[]>([]);
  selectedCustomer = signal<Customer | null>(null);
  paymentMethod: string = "Dinheiro";
  recipeSearchTerm = signal("");
  distance = signal(0);
  deliveryFee = signal(0);
  isSaving = signal(false);
  isCustomerSelectModalOpen = signal(false);

  street = signal("");
  addressNumber = signal("");
  complement = signal("");
  neighborhood = signal("");
  city = signal("");

  recipes = this.recipeState.recipesWithStockStatus;

  constructor() {
    effect(() => {
      const order = this.editingOrder();
      if (order) {
        // Populate state for editing
        this.isSaving.set(false);
        this.selectedCustomer.set(order.customers || null);
        this.paymentMethod =
          order.notes?.match(/Pagamento: ([^\n|]+)/)?.[1]?.trim() || "Dinheiro";
        this.distance.set(order.delivery_distance_km ?? 0);
        this.deliveryFee.set(order.delivery_cost ?? 0);

        // Try to extract address from notes if it exists
        const addressMatch = order.notes?.match(/Endereço: (.+)/);
        if (addressMatch) {
          const address = addressMatch[1];
          const numMatch = address.match(
            /Nº (.*?)(?:, Compl:|, Bairro:|, Cidade:|$)/,
          );
          const compMatch = address.match(
            /Compl: (.*?)(?:, Bairro:|, Cidade:|$)/,
          );
          const bairroMatch = address.match(/Bairro: (.*?)(?:, Cidade:|$)/);
          const cidadeMatch = address.match(/Cidade: (.*?)(?: \||$)/);

          if (numMatch || compMatch || bairroMatch || cidadeMatch) {
            if (numMatch) this.addressNumber.set(numMatch[1].trim());
            if (compMatch) this.complement.set(compMatch[1].trim());
            if (bairroMatch) this.neighborhood.set(bairroMatch[1].trim());
            if (cidadeMatch) this.city.set(cidadeMatch[1].trim());

            const streetMatch = address.split(
              /, (?:Nº|Compl:|Bairro:|Cidade:)/,
            )[0];
            this.street.set(streetMatch.trim());
          } else {
            // Fallback for notes format
            const parts = address.split(" - ");
            if (parts[0]) {
              const streetMatch = parts[0].match(/(.+), (.+)/);
              if (streetMatch) {
                this.street.set(streetMatch[1] || parts[0]);
                this.addressNumber.set(streetMatch[2] || "");
              } else {
                this.street.set(parts[0]);
              }
            }
            if (parts[1]) this.complement.set(parts[1]);
            if (parts[2]) this.neighborhood.set(parts[2]);
            if (parts[3]) this.city.set(parts[3]);
          }
        } else if (order.customers?.address) {
          const address = order.customers.address;
          const numMatch = address.match(
            /Nº (.*?)(?:, Compl:|, Bairro:|, Cidade:|$)/,
          );
          const compMatch = address.match(
            /Compl: (.*?)(?:, Bairro:|, Cidade:|$)/,
          );
          const bairroMatch = address.match(/Bairro: (.*?)(?:, Cidade:|$)/);
          const cidadeMatch = address.match(/Cidade: (.*?)(?: \||$)/);

          if (numMatch || compMatch || bairroMatch || cidadeMatch) {
            if (numMatch) this.addressNumber.set(numMatch[1].trim());
            if (compMatch) this.complement.set(compMatch[1].trim());
            if (bairroMatch) this.neighborhood.set(bairroMatch[1].trim());
            if (cidadeMatch) this.city.set(cidadeMatch[1].trim());

            const streetMatch = address.split(
              /, (?:Nº|Compl:|Bairro:|Cidade:)/,
            )[0];
            this.street.set(streetMatch.trim());
          } else {
            // Fallback
            const parts = address.split(",");
            this.street.set(parts[0]?.trim() || "");
            if (parts.length > 1) {
              const remainder = parts.slice(1).join(",").trim();
              const complementParts = remainder.split(" - ");
              this.addressNumber.set(complementParts[0]?.trim() || "");
              if (complementParts.length > 1) {
                this.complement.set(
                  complementParts.slice(1).join(" - ").trim(),
                );
              }
            }
          }
        }

        const recipesMap = this.recipeState.recipesById();

        const cartItems: CartItem[] = (order.order_items || []).reduce(
          (acc, orderItem) => {
            if (orderItem.recipe_id) {
              const recipe = recipesMap.get(orderItem.recipe_id);
              if (recipe) {
                const existing = acc.find((ci) => ci.recipe.id === recipe.id);
                if (existing) {
                  existing.quantity += orderItem.quantity;
                } else {
                  acc.push({
                    recipe,
                    quantity: orderItem.quantity,
                    notes: orderItem.notes || "",
                  });
                }
              }
            }
            return acc;
          },
          [] as CartItem[],
        );
        this.cart.set(cartItems);
      }
    });
  }

  filteredRecipes = computed(() => {
    const term = this.recipeSearchTerm().toLowerCase();
    let recipesToShow = this.recipes().filter(
      (r) => r.is_available && !r.is_sub_recipe,
    );
    if (term) {
      recipesToShow = recipesToShow.filter((r) =>
        r.name.toLowerCase().includes(term),
      );
    }
    return recipesToShow;
  });

  cartTotal = computed(() => {
    const itemsTotal = this.cart().reduce(
      (sum, item) => sum + item.recipe.price * item.quantity,
      0,
    );
    return itemsTotal + this.deliveryFee();
  });

  addToCart(recipe: Recipe & { hasStock?: boolean }) {
    if (!recipe.hasStock) {
      this.notificationService.show("Item sem estoque suficiente.", "warning");
      return;
    }
    this.cart.update((currentCart) => {
      const existing = currentCart.find((item) => item.recipe.id === recipe.id);
      if (existing) {
        return currentCart.map((item) =>
          item.recipe.id === recipe.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [...currentCart, { recipe, quantity: 1, notes: "" }];
    });
  }

  updateQuantity(recipeId: string, change: 1 | -1) {
    this.cart.update((currentCart) =>
      currentCart
        .map((item) =>
          item.recipe.id === recipeId
            ? { ...item, quantity: Math.max(0, item.quantity + change) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371e3; // metres
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) *
        Math.cos(phi2) *
        Math.sin(deltaLambda / 2) *
        Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distanceInMeters = R * c;
    return distanceInMeters / 1000; // convert to KM
  }

  isSearchingAddress = signal(false);

  async searchCep(event: Event) {
    let cep = (event.target as HTMLInputElement).value;
    cep = cep.replace(/\D/g, "");

    if (cep.length !== 8) return;

    this.isSearchingAddress.set(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await response.json();
      if (!data.erro) {
        this.street.set(data.logradouro || "");
        this.neighborhood.set(data.bairro || "");
        this.city.set(`${data.localidade || ""} - ${data.uf || ""}`);
        this.notificationService.show("Endereço encontrado!", "success");

        // Auto Calculate Distance and Freight
        const fullAddress = `${data.logradouro}, ${data.bairro}, ${data.localidade} - ${data.uf}, Brasil`;
        await this.searchAddressForCoordinatesAndCalculateDistance(fullAddress);
      } else {
        this.notificationService.show("CEP não encontrado.", "error");
      }
    } catch (err) {
      this.notificationService.show("Erro ao buscar CEP.", "error");
    } finally {
      this.isSearchingAddress.set(false);
    }
  }

  async searchAddressForCoordinatesAndCalculateDistance(address: string) {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=br&limit=1`,
      );
      const data = await response.json();
      if (data && data.length > 0) {
        const customerLat = parseFloat(data[0].lat);
        const customerLon = parseFloat(data[0].lon);

        const profile = this.settingsState.companyProfile();
        if (profile?.latitude && profile.longitude) {
          const distance = this.calculateDistance(
            profile.latitude,
            profile.longitude,
            customerLat,
            customerLon,
          );
          this.distance.set(parseFloat(distance.toFixed(1)));

          // Assuming R$ 5.00 base + R$ 1.50 per km
          const calculatedFee = 5.0 + 1.5 * this.distance();
          this.deliveryFee.set(parseFloat(calculatedFee.toFixed(2)));

          this.notificationService.show(
            `Distância e Frete calculados: ${this.distance()} km.`,
            "info",
          );
        } else {
          this.notificationService.show(
            `Configure o endereço do restaurante para calcular a distância.`,
            "warning",
          );
        }
      }
    } catch (err) {
      console.error("Geocoding failed", err);
    }
  }

  handleCustomerSelected(customer: Customer) {
    this.selectedCustomer.set(customer);
    this.isCustomerSelectModalOpen.set(false);

    if (customer.address) {
      const address = customer.address;
      const numMatch = address.match(
        /Nº (.*?)(?:, Compl:|, Bairro:|, Cidade:|$)/,
      );
      const compMatch = address.match(/Compl: (.*?)(?:, Bairro:|, Cidade:|$)/);
      const bairroMatch = address.match(/Bairro: (.*?)(?:, Cidade:|$)/);
      const cidadeMatch = address.match(/Cidade: (.*?)(?: \||$)/);

      if (numMatch || compMatch || bairroMatch || cidadeMatch) {
        if (numMatch) this.addressNumber.set(numMatch[1].trim());
        if (compMatch) this.complement.set(compMatch[1].trim());
        if (bairroMatch) this.neighborhood.set(bairroMatch[1].trim());
        if (cidadeMatch) this.city.set(cidadeMatch[1].trim());

        const streetMatch = address.split(/, (?:Nº|Compl:|Bairro:|Cidade:)/)[0];
        this.street.set(streetMatch.trim());
      } else {
        // Fallback
        const parts = address.split(",");
        this.street.set(parts[0]?.trim() || "");
        if (parts.length > 1) {
          const remainder = parts.slice(1).join(",").trim();
          const complementParts = remainder.split(" - ");
          this.addressNumber.set(complementParts[0]?.trim() || "");
          if (complementParts.length > 1) {
            this.complement.set(complementParts.slice(1).join(" - ").trim());
          }
        }
      }
    }

    const profile = this.settingsState.companyProfile();
    if (
      customer.latitude &&
      customer.longitude &&
      profile?.latitude &&
      profile.longitude
    ) {
      const distance = this.calculateDistance(
        profile.latitude,
        profile.longitude,
        customer.latitude,
        customer.longitude,
      );
      this.distance.set(parseFloat(distance.toFixed(1)));
      this.notificationService.show(
        `Distância calculada: ${this.distance()} km.`,
        "info",
      );
    } else {
      this.distance.set(0); // Reset if coords are missing
    }
  }

  removeCustomer() {
    this.selectedCustomer.set(null);
    this.distance.set(0);
    this.street.set("");
    this.addressNumber.set("");
    this.complement.set("");
    this.neighborhood.set("");
    this.city.set("");
  }

  async calculateFreightFromFields() {
    let addressParts = [];
    if (this.street()) {
      addressParts.push(
        `${this.street()}${this.addressNumber() ? ", " + this.addressNumber() : ""}`,
      );
    }
    if (this.neighborhood()) addressParts.push(this.neighborhood());
    if (this.city()) addressParts.push(this.city());

    if (addressParts.length === 0) {
      this.notificationService.show(
        "Preencha os dados do endereço primeiro.",
        "warning",
      );
      return;
    }

    this.isSearchingAddress.set(true);
    const fullAddress = `${addressParts.join(", ")}, Brasil`;
    await this.searchAddressForCoordinatesAndCalculateDistance(fullAddress);
    this.isSearchingAddress.set(false);
  }

  async saveOrder() {
    if (this.cart().length === 0) {
      this.notificationService.show("O carrinho está vazio.", "warning");
      return;
    }
    this.isSaving.set(true);

    let addressParts = [];
    if (this.street()) addressParts.push(`${this.street()}`);
    if (this.addressNumber()) addressParts.push(`Nº ${this.addressNumber()}`);
    if (this.complement()) addressParts.push(`Compl: ${this.complement()}`);
    if (this.neighborhood())
      addressParts.push(`Bairro: ${this.neighborhood()}`);
    if (this.city()) addressParts.push(`Cidade: ${this.city()}`);

    const fullAddress = addressParts.join(", ");
    const finalNotes = `Pagamento: ${this.paymentMethod}${fullAddress ? " | Endereço: " + fullAddress : ""}`;

    const order = this.editingOrder();
    let result;
    if (order) {
      result = await this.deliveryDataService.updateExternalDeliveryOrder(
        order.id,
        this.cart(),
        this.selectedCustomer()?.id || null,
        finalNotes,
        this.distance(),
        this.deliveryFee(),
      );
    } else {
      result = await this.deliveryDataService.createExternalDeliveryOrder(
        this.cart(),
        this.selectedCustomer()?.id || null,
        finalNotes,
        this.distance(),
        this.deliveryFee(),
      );
    }

    this.isSaving.set(false);
    if (result.success) {
      this.notificationService.show(
        this.isEditing()
          ? "Pedido atualizado com sucesso!"
          : "Pedido criado com sucesso!",
        "success",
      );
      this.closeModal.emit();
    } else {
      this.notificationService.show(
        `Erro ao salvar pedido: ${result.error?.message}`,
        "error",
      );
    }
  }
}
