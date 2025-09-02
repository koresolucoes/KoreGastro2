import { Component, ChangeDetectionStrategy, inject, signal, computed, WritableSignal, effect, untracked, input, output, InputSignal, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../../services/supabase.service';
import { Table, Order, Recipe, Category, OrderItemStatus, OrderItem } from '../../../models/db.models';
import { GoogleGenAI, Type } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';

interface CartItem {
    id: string;
    recipe: Recipe;
    quantity: number;
    notes: string;
}

interface GroupedOrderItem {
  isGroup: true;
  groupId: string;
  recipeName: string;
  recipeId: string;
  quantity: number;
  totalPrice: number;
  items: OrderItem[];
}

interface SingleOrderItem {
  isGroup: false;
  item: OrderItem;
}

type DisplayOrderItem = GroupedOrderItem | SingleOrderItem;

// IMPORTANT: To enable the AI feature, paste your Gemini API Key here.
// Note: For production environments, it is strongly recommended to handle API keys
// on a secure backend server instead of exposing them in the client-side code.
const GEMINI_API_KEY = 'AIzaSyA05tQSdiJt1HHWT8o5jSxfuNixh7i_6UQ'; // <-- PASTE YOUR GEMINI API KEY HERE

@Component({
  selector: 'app-order-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './order-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderPanelComponent {
  dataService = inject(SupabaseService);

  // Inputs & Outputs
  selectedTable: InputSignal<Table | null> = input.required<Table | null>();
  currentOrder: InputSignal<Order | null> = input.required<Order | null>();
  orderError: InputSignal<string | null> = input.required<string | null>();

  closePanel: OutputEmitterRef<void> = output<void>();
  checkoutStarted: OutputEmitterRef<void> = output<void>();
  moveOrderClicked: OutputEmitterRef<void> = output<void>();

  // Component State
  shoppingCart = signal<CartItem[]>([]);
  categories = this.dataService.categories;
  recipes = this.dataService.recipes;
  selectedCategory: WritableSignal<Category | null> = signal(null);
  recipeSearchTerm = signal('');

  // Notes Modal Signals
  isNotesModalOpen = signal(false);
  editingCartItemId = signal<string | null>(null);
  noteInput = signal('');

  // AI Upselling Signals
  private ai: GoogleGenAI | null = null;
  upsellSuggestions = signal<Recipe[]>([]);
  isGeneratingSuggestions = signal(false);

  criticalKeywords = ['alergia', 'sem glúten', 'sem lactose', 'celíaco', 'nozes', 'amendoim', 'vegetariano', 'vegano'];

  constructor() {
    if (GEMINI_API_KEY) {
        this.ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    } else {
        console.warn('Gemini API key not found. Upselling feature will be disabled.');
    }

    // Reset cart when table changes
    effect(() => {
        const table = this.selectedTable();
        untracked(() => this.shoppingCart.set([]));
    });

    // Generate suggestions when cart changes
    effect(() => {
      const cart = this.shoppingCart();
      const table = this.selectedTable(); // react to table change
      if (cart.length > 0) {
        untracked(() => this.generateUpsellSuggestions());
      } else {
        this.upsellSuggestions.set([]);
      }
    });
  }

  isItemCritical(item: OrderItem): boolean {
    const note = item.notes?.toLowerCase() ?? '';
    if (!note) return false;
    return this.criticalKeywords.some(keyword => note.includes(keyword));
  }
  
  isAttentionAcknowledged(item: OrderItem): boolean {
    return !!item.status_timestamps?.['ATTENTION_ACKNOWLEDGED'];
  }

  filteredRecipes = computed(() => {
      const category = this.selectedCategory();
      const term = this.recipeSearchTerm().toLowerCase();
      let recipesToShow = this.recipes();

      if (category) {
          recipesToShow = recipesToShow.filter(r => r.category_id === category.id);
      }
      
      if (term) {
          recipesToShow = recipesToShow.filter(r => r.name.toLowerCase().includes(term));
      }

      return recipesToShow;
  });
  
  groupedOrderItems = computed(() => {
    const order = this.currentOrder();
    if (!order) return [];

    const items = order.order_items;
    const grouped = new Map<string, GroupedOrderItem>();
    const singles: SingleOrderItem[] = [];
    const recipesMap = this.dataService.recipesById();

    for (const item of items) {
      if (item.group_id) {
        if (!grouped.has(item.group_id)) {
          const recipe = recipesMap.get(item.recipe_id);
          grouped.set(item.group_id, {
            isGroup: true,
            groupId: item.group_id,
            recipeName: recipe?.name ?? 'Prato Desconhecido',
            recipeId: item.recipe_id,
            quantity: item.quantity,
            totalPrice: recipe?.price ?? 0,
            items: [],
          });
        }
        grouped.get(item.group_id)!.items.push(item);
      } else {
        singles.push({ isGroup: false, item });
      }
    }
    return [...Array.from(grouped.values()), ...singles];
  });
  
  orderTotal = computed(() => {
    const currentItemsTotal = this.currentOrder()?.order_items.reduce((sum, item) => sum + (item.price * item.quantity), 0) ?? 0;
    const cartItemsTotal = this.shoppingCart().reduce((sum, item) => sum + (item.recipe.price * item.quantity), 0);
    return currentItemsTotal + cartItemsTotal;
  });

  selectCategory(category: Category | null) { this.selectedCategory.set(category); }
  
  addToCart(recipe: Recipe) {
    const newItem: CartItem = {
      id: uuidv4(),
      recipe,
      quantity: 1,
      notes: ''
    };
    this.shoppingCart.update(cart => [...cart, newItem]);
  }

  updateCartItemQuantity(itemId: string, change: -1 | 1) {
    this.shoppingCart.update(cart => 
        cart.map(item => 
            item.id === itemId 
            ? { ...item, quantity: Math.max(0, item.quantity + change) }
            : item
        ).filter(item => item.quantity > 0)
    );
  }

  removeFromCart(itemId: string) {
      this.shoppingCart.update(cart => cart.filter(i => i.id !== itemId));
  }

  openNotesModal(cartItem: CartItem) {
    this.editingCartItemId.set(cartItem.id);
    this.noteInput.set(cartItem.notes);
    this.isNotesModalOpen.set(true);
  }

  closeNotesModal() {
    this.isNotesModalOpen.set(false);
    this.editingCartItemId.set(null);
    this.noteInput.set('');
  }

  saveNote() {
    const itemId = this.editingCartItemId();
    if (!itemId) return;
    
    const newNote = this.noteInput().trim();
    this.shoppingCart.update(cart => 
        cart.map(item => item.id === itemId ? { ...item, notes: newNote } : item)
    );
    this.closeNotesModal();
  }

  async sendOrder() {
    const order = this.currentOrder(), cart = this.shoppingCart();
    if (order && cart.length > 0) {
      const result = await this.dataService.addItemsToOrder(order.id, cart);
      if (result.success) { this.shoppingCart.set([]); } else {
        alert(`Falha ao enviar itens. Erro: ${result.error?.message}`);
      }
    }
  }

  async generateUpsellSuggestions() {
    if (!this.ai) return;

    this.isGeneratingSuggestions.set(true);
    this.upsellSuggestions.set([]);

    try {
        const cartItems = this.shoppingCart().map(item => `${item.quantity}x ${item.recipe.name}`).join(', ');
        const currentCartIds = new Set(this.shoppingCart().map(item => item.recipe.id));

        const menu = this.recipes()
            .filter(r => r.is_available && r.hasStock && !currentCartIds.has(r.id))
            .map(r => `- ${r.name} (ID: ${r.id})`)
            .join('\n');

        const prompt = `Você é um sommelier e vendedor especialista em um restaurante.
            Um cliente pediu os seguintes itens: ${cartItems}.
            Com base no pedido atual e no cardápio abaixo, sugira 3 a 4 itens complementares (bebidas, acompanhamentos, sobremesas) para aumentar o valor da venda (upsell/cross-sell).
            Não sugira itens que já estão no carrinho.
            Cardápio disponível:
            ${menu}
            Retorne APENAS um objeto JSON com uma chave "suggestions", que é um array de objetos. Cada objeto deve ter apenas uma chave "recipe_id" contendo o ID exato do prato sugerido do cardápio.`;

        const responseSchema = {
            type: Type.OBJECT,
            properties: {
                suggestions: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: { recipe_id: { type: Type.STRING } }
                    }
                }
            }
        };

        const response = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: responseSchema,
            }
        });

        const jsonResponse = JSON.parse(response.text);
        const suggestedIds: string[] = jsonResponse.suggestions.map((s: any) => s.recipe_id);
        
        const recipesMap = this.dataService.recipesById();
        const suggestions = suggestedIds
            .map(id => recipesMap.get(id))
            .filter((r): r is Recipe => r !== undefined);

        this.upsellSuggestions.set(suggestions);

    } catch (error) {
        console.error('Error generating upsell suggestions:', error);
        this.upsellSuggestions.set([]);
    } finally {
        this.isGeneratingSuggestions.set(false);
    }
  }

  startCheckout() {
    if (this.shoppingCart().length > 0) {
        alert('Você tem itens no carrinho. Por favor, envie o pedido antes de fechar a conta.');
        return;
    }
    this.checkoutStarted.emit();
  }

  getOrderItemStatusClass(status: OrderItemStatus): string {
    switch (status) {
      case 'PENDENTE': return 'text-yellow-400';
      case 'EM_PREPARO': return 'text-blue-400';
      case 'PRONTO': return 'text-green-400 font-bold';
      case 'AGUARDANDO': return 'text-gray-400';
      default: return 'text-gray-500';
    }
  }

}
