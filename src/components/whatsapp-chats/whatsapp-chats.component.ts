import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  effect,
  computed,
  OnDestroy,
  OnInit,
} from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { UnitContextService } from "../../services/unit-context.service";
import { supabase } from "../../services/supabase-client";
import { RouterLink } from "@angular/router";
import { WhatsappSettingsComponent } from "../settings/whatsapp-settings.component";
import { OrderPanelComponent } from "../pos/order-panel/order-panel.component";
import { Table, Order, Employee } from "../../models/db.models";
import { OperationalAuthService } from "../../services/operational-auth.service";
import { PosStateService } from "../../services/pos-state.service";
import { PosDataService } from "../../services/pos-data.service";
import { v4 as uuidv4 } from "uuid";

@Component({
  selector: "app-whatsapp-chats",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    WhatsappSettingsComponent,
    DatePipe,
    OrderPanelComponent,
  ],
  templateUrl: "./whatsapp-chats.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhatsappChatsComponent implements OnInit, OnDestroy {
  private unitContextService = inject(UnitContextService);
  private operationalAuthService = inject(OperationalAuthService);
  private posState = inject(PosStateService);
  private posDataService = inject(PosDataService);

  isConfigured = signal<boolean | null>(null);
  isConfigModalOpen = signal(false);

  // Quick Order State
  isQuickOrderModalOpen = signal(false);
  quickOrderTable = signal<Table | null>(null);
  activeEmployee = computed(() => this.operationalAuthService.activeEmployee());

  // We compute the current quick order by looking at POS state for QuickSale for this customer
  currentQuickOrder = computed(() => {
    if (!this.customerData()) return null;
    const allOrders = this.posState.orders();
    return (
      allOrders.find(
        (o) =>
          o.order_type === "QuickSale" &&
          o.customer_id === this.customerData()?.id,
      ) ?? null
    );
  });

  chats = signal<any[]>([]);
  selectedChatId = signal<string | null>(null);
  selectedChat = computed(() =>
    this.chats().find((c) => c.id === this.selectedChatId()),
  );

  messages = signal<any[]>([]);

  // CRM Data
  customerData = signal<any>(null);
  customerOrders = signal<any[]>([]);
  isSavingNotes = signal(false);

  // Filters
  chatFilter = signal<"all" | "human" | "bot" | "unread">("all");
  searchQuery = signal("");

  filteredChats = computed(() => {
    let c = this.chats();
    if (this.chatFilter() === "human")
      c = c.filter((x) => x.status === "human");
    if (this.chatFilter() === "bot") c = c.filter((x) => x.status === "bot");

    const q = this.searchQuery().toLowerCase().trim();
    if (q) {
      c = c.filter((x) => x.customer_phone?.toLowerCase().includes(q));
    }
    return c;
  });

  quickReplies = signal([
    {
      title: "Boas Vindas",
      content: "Olá! Sou do restaurante. Como posso ajudar você hoje?",
    },
    {
      title: "Cardápio",
      content: "Acesse nosso cardápio digital completo aqui: https://menu.app",
    },
    {
      title: "Chave Pix",
      content:
        "Nossa chave Pix (CNPJ) é: 00.000.000/0001-00. Envie o comprovante aqui, por favor.",
    },
    {
      title: "Demora",
      content:
        "Pedimos desculpas pela demora. Tivemos um pico de pedidos, mas o seu já está a caminho!",
    },
  ]);
  showQuickReplies = signal(false);

  isTesting = signal(false);
  testMessages = signal<any[]>([
    {
      role: "model",
      text: "Olá! Sou o Assistente IA do restaurante. Como posso ajudar com o seu pedido hoje?",
    },
  ]);
  testInput = signal("");

  async sendTestMessage() {
    const val = this.testInput().trim();
    if (!val) return;

    this.testInput.set("");
    this.testMessages.update((m) => [...m, { role: "user", text: val }]);
    this.scrollToBottomTest();

    const storeId = this.unitContextService.activeUnitId();

    try {
      const res = await fetch("/api/whatsapp/test-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          messageText: val,
          history: this.testMessages().slice(0, -1), // all except the one just sent
        }),
      });

      if (res.ok) {
        const data = await res.json();
        this.testMessages.update((m) => [
          ...m,
          { role: "model", text: data.reply },
        ]);
        this.scrollToBottomTest();
      } else {
        this.testMessages.update((m) => [
          ...m,
          { role: "model", text: "[Erro de Servidor: " + res.statusText + "]" },
        ]);
      }
    } catch (e: any) {
      this.testMessages.update((m) => [
        ...m,
        { role: "model", text: "[Erro de Rede]" },
      ]);
    }
  }

  scrollToBottomTest() {
    setTimeout(() => {
      const el = document.getElementById("test-messages-container");
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }

  startTesting() {
    this.isTesting.set(true);
    if (this.testMessages().length <= 1) {
      this.testMessages.set([
        {
          role: "model",
          text: "Olá! Sou o Assistente IA do restaurante. Como posso ajudar com o seu pedido hoje?",
        },
      ]);
    }
    this.scrollToBottomTest();
  }

  stopTesting() {
    this.isTesting.set(false);
  }
  newMessage = signal("");

  private messageSubscription: any;
  private chatSubscription: any;

  ngOnInit() {
    this.checkConfig();
  }

  ngOnDestroy() {
    if (this.messageSubscription)
      supabase.removeChannel(this.messageSubscription);
    if (this.chatSubscription) supabase.removeChannel(this.chatSubscription);
  }

  async checkConfig() {
    const storeId = this.unitContextService.activeUnitId();
    if (!storeId) return;

    const { data } = await supabase
      .from("whatsapp_configs")
      .select("id, is_active")
      .eq("store_id", storeId)
      .eq("is_active", true)
      .maybeSingle();

    if (data) {
      this.isConfigured.set(true);
      this.loadChats();
      this.setupRealtime();
    } else {
      this.isConfigured.set(false);
    }
  }

  async loadChats() {
    const storeId = this.unitContextService.activeUnitId();
    if (!storeId) return;

    const { data } = await supabase
      .from("whatsapp_chats")
      .select(
        "id, customer_phone, customer_id, status, last_message_at, created_at",
      )
      .eq("store_id", storeId)
      .order("last_message_at", { ascending: false });

    if (data) {
      this.chats.set(data);
    }
  }

  selectChat(chatId: string | null) {
    this.selectedChatId.set(chatId);
    this.showQuickReplies.set(false);
    if (chatId) {
      this.loadMessages(chatId);
      const chat = this.chats().find((c) => c.id === chatId);
      if (chat && chat.customer_id) {
        this.loadCustomerData(chat.customer_id);
      } else {
        this.customerData.set(null);
        this.customerOrders.set([]);
      }
    } else {
      this.customerData.set(null);
      this.customerOrders.set([]);
    }
  }

  async openQuickOrderModal() {
    if (!this.customerData()) return;

    // 1. Check if there's an existing QuickSale order for this customer
    let order = this.currentQuickOrder();

    // 2. If not, create one
    if (!order) {
      const storeId = this.unitContextService.activeUnitId();
      if (!storeId) return;

      const { data: newOrder, error } = await supabase
        .from("orders")
        .insert({
          user_id: storeId,
          table_number: 0,
          command_number: null,
          tab_name: this.customerData().name || "Cliente WhatsApp",
          order_type: "QuickSale",
          status: "OPEN",
          customer_id: this.customerData().id,
        })
        .select()
        .single();

      if (error || !newOrder) {
        console.error("Failed to create quick order", error);
        return;
      }

      // Optimistically update POS state to open panel immediately
      const fullNewOrder = {
        ...newOrder,
        order_items: [],
        customers: this.customerData(),
      };
      this.posState.orders.update((orders) => [...orders, fullNewOrder as any]);
    }

    const fakeTable: Table = {
      id: "tab-quicksale-" + this.customerData().id,
      number: 0,
      hall_id: "tabs",
      status: "OCUPADA",
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      created_at: "",
      user_id: "",
    };
    this.quickOrderTable.set(fakeTable);
    this.isQuickOrderModalOpen.set(true);
  }

  closeQuickOrderModal() {
    this.isQuickOrderModalOpen.set(false);
    this.quickOrderTable.set(null);
  }

  async loadCustomerData(customerId: string) {
    const { data: cust } = await supabase
      .from("customers")
      .select("*")
      .eq("id", customerId)
      .single();
    if (cust) {
      this.customerData.set(cust);
      const { data: orders } = await supabase
        .from("orders")
        .select("id, total_amount, status, created_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(5);
      this.customerOrders.set(orders || []);
    }
  }

  async saveCustomerNotes() {
    const cust = this.customerData();
    if (!cust) return;
    this.isSavingNotes.set(true);
    try {
      await supabase
        .from("customers")
        .update({ notes: cust.notes, name: cust.name })
        .eq("id", cust.id);
    } finally {
      this.isSavingNotes.set(false);
    }
  }

  async loadMessages(chatId: string) {
    const { data } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });

    if (data) {
      this.messages.set(data);
      this.scrollToBottom();
    }
  }

  setupRealtime() {
    const storeId = this.unitContextService.activeUnitId();

    // Very naive realtime for demo purposes
    this.messageSubscription = supabase
      .channel("whatsapp_messages_changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages" },
        (payload) => {
          const msg = payload.new;
          if (msg.chat_id === this.selectedChatId()) {
            this.messages.update((m) => [...m, msg]);
            this.scrollToBottom();
          }
        },
      )
      .subscribe();

    this.chatSubscription = supabase
      .channel("whatsapp_chats_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_chats",
          filter: `store_id=eq.${storeId}`,
        },
        (payload) => {
          this.loadChats(); // Reload chats to update order/status
        },
      )
      .subscribe();
  }

  insertQuickReply(content: string) {
    this.newMessage.set(this.newMessage() + " " + content);
    this.showQuickReplies.set(false);
  }

  async sendMessage() {
    const val = this.newMessage().trim();
    const chatId = this.selectedChatId();
    if (!val || !chatId) return;

    this.newMessage.set("");

    // 1. Optimistic update
    const optMsg = {
      id: Math.random().toString(),
      chat_id: chatId,
      content: val,
      sender_type: "human",
      created_at: new Date().toISOString(),
    };
    this.messages.update((m) => [...m, optMsg]);
    this.scrollToBottom();

    // 2. We use the backend route to send to meta & DB
    try {
      await fetch("/api/whatsapp/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, text: val }),
      });
    } catch (e) {
      console.error(e);
    }
  }

  async toggleHumanControl() {
    const chat = this.selectedChat();
    if (!chat) return;

    const newStatus = chat.status === "human" ? "bot" : "human";
    await supabase
      .from("whatsapp_chats")
      .update({ status: newStatus })
      .eq("id", chat.id);
  }

  scrollToBottom() {
    setTimeout(() => {
      const el = document.getElementById("chat-messages-container");
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }
}
