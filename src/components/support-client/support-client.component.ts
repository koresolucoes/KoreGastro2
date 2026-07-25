
import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../services/notification.service';
import { supabase } from '../../services/supabase-client';

interface FAQ {
  question: string;
  answer: string;
  category: string;
  isOpen?: boolean;
}

@Component({
  selector: 'app-support-client',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
      <div class="h-full flex flex-col bg-app">
        <!-- Header Section -->
        <div class="p-6 md:p-8 bg-surface-elevated border-b border-subtle">
          <div class="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 class="text-2xl md:text-3xl font-black text-title tracking-tight flex items-center gap-3">
                <span translate="no" class="notranslate material-symbols-outlined text-brand text-3xl">help_center</span>
                Central de Ajuda & Suporte
              </h1>
              <p class="text-muted mt-2 text-sm md:text-base font-medium max-w-2xl">
                Encontre respostas rápidas nas nossas perguntas frequentes ou abra um chamado para falar com nossa equipe de especialistas.
              </p>
            </div>
            <button (click)="openNewTicketModal()" class="shrink-0 bg-brand hover:bg-brand-hover text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-lg shadow-brand/20 flex items-center gap-2 active:scale-95 group">
              <span translate="no" class="notranslate material-symbols-outlined text-xl group-hover:rotate-90 transition-transform">add</span>
              Novo Chamado
            </button>
          </div>
        </div>

        <!-- Main Content -->
        <div class="flex-1 overflow-y-auto p-6 md:p-8">
          <div class="max-w-7xl mx-auto">
            
            <div class="grid grid-cols-1 xl:grid-cols-3 gap-8">
              
              <!-- Left Column: Tickets List & Guides -->
              <div class="xl:col-span-1 flex flex-col gap-8">
                
                <!-- My Tickets -->
                <div class="bg-surface-elevated border border-subtle rounded-3xl overflow-hidden shadow-lg flex flex-col h-[500px]">
                  <div class="p-5 border-b border-subtle bg-surface/50 flex items-center justify-between">
                    <h3 class="font-black text-title flex items-center gap-2 tracking-wide uppercase text-sm">
                      <span translate="no" class="notranslate material-symbols-outlined text-brand">forum</span>
                      Meus Chamados
                    </h3>
                    @if(isLoading()) {
                      <div class="w-4 h-4 rounded-full border-2 border-brand border-t-transparent animate-spin"></div>
                    }
                  </div>
                  
                  <div class="flex-1 overflow-y-auto p-4 space-y-3">
                    @for(ticket of tickets(); track ticket.id) {
                      <button 
                        (click)="selectTicket(ticket)"
                        class="w-full text-left p-4 rounded-2xl border transition-all relative overflow-hidden group"
                        [ngClass]="{
                          'bg-brand/10 border-brand/50 shadow-md': selectedTicket()?.id === ticket.id,
                          'bg-surface border-subtle hover:border-strong hover:bg-surface-elevated': selectedTicket()?.id !== ticket.id
                        }"
                      >
                        @if(selectedTicket()?.id === ticket.id) {
                          <div class="absolute left-0 top-0 bottom-0 w-1 bg-brand"></div>
                        }
                        <div class="flex items-start justify-between mb-3">
                          <span class="text-[10px] font-black px-2.5 py-1 rounded-lg border uppercase tracking-widest flex items-center gap-1"
                            [ngClass]="{
                              'bg-success/10 text-success border-success/20': ticket.status === 'open',
                              'bg-warning/10 text-warning border-warning/20': ticket.status === 'in_progress',
                              'bg-muted text-muted/80 border-strong': ticket.status === 'resolved' || ticket.status === 'closed'
                            }">
                            {{ getStatusText(ticket.status) }}
                          </span>
                          <span class="text-[11px] text-muted font-medium">{{ ticket.created_at | date:'dd/MM HH:mm' }}</span>
                        </div>
                        <h4 class="font-bold text-title text-sm line-clamp-2 leading-tight" [class.text-brand]="selectedTicket()?.id === ticket.id">{{ ticket.subject }}</h4>
                      </button>
                    }
                    
                    @if(!isLoading() && tickets().length === 0) {
                      <div class="h-full flex flex-col items-center justify-center text-center p-6 text-muted/60">
                        <span translate="no" class="notranslate material-symbols-outlined text-5xl mb-3">inbox</span>
                        <p class="text-sm font-medium">Você não possui chamados.</p>
                      </div>
                    }
                  </div>
                </div>

                <!-- Quick Guides -->
                <div class="bg-surface-elevated border border-subtle rounded-3xl overflow-hidden shadow-lg p-5">
                  <h3 class="font-black text-title flex items-center gap-2 tracking-wide uppercase text-sm mb-4">
                    <span translate="no" class="notranslate material-symbols-outlined text-brand">menu_book</span>
                    Guias Rápidos
                  </h3>
                  <div class="space-y-2">
                    <a href="#/tutorials" class="flex items-center gap-3 p-3 rounded-xl hover:bg-surface transition-colors text-body group border border-transparent hover:border-subtle">
                      <div class="w-8 h-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center group-hover:scale-110 transition-transform">
                        <span translate="no" class="notranslate material-symbols-outlined text-sm">receipt_long</span>
                      </div>
                      <span class="text-sm font-semibold">Como emitir notas fiscais</span>
                    </a>
                    <a href="#/tutorials" class="flex items-center gap-3 p-3 rounded-xl hover:bg-surface transition-colors text-body group border border-transparent hover:border-subtle">
                      <div class="w-8 h-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center group-hover:scale-110 transition-transform">
                        <span translate="no" class="notranslate material-symbols-outlined text-sm">inventory_2</span>
                      </div>
                      <span class="text-sm font-semibold">Gestão de estoque e fichas</span>
                    </a>
                    <a href="#/tutorials" class="flex items-center gap-3 p-3 rounded-xl hover:bg-surface transition-colors text-body group border border-transparent hover:border-subtle">
                      <div class="w-8 h-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center group-hover:scale-110 transition-transform">
                        <span translate="no" class="notranslate material-symbols-outlined text-sm">point_of_sale</span>
                      </div>
                      <span class="text-sm font-semibold">Fechamento de caixa</span>
                    </a>
                  </div>
                </div>

              </div>

              <!-- Right Column: Active Ticket / FAQs -->
              <div class="xl:col-span-2 flex flex-col gap-8">
                
                @if(selectedTicket()) {
                  <!-- Active Ticket View -->
                  <div class="bg-surface-elevated border border-subtle rounded-3xl overflow-hidden shadow-lg h-[800px] xl:h-[calc(100vh-16rem)] min-h-[500px] flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <!-- Chat Header -->
                    <div class="p-5 md:p-6 border-b border-subtle bg-surface/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div class="flex items-center gap-3 mb-2">
                          <span class="text-xs font-black text-muted uppercase tracking-widest">Chamado #{{ selectedTicket()?.id?.substring(0,8) }}</span>
                          <span class="w-1.5 h-1.5 rounded-full bg-subtle"></span>
                          <span class="text-xs font-black uppercase tracking-widest" [ngClass]="selectedTicket()?.priority === 'Alta' || selectedTicket()?.priority === 'Urgente' ? 'text-danger' : 'text-brand'">{{ selectedTicket()?.priority }}</span>
                        </div>
                        <h3 class="font-black text-title text-lg leading-tight">{{ selectedTicket()?.subject }}</h3>
                      </div>
                      <div class="flex items-center gap-3 shrink-0">
                        @if(selectedTicket()?.status !== 'resolved' && selectedTicket()?.status !== 'closed') {
                          <button (click)="markAsResolved(selectedTicket()?.id)" class="text-xs bg-success hover:bg-success/90 text-white px-4 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-success/20 active:scale-95 flex items-center gap-2">
                            <span translate="no" class="notranslate material-symbols-outlined text-[16px]">check_circle</span>
                            Marcar Resolvido
                          </button>
                        }
                      </div>
                    </div>
                    
                    <!-- Messages Area -->
                    <div class="flex-1 overflow-y-auto p-6 space-y-6 bg-app/50 relative">
                      @for(msg of selectedTicket()?.messages; track $index) {
                        <div class="flex flex-col max-w-[85%] md:max-w-[75%]" [ngClass]="msg.sender === 'client' ? 'ml-auto items-end' : 'mr-auto items-start'">
                          <div class="flex items-center gap-2 mb-1.5 px-1">
                            @if(msg.sender === 'admin') {
                              <span class="text-[10px] font-black text-brand bg-brand/10 px-2.5 py-1 rounded-lg uppercase tracking-widest flex items-center gap-1">
                                <span translate="no" class="notranslate material-symbols-outlined text-[12px]">support_agent</span>
                                Suporte ChefOS
                              </span>
                            } @else {
                              <span class="text-[10px] font-black text-muted uppercase tracking-widest">Você</span>
                            }
                            <span class="text-[10px] text-muted font-medium">{{ msg.time || (msg.created_at | date:'HH:mm') }}</span>
                          </div>
                          <div class="px-5 py-3.5 rounded-2xl shadow-sm text-sm leading-relaxed"
                            [ngClass]="msg.sender === 'client' ? 'bg-brand text-white rounded-tr-sm shadow-brand/20' : 'bg-surface-elevated text-body border border-subtle rounded-tl-sm'">
                            {{ msg.text }}
                          </div>
                        </div>
                      }
                      @if(selectedTicket()?.messages?.length === 0) {
                         <div class="absolute inset-0 flex items-center justify-center text-muted/50 font-medium">
                            Nenhuma mensagem neste chamado.
                         </div>
                      }
                    </div>

                    <!-- Input Area -->
                    @if(selectedTicket()?.status !== 'resolved' && selectedTicket()?.status !== 'closed') {
                      <div class="p-5 bg-surface-elevated border-t border-subtle">
                        <div class="flex gap-3 relative">
                          <textarea 
                            [(ngModel)]="replyText" 
                            rows="2" 
                            class="flex-1 bg-surface border border-strong text-body rounded-2xl px-5 py-3.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand resize-none outline-none transition-all placeholder:text-muted/60"
                            placeholder="Digite sua resposta..."
                            (keydown.enter)="sendReply($event)"
                          ></textarea>
                          <button 
                            (click)="sendReply()"
                            [disabled]="!replyText.trim() || isSending()"
                            class="bg-brand hover:bg-brand-hover disabled:opacity-50 text-white px-6 rounded-2xl font-bold transition-all shadow-lg flex items-center justify-center shrink-0 active:scale-95"
                          >
                            @if(isSending()) {
                              <div class="w-6 h-6 rounded-full border-2 border-white border-t-transparent animate-spin"></div>
                            } @else {
                              <span translate="no" class="notranslate material-symbols-outlined">send</span>
                            }
                          </button>
                        </div>
                      </div>
                    } @else {
                      <div class="p-5 bg-surface border-t border-subtle text-center flex flex-col items-center justify-center gap-2">
                        <span translate="no" class="notranslate material-symbols-outlined text-muted text-2xl">lock</span>
                        <p class="text-muted text-sm font-medium">Este chamado foi encerrado. Caso precise de mais ajuda, abra um novo chamado.</p>
                      </div>
                    }
                  </div>
                } @else {
                  <!-- FAQs Area (Shown when no ticket is selected) -->
                  <div class="bg-surface-elevated border border-subtle rounded-3xl overflow-hidden shadow-lg p-6 md:p-8 animate-in fade-in duration-300">
                    <div class="flex items-center gap-4 mb-8">
                      <div class="w-12 h-12 rounded-2xl bg-brand/10 text-brand flex items-center justify-center">
                        <span translate="no" class="notranslate material-symbols-outlined text-2xl">lightbulb</span>
                      </div>
                      <div>
                        <h2 class="text-xl font-black text-title">Perguntas Frequentes</h2>
                        <p class="text-muted text-sm mt-1">Antes de abrir um chamado, verifique se sua dúvida já está respondida abaixo.</p>
                      </div>
                    </div>

                    <div class="space-y-4">
                      @for(faq of faqs; track faq.question; let i = $index) {
                        <div class="border border-subtle rounded-2xl overflow-hidden bg-surface transition-all" [class.border-brand]="faq.isOpen">
                          <button 
                            (click)="toggleFaq(i)"
                            class="w-full text-left p-5 flex items-center justify-between hover:bg-surface-elevated transition-colors"
                          >
                            <span class="font-bold text-title text-sm pr-4">{{ faq.question }}</span>
                            <span translate="no" class="notranslate material-symbols-outlined text-brand transition-transform duration-300" [class.rotate-180]="faq.isOpen">expand_more</span>
                          </button>
                          
                          <div 
                            class="overflow-hidden transition-all duration-300"
                            [style.maxHeight]="faq.isOpen ? '500px' : '0px'"
                            [style.opacity]="faq.isOpen ? '1' : '0'"
                          >
                            <div class="p-5 pt-0 text-sm text-body leading-relaxed border-t border-subtle/50 mt-2">
                              {{ faq.answer }}
                            </div>
                          </div>
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>

            </div>
          </div>
        </div>
      </div>

    <!-- New Ticket Modal -->
    @if(showNewTicketModal()) {
      <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
        <div class="absolute inset-0 bg-background/80 backdrop-blur-sm" (click)="showNewTicketModal.set(false)"></div>
        <div class="relative w-full max-w-lg bg-surface-elevated border border-subtle rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
          <div class="p-5 sm:p-6 border-b border-subtle bg-surface/50 flex items-center justify-between">
            <h2 class="text-lg font-black text-title tracking-tight flex items-center gap-2">
              <span translate="no" class="notranslate material-symbols-outlined text-brand">add_circle</span>
              Novo Chamado
            </h2>
            <button (click)="showNewTicketModal.set(false)" class="w-10 h-10 rounded-full bg-surface border border-strong flex items-center justify-center text-muted hover:text-title hover:bg-surface-elevated transition-all active:scale-95">
              <span translate="no" class="notranslate material-symbols-outlined">close</span>
            </button>
          </div>
          
          <div class="p-6 space-y-5 bg-app/30">
            <!-- Info Alert -->
            <div class="bg-brand/10 border border-brand/20 p-4 rounded-2xl flex gap-3 text-sm text-title">
              <span translate="no" class="notranslate material-symbols-outlined shrink-0 text-brand">info</span>
              <p>Nossa equipe atende de <strong>Segunda a Sexta, das 09h às 18h</strong>. Chamados abertos fora deste horário serão respondidos no próximo dia útil.</p>
            </div>

            <div>
              <label class="block text-[10px] font-black text-muted mb-2 uppercase tracking-[0.15em]">Assunto Principal</label>
              <input type="text" [(ngModel)]="newTicketData.subject" class="w-full bg-surface border border-strong text-title rounded-xl px-4 py-3 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all placeholder:text-muted/50" placeholder="Ex: Problema com emissão de nota, Dúvida no caixa">
            </div>
            
            <div>
              <label class="block text-[10px] font-black text-muted mb-2 uppercase tracking-[0.15em]">Prioridade</label>
              <div class="relative">
                <select [(ngModel)]="newTicketData.priority" class="w-full bg-surface border border-strong text-title rounded-xl px-4 py-3 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all appearance-none cursor-pointer">
                  <option value="Baixa">Baixa - Dúvida geral, sugestão</option>
                  <option value="Média">Média - Erro que não impacta vendas</option>
                  <option value="Alta">Alta - Impacta vendas / Operação parada</option>
                </select>
                <span translate="no" class="notranslate material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none">expand_more</span>
              </div>
            </div>

            <div>
              <label class="block text-[10px] font-black text-muted mb-2 uppercase tracking-[0.15em]">Mensagem Detalhada</label>
              <textarea [(ngModel)]="newTicketData.message" rows="4" class="w-full bg-surface border border-strong text-title rounded-xl px-4 py-3 text-sm focus:border-brand focus:ring-1 focus:ring-brand resize-none outline-none transition-all placeholder:text-muted/50" placeholder="Descreva seu problema com o máximo de detalhes possível..."></textarea>
            </div>
          </div>
          
          <div class="p-5 sm:p-6 border-t border-subtle bg-surface/80 flex justify-end gap-3 backdrop-blur-xl">
            <button (click)="showNewTicketModal.set(false)" class="px-5 py-2.5 text-muted hover:text-title font-bold transition-colors rounded-xl hover:bg-surface">
              Cancelar
            </button>
            <button 
              (click)="createNewTicket()" 
              [disabled]="!newTicketData.subject || !newTicketData.message || isSending()"
              class="bg-brand hover:bg-brand-hover disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg active:scale-95 flex items-center gap-2">
              @if(isSending()) {
                <div class="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin"></div>
                Enviando...
              } @else {
                <span translate="no" class="notranslate material-symbols-outlined text-[18px]">send</span>
                Enviar Chamado
              }
            </button>
          </div>
        </div>
      </div>
    }
  `
})
export class SupportClientComponent implements OnInit {
  notificationService = inject(NotificationService);
  
  tickets = signal<any[]>([]);
  selectedTicket = signal<any>(null);
  isLoading = signal(true);
  isSending = signal(false);
  
  replyText = '';
  showNewTicketModal = signal(false);
  newTicketData = {
    subject: '',
    priority: 'Média',
    message: ''
  };

  faqs: FAQ[] = [
    {
      question: 'Como faço para configurar o iFood?',
      answer: 'Para configurar o iFood, vá até "Cardápio iFood" no menu de navegação lateral. Lá você encontrará as opções para vincular sua loja inserindo o Client ID e Client Secret fornecidos pelo portal do parceiro iFood.',
      category: 'Integrações'
    },
    {
      question: 'Por que minhas notas fiscais não estão sendo emitidas?',
      answer: 'Verifique se o seu certificado digital A1 está dentro da validade e corretamente configurado em Configurações > Fiscal. Certifique-se também de que os NCMs dos seus produtos estão preenchidos corretamente.',
      category: 'Fiscal'
    },
    {
      question: 'Como realizo a abertura e fechamento de caixa?',
      answer: 'Acesse o menu "Caixa". Se o caixa estiver fechado, você verá a opção "Abrir Caixa", onde pode informar o fundo de troco. Para fechar, basta clicar em "Fechar Caixa" e realizar a conferência dos valores lançados.',
      category: 'Operação'
    },
    {
      question: 'Posso usar o sistema sem internet (Offline)?',
      answer: 'O ChefOS é projetado para rodar na nuvem, garantindo segurança e backup em tempo real. No momento, é necessária uma conexão ativa com a internet para lançar pedidos e gerenciar o PDV.',
      category: 'Geral'
    },
    {
      question: 'Como faço o controle de estoque dos insumos?',
      answer: 'Acesse "Estoque" no menu e cadastre seus insumos. Em seguida, vá em "Fichas Técnicas" e vincule os insumos aos produtos vendidos. Assim, toda vez que um produto for vendido, o sistema descontará automaticamente do estoque os insumos correspondentes.',
      category: 'Estoque'
    }
  ];

  async ngOnInit() {
    await this.loadTickets();
  }

  toggleFaq(index: number) {
    this.faqs[index].isOpen = !this.faqs[index].isOpen;
  }

  async loadTickets() {
    try {
      this.isLoading.set(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*, messages:support_ticket_messages(*)')
        .eq('client_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) {
          if (error.code !== '42P01') {
             console.error('Error fetching tickets:', error);
          }
          this.tickets.set([]);
      } else {
        const formattedData = data.map(t => ({
            ...t,
            messages: (t.messages || []).map((m: any) => ({
               sender: m.sender_type,
               text: m.text,
               time: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            })).sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        }));
        
        this.tickets.set(formattedData);
        
        // Update selected ticket if exists
        const currentSelected = this.selectedTicket();
        if (currentSelected) {
          const updated = formattedData.find((t: any) => t.id === currentSelected.id);
          if (updated) {
            this.selectedTicket.set(updated);
          } else {
            this.selectedTicket.set(null);
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  selectTicket(ticket: any) {
    // Toggle selection
    if (this.selectedTicket()?.id === ticket.id) {
      this.selectedTicket.set(null);
    } else {
      this.selectedTicket.set(ticket);
    }
  }

  getStatusText(status: string) {
    const map: Record<string, string> = {
      'open': 'Aberto',
      'in_progress': 'Em Andamento',
      'resolved': 'Resolvido',
      'closed': 'Fechado'
    };
    return map[status] || status;
  }

  openNewTicketModal() {
    this.newTicketData = { subject: '', priority: 'Média', message: '' };
    this.showNewTicketModal.set(true);
  }

  async createNewTicket() {
    if (!this.newTicketData.subject || !this.newTicketData.message) return;
    
    try {
      this.isSending.set(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', session.user.id).single();
      const storeName = profile?.full_name || 'Cliente';

      // Insert Ticket
      const { data: ticket, error: ticketError } = await supabase
        .from('support_tickets')
        .insert([{
          client_id: session.user.id,
          store_name: storeName,
          subject: this.newTicketData.subject,
          priority: this.newTicketData.priority,
          status: 'open'
        }])
        .select()
        .single();

      if (ticketError) throw ticketError;

      // Insert Initial Message
      const { error: msgError } = await supabase
        .from('support_ticket_messages')
        .insert([{
          ticket_id: ticket.id,
          sender_id: session.user.id,
          sender_type: 'client',
          text: this.newTicketData.message
        }]);

      if (msgError) throw msgError;

      this.notificationService.show('Chamado criado com sucesso!', 'success');
      this.showNewTicketModal.set(false);
      await this.loadTickets();
      
      const newTicket = this.tickets().find(t => t.id === ticket.id);
      if (newTicket) {
        this.selectedTicket.set(newTicket);
      }

    } catch (error: any) {
      console.error('Error creating ticket:', error);
      
      // Better error message for RLS
      if (error.message && error.message.includes('row-level security')) {
         this.notificationService.alert('O seu banco de dados precisa que as políticas de segurança (RLS) sejam configuradas para criar chamados. Acesse o painel do Supabase e rode o script SQL.', 'Aviso de Segurança');
      } else {
         this.notificationService.alert('Erro ao criar chamado: ' + (error.message || 'Erro desconhecido'));
      }
    } finally {
      this.isSending.set(false);
    }
  }

  async sendReply(event?: Event) {
    if (event) {
        event.preventDefault();
    }
    
    if (!this.replyText.trim() || !this.selectedTicket() || this.isSending()) return;
    
    try {
      this.isSending.set(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const ticketId = this.selectedTicket().id;

      const { error } = await supabase
        .from('support_ticket_messages')
        .insert([{
          ticket_id: ticketId,
          sender_id: session.user.id,
          sender_type: 'client',
          text: this.replyText.trim()
        }]);

      if (error) throw error;
      
      // Update ticket status to open if it was resolved
      if (this.selectedTicket().status === 'resolved' || this.selectedTicket().status === 'closed') {
           // This might fail if the user hasn't updated the DB policies yet to allow client UPDATE.
           // We'll wrap it so it doesn't break the message sending.
           try {
             await supabase.from('support_tickets').update({ status: 'open' }).eq('id', ticketId);
           } catch(e) {
             console.warn('Could not reopen ticket status due to RLS, but message was sent.');
           }
      }

      this.replyText = '';
      await this.loadTickets();

    } catch (error: any) {
      console.error('Error sending reply:', error);
      this.notificationService.alert('Erro ao enviar mensagem.');
    } finally {
      this.isSending.set(false);
    }
  }
  
  async markAsResolved(ticketId: string) {
      if(!confirm('Tem certeza que deseja marcar este chamado como resolvido?')) return;
      try {
          const { error } = await supabase
            .from('support_tickets')
            .update({ status: 'resolved' })
            .eq('id', ticketId);
            
          if(error) throw error;
          
          this.notificationService.show('Chamado resolvido!', 'success');
          await this.loadTickets();
      } catch (error: any) {
          console.error(error);
          if (error.message && error.message.includes('row-level security')) {
             this.notificationService.alert('O banco de dados precisa ser atualizado com as políticas corretas no Supabase.', 'Erro de Permissão (RLS)');
          } else {
             this.notificationService.alert('Erro ao atualizar status.');
          }
      }
  }
}
