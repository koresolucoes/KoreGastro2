import { Component, ChangeDetectionStrategy, inject, signal, effect, computed, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UnitContextService } from '../../services/unit-context.service';
import { supabase } from '../../services/supabase-client';
import { RouterLink } from '@angular/router';
import { WhatsappSettingsComponent } from '../settings/whatsapp-settings.component';

@Component({
  selector: 'app-whatsapp-chats',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, WhatsappSettingsComponent, DatePipe],
  templateUrl: './whatsapp-chats.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhatsappChatsComponent implements OnInit, OnDestroy {
  private unitContextService = inject(UnitContextService);

  isConfigured = signal<boolean | null>(null);
  isConfigModalOpen = signal(false);

  chats = signal<any[]>([]);
  selectedChatId = signal<string | null>(null);
  selectedChat = computed(() => this.chats().find(c => c.id === this.selectedChatId()));
  
  messages = signal<any[]>([]);
  
  isTesting = signal(false);
  testMessages = signal<any[]>([{ role: 'model', text: 'Olá! Sou o Assistente IA do restaurante. Como posso ajudar com o seu pedido hoje?' }]);
  testInput = signal('');

  async sendTestMessage() {
     const val = this.testInput().trim();
     if (!val) return;
     
     this.testInput.set('');
     this.testMessages.update(m => [...m, { role: 'user', text: val }]);
     this.scrollToBottomTest();

     const storeId = this.unitContextService.activeUnitId();
     
     try {
       const res = await fetch('/api/whatsapp/test-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId,
            messageText: val,
            history: this.testMessages().slice(0, -1) // all except the one just sent
          })
       });
       
       if (res.ok) {
           const data = await res.json();
           this.testMessages.update(m => [...m, { role: 'model', text: data.reply }]);
           this.scrollToBottomTest();
       } else {
           this.testMessages.update(m => [...m, { role: 'model', text: '[Erro de Servidor: ' + res.statusText + ']' }]);
       }
     } catch (e: any) {
        this.testMessages.update(m => [...m, { role: 'model', text: '[Erro de Rede]' }]);
     }
  }

  scrollToBottomTest() {
      setTimeout(() => {
          const el = document.getElementById('test-messages-container');
          if (el) el.scrollTop = el.scrollHeight;
      }, 50);
  }

  startTesting() {
      this.isTesting.set(true);
      if (this.testMessages().length <= 1) {
          this.testMessages.set([{ role: 'model', text: 'Olá! Sou o Assistente IA do restaurante. Como posso ajudar com o seu pedido hoje?' }]);
      }
      this.scrollToBottomTest();
  }

  stopTesting() {
      this.isTesting.set(false);
  }
  newMessage = signal('');
  
  private messageSubscription: any;
  private chatSubscription: any;

  ngOnInit() {
    this.checkConfig();
  }

  ngOnDestroy() {
    if (this.messageSubscription) supabase.removeChannel(this.messageSubscription);
    if (this.chatSubscription) supabase.removeChannel(this.chatSubscription);
  }

  async checkConfig() {
    const storeId = this.unitContextService.activeUnitId();
    if (!storeId) return;

    const { data } = await supabase
      .from('whatsapp_configs')
      .select('id, is_active')
      .eq('store_id', storeId)
      .eq('is_active', true)
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
      .from('whatsapp_chats')
      .select('id, customer_phone, customer_id, status, last_message_at, created_at')
      .eq('store_id', storeId)
      .order('last_message_at', { ascending: false });

    if (data) {
       this.chats.set(data);
    }
  }

  selectChat(chatId: string | null) {
    this.selectedChatId.set(chatId);
    if (chatId) {
       this.loadMessages(chatId);
    }
  }

  async loadMessages(chatId: string) {
    const { data } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (data) {
      this.messages.set(data);
      this.scrollToBottom();
    }
  }

  setupRealtime() {
     const storeId = this.unitContextService.activeUnitId();
     
     // Very naive realtime for demo purposes
     this.messageSubscription = supabase.channel('whatsapp_messages_changes')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_messages' }, payload => {
            const msg = payload.new;
            if (msg.chat_id === this.selectedChatId()) {
                this.messages.update(m => [...m, msg]);
                this.scrollToBottom();
            }
        }).subscribe();
        
     this.chatSubscription = supabase.channel('whatsapp_chats_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_chats', filter: `store_id=eq.${storeId}` }, payload => {
            this.loadChats(); // Reload chats to update order/status
        }).subscribe();
  }

  async sendMessage() {
     const val = this.newMessage().trim();
     const chatId = this.selectedChatId();
     if (!val || !chatId) return;

     this.newMessage.set('');
     
     // 1. Optimistic update
     const optMsg = {
        id: Math.random().toString(),
        chat_id: chatId,
        content: val,
        sender_type: 'human',
        created_at: new Date().toISOString()
     };
     this.messages.update(m => [...m, optMsg]);
     this.scrollToBottom();

     // 2. We use the backend route to send to meta & DB
     try {
         await fetch('/api/whatsapp/send-message', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ chatId, text: val })
         });
     } catch (e) {
         console.error(e);
     }
  }

  async toggleHumanControl() {
      const chat = this.selectedChat();
      if (!chat) return;

      const newStatus = chat.status === 'human' ? 'active' : 'human';
      await supabase.from('whatsapp_chats').update({ status: newStatus }).eq('id', chat.id);
  }

  scrollToBottom() {
      setTimeout(() => {
          const el = document.getElementById('chat-messages-container');
          if (el) el.scrollTop = el.scrollHeight;
      }, 50);
  }
}
