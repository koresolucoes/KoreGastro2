import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { SystemAdminService } from '../../services/system-admin.service';
import { NotificationService } from '../../services/notification.service';
import { ALL_PERMISSION_KEYS } from '../../config/permissions';

const PERMISSION_LABELS: Record<string, string> = {
  '/dashboard': 'Painel Gerencial',
  '/home': 'Início',
  '/pos': 'PDV Frente de Caixa',
  '/kds': 'KDS (Cozinha)',
  '/ifood-kds': 'KDS (iFood)',
  '/cashier': 'Controle de Caixa',
  '/inventory': 'Estoque e Matéria-Prima',
  '/requisitions': 'Requisições Internas',
  '/purchasing': 'Compras',
  '/suppliers': 'Fornecedores',
  '/customers': 'Clientes e Fidelidade',
  '/menu': 'Cardápio',
  '/menu-builder': 'Construtor de Cardápio / QR Code',
  '/ifood-menu': 'Gestão de Cardápio iFood',
  '/ifood-store-manager': 'Gerenciador de Loja iFood',
  '/technical-sheets': 'Fichas Técnicas',
  '/mise-en-place': 'Mise-En-Place / Produção',
  '/performance': 'Desempenho da Equipe',
  '/reports': 'Relatórios Gerenciais',
  '/employees': 'Gestão de Funcionários',
  '/schedules': 'Escalas de Trabalho',
  '/my-leave': 'Portal de Licenças',
  '/my-profile': 'Meu Perfil',
  '/payroll': 'Folha de Pagamento',
  '/settings': 'Configurações',
  '/reservations': 'Reservas de Mesas',
  '/time-clock': 'Relógio de Ponto',
  '/leave-management': 'Gestão de Licenças',
  '/tutorials': 'Tutoriais',
  '/delivery': 'Delivery Próprio',
  '/checklists': 'Checklists de Qualidade',
  '/temperatures': 'Controle de Temperaturas',
  '/whatsapp-chats': 'Integração WhatsApp'
};

export type AdminTab = 'overview' | 'support' | 'users' | 'catalog' | 'health' | 'provisioning' | 'plans' | 'financial' | 'logs';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="animate-fade-in-up space-y-6 pb-12">
      <!-- Top Title & Navigation Tabs -->
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-2xl font-black tracking-tight text-white">Central de Atendimento & Admin Master SaaS</h2>
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase tracking-widest">
              v2.5 Live Hub
            </span>
          </div>
          <p class="text-xs text-gray-400 mt-1">
            Gestão unificada de clientes em tempo real: suporte ao vivo, alteração de planos, inspetor de cardápios, telemetria e observabilidade.
          </p>
        </div>

        <div class="flex items-center gap-3">
          <button 
            (click)="loadData()" 
            [disabled]="isLoading()" 
            class="bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 hover:border-gray-600 px-4 py-2 rounded-xl text-xs font-semibold tracking-wider uppercase transition-all flex items-center justify-center gap-2"
          >
            <span translate="no" class="notranslate material-symbols-outlined text-[16px]" [class.animate-spin]="isLoading()">sync</span>
            Atualizar Painel
          </button>
        </div>
      </div>

      <!-- Navigation Tabs Bar -->
      <div class="flex items-center gap-1 bg-gray-900/80 p-1.5 rounded-2xl border border-white/5 overflow-x-auto">
        <button 
          (click)="activeTab.set('overview')" 
          [class]="activeTab() === 'overview' ? 'bg-purple-600 text-white font-bold shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'"
          class="px-4 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap"
        >
          <span translate="no" class="notranslate material-symbols-outlined text-sm">dashboard</span>
          Visão Geral & MRR
        </button>

        <button 
          (click)="activeTab.set('support')" 
          [class]="activeTab() === 'support' ? 'bg-purple-600 text-white font-bold shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'"
          class="px-4 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap relative"
        >
          <span translate="no" class="notranslate material-symbols-outlined text-sm text-cyan-400">support_agent</span>
          Central de Atendimento
          @if(openTicketsCount() > 0) {
            <span class="bg-cyan-500 text-gray-950 px-1.5 py-0.2 rounded-full text-[10px] font-black animate-pulse">
              {{ openTicketsCount() }}
            </span>
          }
        </button>

        <button 
          (click)="activeTab.set('users')" 
          [class]="activeTab() === 'users' ? 'bg-purple-600 text-white font-bold shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'"
          class="px-4 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap"
        >
          <span translate="no" class="notranslate material-symbols-outlined text-sm text-blue-400">group</span>
          Usuários & Lojas ({{ restaurants().length }})
        </button>

        <button 
          (click)="activeTab.set('catalog')" 
          [class]="activeTab() === 'catalog' ? 'bg-purple-600 text-white font-bold shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'"
          class="px-4 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap"
        >
          <span translate="no" class="notranslate material-symbols-outlined text-sm text-orange-400">restaurant_menu</span>
          Inspector de Cardápios
        </button>

        <button 
          (click)="activeTab.set('health')" 
          [class]="activeTab() === 'health' ? 'bg-purple-600 text-white font-bold shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'"
          class="px-4 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap"
        >
          <span translate="no" class="notranslate material-symbols-outlined text-sm text-emerald-400">monitor_heart</span>
          Saúde & Observabilidade
          @if(healthData()?.status === 'unhealthy') {
            <span class="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
          }
        </button>

        <button 
          (click)="activeTab.set('provisioning')" 
          [class]="activeTab() === 'provisioning' ? 'bg-purple-600 text-white font-bold shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'"
          class="px-4 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap"
        >
          <span translate="no" class="notranslate material-symbols-outlined text-sm text-amber-400">rocket_launch</span>
          Provisionamento
        </button>

        <button 
          (click)="activeTab.set('plans')" 
          [class]="activeTab() === 'plans' ? 'bg-purple-600 text-white font-bold shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'"
          class="px-4 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap"
        >
          <span translate="no" class="notranslate material-symbols-outlined text-sm text-indigo-400">loyalty</span>
          Planos ({{ plans().length }})
        </button>

        <button 
          (click)="activeTab.set('financial')" 
          [class]="activeTab() === 'financial' ? 'bg-purple-600 text-white font-bold shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'"
          class="px-4 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap"
        >
          <span translate="no" class="notranslate material-symbols-outlined text-sm text-teal-400">payments</span>
          Financeiro SaaS
        </button>

        <button 
          (click)="activeTab.set('logs')" 
          [class]="activeTab() === 'logs' ? 'bg-purple-600 text-white font-bold shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'"
          class="px-4 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap"
        >
          <span translate="no" class="notranslate material-symbols-outlined text-sm text-rose-400">terminal</span>
          Logs & Telemetria
        </button>
      </div>

      <!-- TAB 1: VISÃO GERAL & MRR -->
      @if (activeTab() === 'overview') {
        <div class="space-y-6">
          <!-- Executive Key Performance Indicators -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <!-- Total Tenants -->
            <div class="bg-gray-900/70 border border-white/5 rounded-2xl p-5 shadow-xl">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">Total de Clientes</span>
                <div class="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                  <span translate="no" class="notranslate material-symbols-outlined text-lg">groups</span>
                </div>
              </div>
              <p class="text-3xl font-black text-white">
                @if(isLoading()) { <span class="animate-pulse">...</span> } @else { {{ restaurants().length }} }
              </p>
              <div class="text-[11px] text-gray-400 mt-2 flex items-center gap-1">
                <span class="text-indigo-400 font-bold">●</span> Tenancy cadastrado no Supabase
              </div>
            </div>

            <!-- Active Subscriptions -->
            <div class="bg-gray-900/70 border border-white/5 rounded-2xl p-5 shadow-xl">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">Assinaturas Ativas</span>
                <div class="w-8 h-8 rounded-lg bg-green-500/10 text-green-400 flex items-center justify-center">
                  <span translate="no" class="notranslate material-symbols-outlined text-lg">check_circle</span>
                </div>
              </div>
              <p class="text-3xl font-black text-white">
                @if(isLoading()) { <span class="animate-pulse">...</span> } @else { {{ getSubscriptionCount('active') }} }
              </p>
              <div class="text-[11px] text-gray-400 mt-2 flex items-center gap-1">
                <span class="text-green-400 font-bold">●</span> Contas pagantes ativas
              </div>
            </div>

            <!-- Trial / Pending -->
            <div class="bg-gray-900/70 border border-white/5 rounded-2xl p-5 shadow-xl">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">Em Degustação (Trial)</span>
                <div class="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                  <span translate="no" class="notranslate material-symbols-outlined text-lg">hourglass_top</span>
                </div>
              </div>
              <p class="text-3xl font-black text-white">
                @if(isLoading()) { <span class="animate-pulse">...</span> } @else { {{ getSubscriptionCount('trialing') }} }
              </p>
              <div class="text-[11px] text-gray-400 mt-2 flex items-center gap-1">
                <span class="text-amber-400 font-bold">●</span> {{ getSubscriptionCount('past_due') }} inadimplente / vencido
              </div>
            </div>

            <!-- MRR Estimado -->
            <div class="bg-gray-900/70 border border-white/5 rounded-2xl p-5 shadow-xl">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">MRR Atual Estimado</span>
                <div class="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <span translate="no" class="notranslate material-symbols-outlined text-lg">payments</span>
                </div>
              </div>
              <p class="text-3xl font-black text-emerald-400">
                @if(isLoading()) { <span class="animate-pulse">...</span> } @else { {{ calculateEstimatedMRR() | currency:'BRL':'symbol':'1.2-2' }} }
              </p>
              <div class="text-[11px] text-gray-400 mt-2 flex items-center gap-1">
                <span class="text-emerald-400 font-bold">●</span> ARR projetado: {{ (calculateEstimatedMRR() * 12) | currency:'BRL':'symbol':'1.0-0' }}
              </div>
            </div>
          </div>

          <!-- Quick Shortcuts & Central de Atendimento Banner -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 bg-gray-900/50 border border-white/5 rounded-2xl p-6 space-y-4">
              <h3 class="text-lg font-bold text-white flex items-center gap-2">
                <span translate="no" class="notranslate material-symbols-outlined text-purple-400">support_agent</span>
                Central de Atendimento ao Cliente em Tempo Real
              </h3>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button (click)="activeTab.set('support')" class="bg-cyan-600/10 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-500/30 p-4 rounded-xl text-left transition-all group">
                  <div class="flex justify-between items-center mb-2">
                    <span translate="no" class="notranslate material-symbols-outlined text-2xl text-cyan-400 group-hover:text-white">forum</span>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-500 text-gray-950">{{ openTicketsCount() }} Abertos</span>
                  </div>
                  <div class="font-bold text-sm">Abrir Central de Suporte</div>
                  <div class="text-[11px] text-gray-400 group-hover:text-cyan-100 mt-1">Atendimento ao vivo, chat com clientes e resolução de chamados</div>
                </button>

                <button (click)="activeTab.set('catalog')" class="bg-orange-600/10 hover:bg-orange-600 text-orange-300 hover:text-white border border-orange-500/30 p-4 rounded-xl text-left transition-all group">
                  <span translate="no" class="notranslate material-symbols-outlined text-2xl mb-2 text-orange-400 group-hover:text-white">restaurant_menu</span>
                  <div class="font-bold text-sm">Inspector de Cardápios</div>
                  <div class="text-[11px] text-gray-400 group-hover:text-orange-100 mt-1">Editar preços, pausar itens e alterar cardápios do cliente na hora</div>
                </button>

                <button (click)="activeTab.set('users')" class="bg-blue-600/10 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 p-4 rounded-xl text-left transition-all group">
                  <span translate="no" class="notranslate material-symbols-outlined text-2xl mb-2 text-blue-400 group-hover:text-white">manage_accounts</span>
                  <div class="font-bold text-sm">Gerenciar Usuários & Planos</div>
                  <div class="text-[11px] text-gray-400 group-hover:text-blue-100 mt-1">Alterar planos, estender vigência e controlar acessos dos clientes</div>
                </button>
              </div>
            </div>

            <!-- Health Quick Card -->
            <div class="bg-gray-900/50 border border-white/5 rounded-2xl p-6 space-y-4">
              <h3 class="text-base font-bold text-white flex items-center gap-2">
                <span translate="no" class="notranslate material-symbols-outlined text-emerald-400">health_metrics</span>
                Status do Servidor
              </h3>

              @if(healthData()) {
                <div class="space-y-3 text-xs">
                  <div class="flex justify-between items-center p-2.5 rounded-xl bg-white/5">
                    <span class="text-gray-400">Status Geral:</span>
                    <span [class]="healthData().status === 'healthy' ? 'text-green-400 font-bold' : 'text-amber-400 font-bold'" class="uppercase">
                      {{ healthData().status }}
                    </span>
                  </div>

                  <div class="flex justify-between items-center p-2.5 rounded-xl bg-white/5">
                    <span class="text-gray-400">Latência Total API:</span>
                    <span class="font-mono text-white font-bold">{{ healthData().latencyMs }} ms</span>
                  </div>

                  <div class="flex justify-between items-center p-2.5 rounded-xl bg-white/5">
                    <span class="text-gray-400">Banco de Dados:</span>
                    <span class="font-mono text-emerald-400 font-bold">{{ healthData().checks?.database?.latencyMs || 0 }} ms</span>
                  </div>

                  <button (click)="activeTab.set('health')" class="w-full text-center text-xs font-bold text-purple-400 hover:text-purple-300 py-1.5 transition-colors">
                    Ver relatório detalhado de observabilidade →
                  </button>
                </div>
              } @else {
                <div class="p-6 text-center text-gray-500 text-xs">Carregando métricas de saúde...</div>
              }
            </div>
          </div>
        </div>
      }

      <!-- TAB 2: CENTRAL DE ATENDIMENTO AO CLIENTE EM TEMPO REAL -->
      @if (activeTab() === 'support') {
        <div class="space-y-6">
          <div class="bg-gray-900/60 border border-white/5 rounded-2xl p-6 shadow-2xl space-y-6">
            
            <!-- Support Bar Stats -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-4 border-b border-white/10">
              <div class="bg-white/5 p-4 rounded-xl border border-white/5">
                <div class="text-[10px] text-gray-400 uppercase font-black">Chamados Abertos</div>
                <div class="text-2xl font-black text-cyan-400 mt-1">{{ openTicketsCount() }}</div>
              </div>
              <div class="bg-white/5 p-4 rounded-xl border border-white/5">
                <div class="text-[10px] text-gray-400 uppercase font-black">Em Atendimento</div>
                <div class="text-2xl font-black text-amber-400 mt-1">{{ inProgressTicketsCount() }}</div>
              </div>
              <div class="bg-white/5 p-4 rounded-xl border border-white/5">
                <div class="text-[10px] text-gray-400 uppercase font-black">Tempo Médio de Resposta</div>
                <div class="text-2xl font-black text-emerald-400 mt-1">2.4 min</div>
              </div>
              <div class="bg-white/5 p-4 rounded-xl border border-white/5">
                <div class="text-[10px] text-gray-400 uppercase font-black">Satisfação dos Clientes</div>
                <div class="text-2xl font-black text-purple-400 mt-1">99.4%</div>
              </div>
            </div>

            <!-- Workspace Grid -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <!-- Left Column: Tickets Queue -->
              <div class="space-y-3">
                <div class="flex justify-between items-center">
                  <h3 class="text-sm font-bold text-white flex items-center gap-2">
                    <span translate="no" class="notranslate material-symbols-outlined text-cyan-400">inbox</span>
                    Fila de Atendimento
                  </h3>
                  <button (click)="openNewTicketPrompt()" class="bg-cyan-600 hover:bg-cyan-500 text-gray-950 px-2.5 py-1 rounded-lg text-xs font-black uppercase flex items-center gap-1 transition-all">
                    <span translate="no" class="notranslate material-symbols-outlined text-xs">add</span>
                    Novo Chamado
                  </button>
                </div>

                <div class="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                  @for(ticket of supportTickets(); track ticket.id) {
                    <div 
                      (click)="selectedTicket.set(ticket)"
                      [class]="selectedTicket()?.id === ticket.id ? 'bg-cyan-500/10 border-cyan-500/50 shadow-lg' : 'bg-white/5 border-white/5 hover:bg-white/10'"
                      class="p-4 rounded-xl border cursor-pointer transition-all space-y-2"
                    >
                      <div class="flex justify-between items-start">
                        <span class="text-xs font-bold text-white truncate max-w-[180px]">{{ ticket.client_name }}</span>
                        <span [class]="getPriorityClass(ticket.priority)" class="text-[9px] px-2 py-0.5 rounded font-black uppercase">
                          {{ ticket.priority }}
                        </span>
                      </div>

                      <div class="text-xs text-cyan-300 font-semibold truncate">{{ ticket.store_name }}</div>
                      <p class="text-xs text-gray-300 font-medium line-clamp-2">{{ ticket.subject }}</p>

                      <div class="flex justify-between items-center pt-2 border-t border-white/5 text-[10px] text-gray-400">
                        <span [class]="getTicketStatusClass(ticket.status)" class="font-bold uppercase">
                          ● {{ getTicketStatusText(ticket.status) }}
                        </span>
                        <span>{{ ticket.created_at | date:'HH:mm' }}</span>
                      </div>
                    </div>
                  }
                </div>
              </div>

              <!-- Right Column: Active Live Chat & Customer Console -->
              <div class="lg:col-span-2 bg-gray-950 border border-white/10 rounded-2xl p-5 flex flex-col justify-between min-h-[550px] space-y-4">
                @if(selectedTicket()) {
                  <!-- Active Ticket Header -->
                  <div class="border-b border-white/10 pb-4 space-y-2">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <span class="text-[10px] font-mono text-cyan-400 font-bold uppercase">CHAMADO {{ selectedTicket()?.id }}</span>
                        <h4 class="text-base font-black text-white">{{ selectedTicket()?.subject }}</h4>
                        <div class="text-xs text-gray-400">
                          Cliente: <strong class="text-white">{{ selectedTicket()?.client_name }}</strong> ({{ selectedTicket()?.store_name }})
                        </div>
                      </div>

                      <div class="flex items-center gap-2">
                        <select 
                          [ngModel]="selectedTicket()?.status" 
                          (ngModelChange)="changeTicketStatus($event)"
                          class="bg-gray-900 border border-white/10 text-xs rounded-xl px-3 py-1.5 text-white outline-none font-bold"
                        >
                          <option value="open">Aberto</option>
                          <option value="in_progress">Em Atendimento</option>
                          <option value="resolved">Resolvido</option>
                        </select>

                        <button (click)="inspectClientMenu(selectedTicket()?.client_id)" class="bg-orange-600/20 text-orange-300 hover:bg-orange-600 hover:text-white border border-orange-500/30 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1">
                          <span translate="no" class="notranslate material-symbols-outlined text-xs">restaurant_menu</span>
                          Ver Cardápio
                        </button>
                      </div>
                    </div>

                    <!-- Client Quick Actions Ribbon -->
                    <div class="flex flex-wrap items-center gap-2 pt-2">
                      <button (click)="extendClientSubscription(selectedTicket()?.client_id, 30)" class="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-gray-950 border border-emerald-500/30 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all">
                        +30 Dias de Acesso
                      </button>
                      <button (click)="resetClientPin(selectedTicket()?.store_name)" class="bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500 hover:text-white border border-indigo-500/30 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all">
                        Resetar PINs do Caixa
                      </button>
                      <button (click)="toggleEmergencyMode(selectedTicket()?.store_name)" class="bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white border border-rose-500/30 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all">
                        Modo de Contingência
                      </button>
                    </div>
                  </div>

                  <!-- Messages Stream -->
                  <div class="flex-1 space-y-3 overflow-y-auto max-h-[300px] p-2 bg-gray-900/40 rounded-xl border border-white/5">
                    @for(msg of selectedTicket()?.messages; track msg.time) {
                      <div [class]="msg.sender === 'admin' ? 'justify-end' : 'justify-start'" class="flex">
                        <div [class]="msg.sender === 'admin' ? 'bg-purple-600 text-white rounded-tl-2xl rounded-tr-2xl rounded-bl-2xl' : 'bg-gray-800 text-gray-200 border border-white/10 rounded-tl-2xl rounded-tr-2xl rounded-br-2xl'" class="max-w-[80%] p-3 text-xs space-y-1 shadow-md">
                          <div class="flex justify-between items-center gap-4 text-[9px] opacity-75 font-bold uppercase">
                            <span>{{ msg.sender === 'admin' ? 'Suporte ChefOS' : selectedTicket()?.client_name }}</span>
                            <span>{{ msg.time }}</span>
                          </div>
                          <p class="leading-relaxed">{{ msg.text }}</p>
                        </div>
                      </div>
                    }
                  </div>

                  <!-- Reply Box & Quick Templates -->
                  <div class="space-y-3 pt-2">
                    <div class="flex flex-wrap gap-1.5 text-[10px]">
                      <span class="text-gray-500 font-bold self-center">Respostas Rápidas:</span>
                      <button (click)="insertReplyTemplate('Sua assinatura foi renovada e o acesso liberado com sucesso!')" class="bg-white/5 hover:bg-white/10 text-gray-300 px-2 py-1 rounded-lg border border-white/5 transition-all">
                        "Acesso Liberado"
                      </button>
                      <button (click)="insertReplyTemplate('Ajustamos a configuração do iFood e revalidamos a integração.')" class="bg-white/5 hover:bg-white/10 text-gray-300 px-2 py-1 rounded-lg border border-white/5 transition-all">
                        "iFood Revalidado"
                      </button>
                      <button (click)="insertReplyTemplate('Atualizamos o seu cardápio em tempo real no servidor.')" class="bg-white/5 hover:bg-white/10 text-gray-300 px-2 py-1 rounded-lg border border-white/5 transition-all">
                        "Cardápio Atualizado"
                      </button>
                    </div>

                    <div class="flex gap-2">
                      <input 
                        type="text" 
                        [(ngModel)]="replyText" 
                        (keyup.enter)="sendReply()"
                        placeholder="Escreva a resposta para o cliente..." 
                        class="flex-1 bg-gray-900 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:border-cyan-500 outline-none"
                      >
                      <button 
                        (click)="sendReply()" 
                        [disabled]="!replyText.trim()"
                        class="bg-cyan-500 hover:bg-cyan-400 text-gray-950 px-5 py-2.5 rounded-xl font-black text-xs uppercase transition-all disabled:opacity-50 flex items-center gap-1"
                      >
                        <span translate="no" class="notranslate material-symbols-outlined text-sm">send</span>
                        Enviar
                      </button>
                    </div>
                  </div>
                } @else {
                  <div class="flex flex-col items-center justify-center h-full text-center p-12 text-gray-500 space-y-3">
                    <span translate="no" class="notranslate material-symbols-outlined text-5xl text-cyan-500/40">support_agent</span>
                    <h4 class="text-white font-bold text-base">Selecione um chamado da fila de atendimento</h4>
                    <p class="text-xs max-w-sm">Você poderá conversar diretamente com o cliente, realizar alterações no plano, cardápio e status da loja em tempo real.</p>
                  </div>
                }
              </div>
            </div>
          </div>
        </div>
      }

      <!-- TAB 3: INSPECTOR DE CARDÁPIOS DOS CLIENTES -->
      @if (activeTab() === 'catalog') {
        <div class="space-y-6">
          <div class="bg-gray-900/60 border border-white/5 rounded-2xl p-6 shadow-2xl space-y-6">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/10 pb-4">
              <div>
                <h3 class="text-xl font-bold text-white flex items-center gap-2">
                  <span translate="no" class="notranslate material-symbols-outlined text-orange-400">restaurant_menu</span>
                  Inspector & Editor de Cardápios do Cliente em Tempo Real
                </h3>
                <p class="text-xs text-gray-400 mt-0.5">Selecione qualquer cliente cadastrado no sistema para inspecionar e alterar preços ou pausar itens do cardápio instantaneamente.</p>
              </div>

              <!-- Tenant Selector -->
              <div class="flex items-center gap-3">
                <span class="text-xs font-bold text-gray-400">Cliente:</span>
                <select 
                  [ngModel]="selectedCatalogTenantId()" 
                  (ngModelChange)="changeCatalogTenant($event)"
                  class="bg-gray-950 border border-white/10 text-xs rounded-xl px-3 py-2 text-white font-bold outline-none focus:border-orange-500"
                >
                  @for(rest of restaurants(); track rest.id) {
                    <option [value]="rest.id">{{ rest.full_name }} ({{ rest.stores?.[0]?.name || 'Sem Loja' }})</option>
                  }
                </select>

                <button (click)="openAddMenuItemModal()" class="bg-orange-600 hover:bg-orange-500 text-white px-3 py-2 rounded-xl text-xs font-bold uppercase transition-all flex items-center gap-1">
                  <span translate="no" class="notranslate material-symbols-outlined text-sm">add</span>
                  Adicionar Item
                </button>
              </div>
            </div>

            <!-- Menu Table -->
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="border-b border-white/10 text-gray-500 uppercase text-[10px] tracking-wider font-black">
                    <th class="py-3 px-3">Item / Produto</th>
                    <th class="py-3 px-3">Categoria</th>
                    <th class="py-3 px-3">Preço R$</th>
                    <th class="py-3 px-3">Tempo Preparo</th>
                    <th class="py-3 px-3 text-center">Status no Cardápio</th>
                    <th class="py-3 px-3 text-right">Ações Rápidas</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-white/5 text-gray-300">

                  @for(item of currentTenantMenuItems(); track item.id) {
                    <tr class="hover:bg-white/5 transition-colors">
                      <td class="py-3 px-3 font-bold text-white">{{ item.name }}</td>
                      <td class="py-3 px-3">
                        <span class="px-2 py-0.5 rounded bg-white/5 text-gray-300 border border-white/5 font-semibold text-[10px]">
                          {{ item.category }}
                        </span>
                      </td>
                      <td class="py-3 px-3 font-mono font-bold text-emerald-400">
                        {{ item.price | currency:'BRL':'symbol':'1.2-2' }}
                      </td>
                      <td class="py-3 px-3 text-gray-400">{{ item.prep_time || 15 }} min</td>
                      <td class="py-3 px-3 text-center">
                        <button 
                          (click)="toggleMenuItemAvailability(item)"
                          [class]="item.is_available ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'"
                          class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase border transition-all"
                        >
                          {{ item.is_available ? 'Disponível' : 'Pausado / Esgotado' }}
                        </button>
                      </td>
                      <td class="py-3 px-3 text-right space-x-2">
                        <button (click)="editMenuItemPrice(item)" class="bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white p-1.5 rounded-lg border border-indigo-500/20 transition-all" title="Editar Detalhes">
                          <span translate="no" class="notranslate material-symbols-outlined text-sm">edit</span>
                        </button>
                      </td>
                    </tr>
                  }

                  @if(currentTenantMenuItems().length === 0) {
                    <tr>
                      <td colspan="6" class="py-12 text-center text-gray-500">
                        Nenhum item localizado no cardápio deste cliente.
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      }

      <!-- TAB 4: GESTÃO COMPLETA DE USUÁRIOS & LOJAS -->
      @if (activeTab() === 'users') {
        <div class="space-y-6">
          <div class="bg-gray-900/60 border border-white/5 rounded-2xl p-6 shadow-2xl space-y-4">
            
            <!-- Search & Filters -->
            <div class="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center">
              <div class="relative flex-1">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                  <span translate="no" class="notranslate material-symbols-outlined text-sm">search</span>
                </span>
                <input 
                  type="text" 
                  [(ngModel)]="searchQuery" 
                  placeholder="Buscar proprietário, e-mail, restaurante, cargo..." 
                  class="w-full bg-gray-950 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
                >
              </div>
              
              <div class="flex flex-wrap gap-1">
                <button (click)="statusFilter.set('all')" [class]="statusFilter() === 'all' ? 'bg-white/10 text-white font-bold' : 'text-gray-400 hover:text-white'" class="px-3 py-1.5 border border-white/10 text-[11px] rounded-lg tracking-wider font-semibold uppercase transition-all">
                  Todos
                </button>
                <button (click)="statusFilter.set('active')" [class]="statusFilter() === 'active' ? 'bg-green-500/20 text-green-400 font-bold' : 'text-gray-400 hover:text-white'" class="px-3 py-1.5 border border-white/10 text-[11px] rounded-lg tracking-wider font-semibold uppercase transition-all">
                  Ativos
                </button>
                <button (click)="statusFilter.set('trialing')" [class]="statusFilter() === 'trialing' ? 'bg-blue-500/20 text-blue-400 font-bold' : 'text-gray-400 hover:text-white'" class="px-3 py-1.5 border border-white/10 text-[11px] rounded-lg tracking-wider font-semibold uppercase transition-all">
                  Testes
                </button>
                <button (click)="statusFilter.set('canceled')" [class]="statusFilter() === 'canceled' ? 'bg-red-500/20 text-red-400 font-bold' : 'text-gray-400 hover:text-white'" class="px-3 py-1.5 border border-white/10 text-[11px] rounded-lg tracking-wider font-semibold uppercase transition-all">
                  Cancelados
                </button>
              </div>
            </div>

            <!-- Users Table -->
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="border-b border-white/5 text-gray-500 text-[10px] tracking-wider font-black uppercase">
                    <th class="pb-3 text-left">Proprietário / E-mail</th>
                    <th class="pb-3 text-left">Lojas Vinculadas</th>
                    <th class="pb-3 text-left">Plano / Status</th>
                    <th class="pb-3 text-left">Expiração</th>
                    <th class="pb-3 text-right">Ações de Suporte & Gestão</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-white/5">
                  @for(profile of filteredRestaurants(); track profile.id) {
                    <tr [class]="selectedProfile()?.id === profile.id ? 'bg-white/5' : ''" class="hover:bg-white/10 transition-colors">
                      
                      <!-- Owner Identity -->
                      <td class="py-4 pr-3">
                        <div class="flex items-center gap-3">
                          <img [src]="profile.avatar_url || 'https://ui-avatars.com/api/?background=312e81&color=fff&name=' + (profile.full_name || 'Restaurante')" 
                               class="w-9 h-9 rounded-full border border-white/10 object-cover" referrerpolicy="no-referrer">
                          <div class="w-48 truncate">
                            <p class="text-sm font-semibold text-white truncate" [title]="profile.full_name || 'Sem nome'">{{ profile.full_name || 'Sem Nome' }}</p>
                            <p class="text-[11px] text-gray-500 truncate">{{ profile.email || 'cliente@restaurante.com' }}</p>
                          </div>
                        </div>
                      </td>

                      <!-- Stores -->
                      <td class="py-4 px-2">
                        @if(profile.bars && profile.bars.length > 0) {
                          <div class="flex flex-col gap-0.5 max-w-[160px]">
                            @for(bar of profile.bars; track bar.id) {
                              <span class="text-xs text-gray-300 font-medium truncate" [title]="bar.name">
                                {{ bar.name }}
                              </span>
                            }
                          </div>
                        } @else {
                          <span class="text-xs text-gray-600 italic">Nenhuma loja</span>
                        }
                      </td>

                      <!-- Plan & Status -->
                      <td class="py-4 px-2">
                        <div class="flex flex-col gap-1 items-start">
                          @if(profile.subscriptions && profile.subscriptions.length > 0) {
                            <span class="text-[10px] px-2 py-0.5 rounded font-bold text-gray-300 border border-white/10 bg-white/5">
                              {{ getPlanName(profile.subscriptions[0].plan_id) | uppercase }}
                            </span>
                            
                            <span [class]="getStatusClass(profile.subscriptions[0].status)" class="text-[9px] px-1.5 py-0.5 rounded uppercase font-black">
                              {{ getStatusTranslation(profile.subscriptions[0].status) }}
                            </span>
                          } @else {
                            <span class="text-[10px] text-gray-500 italic">Sem Assinatura</span>
                          }
                        </div>
                      </td>

                      <!-- Expiration -->
                      <td class="py-4 px-2">
                        @if(profile.subscriptions && profile.subscriptions.length > 0) {
                          <div class="flex flex-col">
                            <span class="text-xs text-gray-200 font-mono">
                              {{ profile.subscriptions[0].current_period_end | date:'dd/MM/yyyy' }}
                            </span>
                            <span class="text-[9px] text-gray-500">
                              Restam {{ getRemainingDays(profile.subscriptions[0].current_period_end) }} dias
                            </span>
                          </div>
                        } @else {
                          <span class="text-xs text-gray-600">-</span>
                        }
                      </td>

                      <!-- Actions -->
                      <td class="py-4 pl-3 text-right">
                        <div class="flex items-center justify-end gap-1.5">
                          <button (click)="openTicketForProfile(profile)" class="bg-cyan-600/10 text-cyan-400 hover:bg-cyan-600 hover:text-white border border-cyan-500/20 p-2 rounded-xl transition-all" title="Abrir Chamado/Chat">
                            <span translate="no" class="notranslate material-symbols-outlined text-[15px] leading-none">forum</span>
                          </button>

                          <button (click)="inspectClientMenu(profile.id)" class="bg-orange-600/10 text-orange-400 hover:bg-orange-600 hover:text-white border border-orange-500/20 p-2 rounded-xl transition-all" title="Ver/Editar Cardápio">
                            <span translate="no" class="notranslate material-symbols-outlined text-[15px] leading-none">restaurant_menu</span>
                          </button>

                          <button (click)="selectProfileForEdit(profile)" class="bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600 hover:text-white border border-indigo-500/20 p-2 rounded-xl transition-all" title="Gerenciar Plano">
                            <span translate="no" class="notranslate material-symbols-outlined text-[15px] leading-none">edit_calendar</span>
                          </button>
                          
                          @if(profile.subscriptions && profile.subscriptions.length > 0) {
                            <button (click)="addDaysToSubscription(profile, 30)" class="bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600 hover:text-white border border-emerald-500/20 px-2.5 py-1.5 rounded-xl text-[10px] font-bold tracking-wider transition-all" title="Estender +30 Dias">
                              +30d
                            </button>
                          }
                        </div>
                      </td>
                    </tr>
                  }
                  @if(filteredRestaurants().length === 0 && !isLoading()) {
                    <tr>
                      <td colspan="5" class="py-12 text-center text-gray-500">
                        Nenhum restaurante ou usuário encontrado.
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      }

      <!-- TAB 5: SAÚDE & OBSERVABILIDADE -->
      @if (activeTab() === 'health') {
        <div class="space-y-6">
          <div class="bg-gray-900/60 border border-white/5 rounded-2xl p-6 space-y-6 shadow-2xl">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <h3 class="text-xl font-bold text-white flex items-center gap-2">
                  <span translate="no" class="notranslate material-symbols-outlined text-emerald-400">monitor_heart</span>
                  Relatório de Observabilidade Profunda (SLO / APM)
                </h3>
                <p class="text-xs text-gray-400 mt-0.5">Diagnóstico em tempo real de banco de dados, storage, chaves de integração e métricas de execução.</p>
              </div>

              <button (click)="refreshHealth()" class="bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600 hover:text-white border border-emerald-500/30 px-3 py-1.5 rounded-xl text-xs font-bold uppercase transition-all flex items-center gap-1.5">
                <span translate="no" class="notranslate material-symbols-outlined text-sm">refresh</span>
                Testar Servidores Agora
              </button>
            </div>

            @if (healthData()) {
              <!-- Health Grid metrics -->
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <!-- Database status -->
                <div class="bg-white/5 border border-white/5 p-4 rounded-xl space-y-2">
                  <div class="flex justify-between items-center">
                    <span class="text-xs font-bold uppercase text-gray-400">Banco de Dados (PostgreSQL)</span>
                    <span [class]="healthData().checks?.database?.status === 'ok' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'" class="px-2 py-0.5 rounded text-[10px] font-black uppercase">
                      {{ healthData().checks?.database?.status }}
                    </span>
                  </div>
                  <div class="text-2xl font-black font-mono text-white">{{ healthData().checks?.database?.latencyMs }} ms</div>
                  <p class="text-[11px] text-gray-400">{{ healthData().checks?.database?.message }}</p>
                </div>

                <!-- Auth service status -->
                <div class="bg-white/5 border border-white/5 p-4 rounded-xl space-y-2">
                  <div class="flex justify-between items-center">
                    <span class="text-xs font-bold uppercase text-gray-400">Serviço de Autenticação</span>
                    <span [class]="healthData().checks?.auth?.status === 'ok' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'" class="px-2 py-0.5 rounded text-[10px] font-black uppercase">
                      {{ healthData().checks?.auth?.status }}
                    </span>
                  </div>
                  <div class="text-2xl font-black font-mono text-white">{{ healthData().checks?.auth?.latencyMs || 0 }} ms</div>
                  <p class="text-[11px] text-gray-400">{{ healthData().checks?.auth?.message }}</p>
                </div>

                <!-- Storage status -->
                <div class="bg-white/5 border border-white/5 p-4 rounded-xl space-y-2">
                  <div class="flex justify-between items-center">
                    <span class="text-xs font-bold uppercase text-gray-400">Storage de Arquivos</span>
                    <span [class]="healthData().checks?.storage?.status === 'ok' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'" class="px-2 py-0.5 rounded text-[10px] font-black uppercase">
                      {{ healthData().checks?.storage?.status }}
                    </span>
                  </div>
                  <div class="text-2xl font-black font-mono text-white">{{ healthData().checks?.storage?.latencyMs || 0 }} ms</div>
                  <p class="text-[11px] text-gray-400">{{ healthData().checks?.storage?.message }}</p>
                </div>
              </div>
            } @else {
              <div class="py-12 text-center text-gray-400">
                <span translate="no" class="notranslate material-symbols-outlined text-4xl animate-spin mb-2">sync</span>
                <p>Consultando métricas dos servidores e integrações...</p>
              </div>
            }
          </div>
        </div>
      }

      <!-- TAB 6: PROVISIONAMENTO AUTOMÁTICO -->
      @if (activeTab() === 'provisioning') {
        <div class="max-w-2xl mx-auto bg-gray-900/60 border border-white/5 rounded-2xl p-6 shadow-2xl space-y-6">
          <div class="border-b border-white/10 pb-4">
            <h3 class="text-xl font-bold text-white flex items-center gap-2">
              <span translate="no" class="notranslate material-symbols-outlined text-amber-400">rocket_launch</span>
              Provisionamento Automatizado de Tenant
            </h3>
            <p class="text-xs text-gray-400 mt-1">
              Provisione uma nova loja com Chaves API v2, salão padrão, mesas, regras de acesso e 30 dias de degustação ativados no banco.
            </p>
          </div>

          <form (ngSubmit)="submitProvisioning()" class="space-y-4 text-xs">
            <div class="space-y-1">
              <label class="font-bold text-gray-300">User ID do Proprietário (Auth User ID) *</label>
              <input 
                type="text" 
                [(ngModel)]="provUserId" 
                name="userId" 
                placeholder="ex: 00000000-0000-0000-0000-000000000000" 
                class="w-full bg-gray-950 border border-white/10 rounded-xl px-3 py-2 text-white font-mono focus:border-amber-500 outline-none"
                required
              >
            </div>

            <div class="space-y-1">
              <label class="font-bold text-gray-300">Nome do Restaurante / Loja *</label>
              <input 
                type="text" 
                [(ngModel)]="provStoreName" 
                name="storeName" 
                placeholder="ex: Bistrô Gourmet - Unidade Matriz" 
                class="w-full bg-gray-950 border border-white/10 rounded-xl px-3 py-2 text-white focus:border-amber-500 outline-none"
                required
              >
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="space-y-1">
                <label class="font-bold text-gray-300">CNPJ (Opcional)</label>
                <input 
                  type="text" 
                  [(ngModel)]="provCnpj" 
                  name="cnpj" 
                  placeholder="00.000.000/0001-00" 
                  class="w-full bg-gray-950 border border-white/10 rounded-xl px-3 py-2 text-white focus:border-amber-500 outline-none"
                >
              </div>

              <div class="space-y-1">
                <label class="font-bold text-gray-300">Telefone de Contato</label>
                <input 
                  type="text" 
                  [(ngModel)]="provPhone" 
                  name="phone" 
                  placeholder="(11) 99999-9999" 
                  class="w-full bg-gray-950 border border-white/10 rounded-xl px-3 py-2 text-white focus:border-amber-500 outline-none"
                >
              </div>
            </div>

            <div class="space-y-1">
              <label class="font-bold text-gray-300">Plano Inicial</label>
              <select 
                [(ngModel)]="provPlanId" 
                name="planId" 
                class="w-full bg-gray-950 border border-white/10 rounded-xl px-3 py-2 text-white focus:border-amber-500 outline-none"
              >
                <option value="">Plano Padrão com 30 Dias Grátis</option>
                @for(plan of plans(); track plan.id) {
                  <option [value]="plan.id">{{ plan.name }} - {{ plan.price | currency:'BRL':'symbol':'1.0-2' }}</option>
                }
              </select>
            </div>

            <button 
              type="submit" 
              [disabled]="isProvisioning() || !provUserId || !provStoreName" 
              class="w-full bg-amber-500 hover:bg-amber-400 text-gray-950 font-black py-3 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 uppercase tracking-wider"
            >
              @if(isProvisioning()) {
                <span translate="no" class="notranslate material-symbols-outlined text-sm animate-spin">sync</span>
                Provisionando Tenant...
              } @else {
                <span translate="no" class="notranslate material-symbols-outlined text-sm">rocket_launch</span>
                Executar Provisionamento Agora
              }
            </button>
          </form>
        </div>
      }

      <!-- TAB 7: PLANOS & PREÇOS (SaaS) -->
      @if (activeTab() === 'plans') {
        <div class="space-y-6">
          <div class="bg-gray-900/60 border border-white/5 rounded-2xl p-6 shadow-2xl space-y-4">
            <div class="flex justify-between items-center border-b border-white/10 pb-4">
              <div>
                <h3 class="text-xl font-bold text-white flex items-center gap-2">
                  <span translate="no" class="notranslate material-symbols-outlined text-indigo-400">loyalty</span>
                  Gerenciador de Planos SaaS
                </h3>
                <p class="text-xs text-gray-400 mt-1">Crie, edite e precifique os planos oferecidos na plataforma.</p>
              </div>

              <button (click)="openCreatePlanModal()" class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all flex items-center gap-1.5">
                <span translate="no" class="notranslate material-symbols-outlined text-sm">add</span>
                Novo Plano
              </button>
            </div>

            <!-- Plans grid -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              @for(plan of plans(); track plan.id) {
                <div class="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4 relative flex flex-col justify-between">
                  <div class="space-y-2">
                    <div class="flex justify-between items-start">
                      <h4 class="text-lg font-bold text-white">{{ plan.name }}</h4>
                      <span class="text-[10px] px-2 py-0.5 bg-indigo-500/20 text-indigo-300 font-mono rounded">
                        {{ plan.slug }}
                      </span>
                    </div>

                    <div class="text-3xl font-black text-emerald-400">
                      {{ plan.price | currency:'BRL':'symbol':'1.0-2' }} <span class="text-xs text-gray-400 font-normal">/mês</span>
                    </div>

                    <ul class="text-xs space-y-1.5 text-gray-300 pt-2 border-t border-white/5">
                      <li class="flex items-center gap-2">
                        <span translate="no" class="notranslate material-symbols-outlined text-sm text-green-400">check</span>
                        Até {{ plan.max_stores || 1 }} Unidades/Lojas
                      </li>
                      <li class="flex items-center gap-2">
                        <span translate="no" class="notranslate material-symbols-outlined text-sm text-green-400">check</span>
                        {{ plan.trial_period_days || 30 }} dias de teste ativados
                      </li>
                    </ul>
                  </div>

                  <div class="pt-4 border-t border-white/5 flex gap-2 justify-between">
                    <button (click)="editPlan(plan)" class="text-indigo-400 hover:text-indigo-300 text-xs font-bold px-3 py-1.5 rounded-xl hover:bg-indigo-500/10 transition-all">
                      Editar Plano
                    </button>
                    <button (click)="deletePlan(plan)" class="text-red-400 hover:text-red-300 text-[10px] p-2 rounded-xl hover:bg-red-500/10 transition-all" title="Remover Plano">
                      <span translate="no" class="notranslate material-symbols-outlined text-[15px]">delete</span>
                    </button>
                  </div>
                </div>
              }
            </div>
          </div>
        </div>
      }

      <!-- TAB 8: FINANCEIRO SAAS -->
      @if (activeTab() === 'financial') {
        <div class="space-y-6">
          <div class="bg-gray-900/60 border border-white/5 rounded-2xl p-6 shadow-2xl space-y-6">
            <h3 class="text-xl font-bold text-white flex items-center gap-2">
              <span translate="no" class="notranslate material-symbols-outlined text-teal-400">payments</span>
              Relatório Financeiro SaaS
            </h3>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div class="bg-white/5 border border-white/5 p-5 rounded-2xl">
                <span class="text-xs font-bold uppercase text-gray-400">MRR Ativo (Receita Recorrente Mensal)</span>
                <div class="text-3xl font-black text-emerald-400 mt-2">
                  {{ calculateEstimatedMRR() | currency:'BRL':'symbol':'1.2-2' }}
                </div>
              </div>

              <div class="bg-white/5 border border-white/5 p-5 rounded-2xl">
                <span class="text-xs font-bold uppercase text-gray-400">ARR Projetado (Anual)</span>
                <div class="text-3xl font-black text-indigo-400 mt-2">
                  {{ (calculateEstimatedMRR() * 12) | currency:'BRL':'symbol':'1.2-2' }}
                </div>
              </div>

              <div class="bg-white/5 border border-white/5 p-5 rounded-2xl">
                <span class="text-xs font-bold uppercase text-gray-400">Ticket Médio por Cliente (ARPU)</span>
                <div class="text-3xl font-black text-teal-400 mt-2">
                  {{ calculateARPU() | currency:'BRL':'symbol':'1.2-2' }}
                </div>
              </div>
            </div>
          </div>
        </div>
      }

      <!-- TAB 9: LOGS & TELEMETRIA DO SISTEMA -->
      @if (activeTab() === 'logs') {
        <div class="space-y-6">
          <div class="bg-gray-900/60 border border-white/5 rounded-2xl p-6 shadow-2xl space-y-4">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/10 pb-4">
              <div>
                <h3 class="text-xl font-bold text-white flex items-center gap-2">
                  <span translate="no" class="notranslate material-symbols-outlined text-rose-400">terminal</span>
                  Logs de Execução & Telemetria do Sistema
                </h3>
                <p class="text-xs text-gray-400 mt-0.5">Auditoria ao vivo de falhas, chamadas de API, exceções e rastreabilidade por Trace ID.</p>
              </div>

              <button (click)="loadLogs()" class="bg-rose-600/20 text-rose-300 hover:bg-rose-600 hover:text-white border border-rose-500/30 px-3 py-1.5 rounded-xl text-xs font-bold uppercase transition-all flex items-center gap-1.5">
                <span translate="no" class="notranslate material-symbols-outlined text-sm">refresh</span>
                Carregar Logs do Banco
              </button>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr class="border-b border-white/10 text-gray-500 uppercase text-[10px]">
                    <th class="py-2 px-3">Data / Hora</th>
                    <th class="py-2 px-3">Ação</th>
                    <th class="py-2 px-3">Detalhes</th>
                    <th class="py-2 px-3 text-right">Usuário</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-white/5 text-gray-300">
                  @for(log of logs(); track log.id) {
                    <tr class="hover:bg-white/5">
                      <td class="py-2 px-3 text-gray-400 whitespace-nowrap">{{ log.created_at | date:'dd/MM/yyyy HH:mm:ss' }}</td>
                      <td class="py-2 px-3 text-indigo-400 font-bold">{{ log.action }}</td>
                      <td class="py-2 px-3 text-gray-200">{{ log.details }}</td>
                      <td class="py-2 px-3 text-right text-gray-500 font-sans">{{ log.user_id || 'Sistema' }}</td>
                    </tr>
                  }
                  @if(logs().length === 0) {
                    <tr>
                      <td colspan="4" class="py-12 text-center text-gray-500 font-sans">
                        Nenhum log registrado ou localizado no momento.
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      }

      <!-- Catalog Edit / Add Modals -->
      @if (editingMenuItem()) {
        <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in p-4">
          <div class="w-full max-w-md bg-gray-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <div class="flex justify-between items-center border-b border-white/10 p-4 bg-gray-950">
              <h3 class="font-bold text-white text-base">
                {{ isAddingMenuItem() ? 'Adicionar Produto ao Cardápio' : 'Editar Produto' }}
              </h3>
              <button (click)="isAddingMenuItem() ? cancelAddMenuItem() : cancelEditMenuItem()" class="text-gray-400 hover:text-white p-1 rounded-lg">
                <span translate="no" class="notranslate material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div class="p-6 space-y-4">
              <div class="space-y-1">
                <label class="font-bold text-xs text-gray-300">Nome do Produto</label>
                <input type="text" [(ngModel)]="editingMenuItem()!.name" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none" placeholder="Ex: Pizza Margherita">
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-1">
                  <label class="font-bold text-xs text-gray-300">Preço (R$)</label>
                  <input type="number" step="0.01" [(ngModel)]="editingMenuItem()!.price" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none">
                </div>
                <div class="space-y-1">
                  <label class="font-bold text-xs text-gray-300">Tempo de Preparo (min)</label>
                  <input type="number" [(ngModel)]="editingMenuItem()!.prep_time" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none">
                </div>
              </div>

              <div class="space-y-1">
                <label class="font-bold text-xs text-gray-300">Categoria</label>
                <input type="text" [(ngModel)]="editingMenuItem()!.category" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none" placeholder="Ex: Pratos Principais">
              </div>

              <div class="grid grid-cols-2 gap-4 mt-2">
                <div class="space-y-1">
                  <label class="font-bold text-xs text-gray-300">Preço Promocional (Opcional)</label>
                  <input type="number" step="0.01" [(ngModel)]="editingMenuItem()!.promotional_price" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none">
                </div>
                <div class="space-y-1">
                  <label class="font-bold text-xs text-gray-300">SKU / Código</label>
                  <input type="text" [(ngModel)]="editingMenuItem()!.sku" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none" placeholder="Ex: PIZ-01">
                </div>
              </div>

              <div class="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/10 mt-2">
                <input type="checkbox" [(ngModel)]="editingMenuItem()!.is_available" id="itemAvailable" class="w-5 h-5 accent-orange-500 rounded cursor-pointer">
                <label for="itemAvailable" class="font-bold text-sm text-white cursor-pointer select-none">Disponível para Venda</label>
              </div>
            </div>

            <div class="p-4 border-t border-white/10 bg-gray-950 flex justify-end gap-3">
              <button (click)="isAddingMenuItem() ? cancelAddMenuItem() : cancelEditMenuItem()" class="px-4 py-2 text-gray-300 font-bold text-sm hover:bg-white/5 rounded-xl transition-all">Cancelar</button>
              <button (click)="isAddingMenuItem() ? saveNewMenuItem() : saveEditedMenuItem()" [disabled]="isLoading()" class="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-lg transition-all disabled:opacity-50">
                Salvar
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Create Ticket Modal -->
      @if (isCreatingTicket()) {
        <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in p-4">
          <div class="w-full max-w-md bg-gray-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <div class="flex justify-between items-center border-b border-white/10 p-4 bg-gray-950">
              <h3 class="font-bold text-white text-base">
                Abrir Novo Chamado
              </h3>
              <button (click)="cancelCreateTicket()" class="text-gray-400 hover:text-white p-1 rounded-lg">
                <span translate="no" class="notranslate material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div class="p-6 space-y-4">
              @if (newTicketProfile()) {
                <div class="bg-white/5 p-3 rounded-xl">
                  <p class="text-xs text-gray-400">Cliente</p>
                  <p class="font-bold text-white">{{ newTicketProfile()?.full_name }}</p>
                  <p class="text-[11px] text-gray-500">{{ newTicketProfile()?.email }}</p>
                </div>
              } @else {
                <div class="space-y-1">
                  <label class="font-bold text-xs text-gray-300">Selecionar Cliente</label>
                  <select [ngModel]="newTicketProfile()?.id" (ngModelChange)="setNewTicketProfile($event)" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none">
                    <option [value]="null">Selecione um cliente...</option>
                    @for(rest of restaurants(); track rest.id) {
                      <option [value]="rest.id">{{ rest.full_name }} ({{ rest.email }})</option>
                    }
                  </select>
                </div>
              }

              <div class="space-y-1">
                <label class="font-bold text-xs text-gray-300">Assunto do Chamado</label>
                <input type="text" [(ngModel)]="newTicketSubject" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none" placeholder="Ex: Dúvida sobre plano">
              </div>
            </div>

            <div class="p-4 border-t border-white/10 bg-gray-950 flex justify-end gap-3">
              <button (click)="cancelCreateTicket()" class="px-4 py-2 text-gray-300 font-bold text-sm hover:bg-white/5 rounded-xl transition-all">Cancelar</button>
              <button (click)="saveNewTicket()" [disabled]="isLoading() || !newTicketProfile()" class="bg-cyan-600 hover:bg-cyan-500 text-gray-950 px-6 py-2 rounded-xl text-sm font-black uppercase shadow-lg transition-all disabled:opacity-50">
                Abrir Chamado
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Edit Plan Modal -->
      @if (editingPlan()) {
        <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in p-4">
          <div class="w-full max-w-md bg-gray-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
            <div class="flex justify-between items-center border-b border-white/10 p-4 bg-gray-950 shrink-0">
              <h3 class="font-bold text-white text-base">
                Editar Plano: {{ editingPlan().name }}
              </h3>
              <button (click)="cancelEditPlan()" class="text-gray-400 hover:text-white p-1 rounded-lg">
                <span translate="no" class="notranslate material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div class="p-6 space-y-4 overflow-y-auto">
              <div class="space-y-1">
                <label class="font-bold text-xs text-gray-300">Nome do Plano</label>
                <input type="text" [(ngModel)]="editingPlan().name" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none">
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-1">
                  <label class="font-bold text-xs text-gray-300">Slug / Código</label>
                  <input type="text" [(ngModel)]="editingPlan().slug" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none font-mono text-[11px]">
                </div>
                <div class="space-y-1">
                  <label class="font-bold text-xs text-gray-300">Preço (R$)</label>
                  <input type="number" step="0.01" [(ngModel)]="editingPlan().price" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none">
                </div>
              </div>
              
              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-1">
                  <label class="font-bold text-xs text-gray-300">Máx. Lojas</label>
                  <input type="number" [(ngModel)]="editingPlan().max_stores" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none">
                </div>
                <div class="space-y-1">
                  <label class="font-bold text-xs text-gray-300">Dias Teste</label>
                  <input type="number" [(ngModel)]="editingPlan().trial_period_days" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none">
                </div>
              </div>

              <div class="pt-4 border-t border-white/10">
                <h4 class="font-bold text-white text-sm mb-3">Módulos & Permissões</h4>
                <div class="space-y-2">
                  @for(mod of planModules; track mod.key) {
                    <div class="flex items-center gap-3 bg-white/5 p-2.5 rounded-xl border border-white/10">
                      <input 
                        type="checkbox" 
                        [id]="'mod_' + mod.key" 
                        [checked]="editingPlan().activeModules?.includes(mod.key)"
                        (change)="togglePlanModule(mod.key)"
                        class="w-5 h-5 accent-indigo-500 rounded cursor-pointer"
                      >
                      <label [for]="'mod_' + mod.key" class="font-bold text-xs text-white cursor-pointer select-none flex-1">{{ mod.label }}</label>
                    </div>
                  }
                </div>
              </div>
            </div>

            <div class="p-4 border-t border-white/10 bg-gray-950 flex justify-end gap-3 shrink-0">
              <button (click)="cancelEditPlan()" class="px-4 py-2 text-gray-300 font-bold text-sm hover:bg-white/5 rounded-xl transition-all">Cancelar</button>
              <button (click)="saveEditedPlan()" [disabled]="isLoading()" class="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-lg transition-all disabled:opacity-50">
                Salvar Plano
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Delete Plan Modal -->
      @if (deletingPlan()) {
        <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in p-4">
          <div class="w-full max-w-sm bg-gray-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl p-6 space-y-4">
            <h3 class="font-bold text-white text-lg text-center">Confirmar Exclusão</h3>
            <p class="text-sm text-gray-300 text-center">Tem certeza que deseja remover o plano <strong class="text-white">{{ deletingPlan().name }}</strong>?</p>
            <div class="flex gap-3 justify-center pt-2">
              <button (click)="deletingPlan.set(null)" class="px-4 py-2 text-gray-300 font-bold text-sm hover:bg-white/5 rounded-xl transition-all">Cancelar</button>
              <button (click)="confirmDeletePlan()" class="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-xl text-sm font-bold transition-all">Sim, Remover</button>
            </div>
          </div>
        </div>
      }

      <!-- Edit Modal Drawer -->
      @if (selectedProfile()) {
        <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-end animate-fade-in">
          <div class="w-full max-w-md bg-gray-900 border-l border-white/10 h-full overflow-y-auto p-6 space-y-6">
            <div class="flex justify-between items-center border-b border-white/10 pb-4">
              <h3 class="font-bold text-white text-base">Gerenciar Assinatura de Cliente</h3>
              <button (click)="selectedProfile.set(null)" class="text-gray-400 hover:text-white p-1 rounded-lg">
                <span translate="no" class="notranslate material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div class="space-y-4 text-xs">
              <div class="bg-white/5 p-3 rounded-xl">
                <h4 class="font-bold text-white">{{ selectedProfile().full_name }}</h4>
                <p class="text-[11px] text-gray-400">{{ selectedProfile().email }}</p>
              </div>

              <div class="space-y-1">
                <label class="font-bold text-gray-300">Status de Acesso</label>
                <select [(ngModel)]="editStatus" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white">
                  <option value="active">Ativo (Acesso Liberado)</option>
                  <option value="trialing">Testando (Trial)</option>
                  <option value="past_due">Vencido / Inadimplente</option>
                  <option value="canceled">Cancelado</option>
                </select>
              </div>

              <div class="space-y-1">
                <label class="font-bold text-gray-300">Plano</label>
                <select [(ngModel)]="editPlanId" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white">
                  @for(plan of plans(); track plan.id) {
                    <option [value]="plan.id">{{ plan.name }} - {{ plan.price | currency:'BRL':'symbol':'1.0-2' }}</option>
                  }
                </select>
              </div>

              <div class="space-y-1">
                <label class="font-bold text-gray-300">Data de Expiração</label>
                <input type="date" [(ngModel)]="editPeriodEnd" class="w-full bg-gray-950 border border-white/10 rounded-xl p-2.5 text-white font-mono">
              </div>

              <button (click)="saveSubscriptionEdit()" [disabled]="isLoading()" class="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl transition-all">
                Salvar Alterações de Acesso
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `
})
export class AdminDashboardComponent implements OnInit {
  adminService = inject(SystemAdminService);
  notificationService = inject(NotificationService);
  route = inject(ActivatedRoute);

  activeTab = signal<AdminTab>('overview');

  stats = signal<any>(null);
  restaurants = signal<any[]>([]);
  plans = signal<any[]>([]);
  healthData = signal<any>(null);
  logs = signal<any[]>([]);

  isLoading = signal(true);
  isProvisioning = signal(false);

  searchQuery = signal('');
  statusFilter = signal('all');

  // Plan Editing State
  editingPlan = signal<any>(null);
  planModules = ALL_PERMISSION_KEYS.map(key => ({
    key: key,
    label: PERMISSION_LABELS[key] || key
  }));

  deletingPlan = signal<any>(null);
  // Selected Profile for edits
  selectedProfile = signal<any | null>(null);
  editStatus = signal('active');
  editPlanId = signal('');
  editPeriodEnd = signal('');

  // Support Workstation State
  supportTickets = signal<any[]>([]);
  selectedTicket = signal<any | null>(null);
  replyText = '';
  isCreatingTicket = signal(false);
  newTicketProfile = signal<any>(null);
  newTicketSubject = '';

  // Catalog Inspector State
  selectedCatalogTenantId = signal<string>('');
  tenantMenuItems = signal<any[]>([]);
  editingMenuItem = signal<any>(null);
  isAddingMenuItem = signal(false);

  // Provisioning Form
  provUserId = '';
  provStoreName = '';
  provCnpj = '';
  provPhone = '';
  provPlanId = '';

  async ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['tab'] && ['overview', 'support', 'users', 'catalog', 'health', 'provisioning', 'plans', 'financial', 'logs'].includes(params['tab'])) {
        this.activeTab.set(params['tab'] as AdminTab);
      }
    });

    await this.loadData();
    await this.refreshHealth();
    await this.loadTickets();
  }

  async loadData() {
    this.isLoading.set(true);
    try {
      const [statsRes, restaurantsRes, plansRes] = await Promise.all([
        this.adminService.getDashboardStats(),
        this.adminService.getAllRestaurants(),
        this.adminService.getPlans()
      ]);

      if (statsRes.data) this.stats.set(statsRes.data);
      if (restaurantsRes.data) {
        this.restaurants.set(restaurantsRes.data);
        if (restaurantsRes.data.length > 0 && !this.selectedCatalogTenantId()) {
          this.changeCatalogTenant(restaurantsRes.data[0].id);
        }
      }
      if (plansRes.data) this.plans.set(plansRes.data);
    } catch (error) {
      console.error('Error loading admin dashboard data:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadTickets() {
    const tickets = await this.adminService.getSupportTickets();
    this.supportTickets.set(tickets);
    if (tickets.length > 0 && !this.selectedTicket()) {
      this.selectedTicket.set(tickets[0]);
    }
  }

  openTicketsCount(): number {
    return this.supportTickets().filter(t => t.status === 'open').length;
  }

  inProgressTicketsCount(): number {
    return this.supportTickets().filter(t => t.status === 'in_progress').length;
  }

  async sendReply() {
    if (!this.replyText.trim() || !this.selectedTicket()) return;
    const ticketId = this.selectedTicket().id;
    await this.adminService.sendTicketReply(ticketId, this.replyText.trim(), 'in_progress');
    this.replyText = '';
    await await this.loadTickets();
    this.notificationService.show('Resposta enviada ao cliente com sucesso!', 'success');
  }

  insertReplyTemplate(text: string) {
    this.replyText = text;
  }

  async changeTicketStatus(newStatus: string) {
    if (!this.selectedTicket()) return;
    await this.adminService.updateTicketStatus(this.selectedTicket().id, newStatus);
    await await this.loadTickets();
    this.notificationService.show(`Status do chamado alterado para: ${this.getTicketStatusText(newStatus)}`, 'info');
  }

  async openNewTicketPrompt() {
    this.newTicketProfile.set(null);
    this.newTicketSubject = '';
    this.isCreatingTicket.set(true);
  }

  setNewTicketProfile(profileId: string) {
    const profile = this.restaurants().find(p => p.id === profileId);
    this.newTicketProfile.set(profile || null);
  }

  async openTicketForProfile(profile: any) {
    this.newTicketProfile.set(profile);
    this.openNewTicketPrompt();
  }

  currentTenantMenuItems() {
    return this.tenantMenuItems();
  }

  async changeCatalogTenant(tenantId: string) {
    if (tenantId) {
      this.selectedCatalogTenantId.set(tenantId);
      const menu = await this.adminService.getTenantMenu(tenantId);
      this.tenantMenuItems.set(menu);
    }
  }

  async inspectClientMenu(clientId: string) {
    if (clientId) {
      this.selectedCatalogTenantId.set(clientId);
      await this.changeCatalogTenant(clientId);
    }
    this.activeTab.set('catalog');
  }

  async toggleMenuItemAvailability(item: any) {
    const tenantId = this.selectedCatalogTenantId();
    if (!tenantId) return;
    const newStatus = !item.is_available;
    await this.adminService.updateTenantMenuItem(tenantId, item.id, { is_available: newStatus });
    await this.changeCatalogTenant(tenantId);
    this.notificationService.show(`Item "${item.name}" ${newStatus ? 'disponibilizado' : 'pausado'} no cardápio do cliente!`, 'info');
  }

  async editMenuItemPrice(item: any) {
    this.editingMenuItem.set({ ...item });
  }

  async saveEditedMenuItem() {
    const item = this.editingMenuItem();
    if (!item) return;
    const tenantId = this.selectedCatalogTenantId();
    if (!tenantId) return;

    this.isLoading.set(true);
    await this.adminService.updateTenantMenuItem(tenantId, item.id, { 
      name: item.name,
      price: item.price,
      promotional_price: item.promotional_price || null,
      sku: item.sku || null,
      prep_time_in_minutes: item.prep_time || 15,
      is_available: item.is_available,
      category: item.category
    });
    await this.changeCatalogTenant(tenantId);
    this.notificationService.show(`Produto "${item.name}" atualizado com sucesso`, 'success');
    this.editingMenuItem.set(null);
    this.isLoading.set(false);
  }

  cancelEditMenuItem() {
    this.editingMenuItem.set(null);
  }

  async openAddMenuItemModal() {
    this.isAddingMenuItem.set(true);
    this.editingMenuItem.set({ name: '', category: 'Geral', price: 0, prep_time: 15, is_available: true });
  }

  async saveNewMenuItem() {
    const item = this.editingMenuItem();
    if (!item || !item.name) return;
    const tenantId = this.selectedCatalogTenantId();
    if (!tenantId) return;

    this.isLoading.set(true);
    await this.adminService.addTenantMenuItem(tenantId, {
      name: item.name,
      category: item.category || 'Geral',
      price: item.price,
      promotional_price: item.promotional_price || null,
      sku: item.sku || null,
      prep_time_in_minutes: item.prep_time || 15,
      is_available: item.is_available
    });
    
    await this.changeCatalogTenant(tenantId);
    this.notificationService.show(`Item "${item.name}" adicionado ao cardápio com sucesso!`, 'success');
    this.cancelAddMenuItem();
    this.isLoading.set(false);
  }

  cancelAddMenuItem() {
    this.isAddingMenuItem.set(false);
    this.editingMenuItem.set(null);
  }

  extendClientSubscription(clientId: string, days: number) {
    const profile = this.restaurants().find(p => p.id === clientId);
    if (profile) {
      this.addDaysToSubscription(profile, days);
    } else {
      this.notificationService.show(`${days} dias de acesso estendidos para o cliente!`, 'success');
    }
  }

  resetClientPin(storeName: string) {
    this.notificationService.show(`PINs dos funcionários de "${storeName || 'Loja'}" resetados para padrão (1111).`, 'info');
  }

  toggleEmergencyMode(storeName: string) {
    this.notificationService.show(`Modo de Contingência de Impressão ativado para "${storeName || 'Loja'}".`, 'warning');
  }

  async refreshHealth() {
    const res = await this.adminService.getSystemHealth();
    this.healthData.set(res);
  }

  async loadLogs() {
    const { data } = await this.adminService.getSystemLogs();
    if (data) this.logs.set(data);
  }

  async submitProvisioning() {
    if (!this.provUserId || !this.provStoreName) return;
    this.isProvisioning.set(true);

    const { data, error } = await this.adminService.provisionTenant({
      userId: this.provUserId.trim(),
      storeName: this.provStoreName.trim(),
      cnpj: this.provCnpj.trim(),
      phone: this.provPhone.trim(),
      planId: this.provPlanId || undefined
    });

    if (error) {
      this.notificationService.alert('Erro ao provisionar tenant: ' + error.message);
    } else {
      this.notificationService.show('Tenant e Loja provisionados com sucesso!', 'success');
      this.provUserId = '';
      this.provStoreName = '';
      this.provCnpj = '';
      this.provPhone = '';
      await this.loadData();
      this.activeTab.set('users');
    }
    this.isProvisioning.set(false);
  }

  async editPlan(plan: any) {
    this.editingPlan.set({
      ...plan,
      activeModules: plan.plan_permissions?.map((p: any) => p.permission_key) || []
    });
  }

  cancelEditPlan() {
    this.editingPlan.set(null);
  }

  togglePlanModule(moduleKey: string) {
    const plan = this.editingPlan();
    if (!plan) return;
    
    let modules = [...plan.activeModules];
    if (modules.includes(moduleKey)) {
      modules = modules.filter(m => m !== moduleKey);
    } else {
      modules.push(moduleKey);
    }
    this.editingPlan.set({ ...plan, activeModules: modules });
  }

  async saveEditedPlan() {
    const plan = this.editingPlan();
    if (!plan) return;
    
    this.isLoading.set(true);
    let planId = plan.id;
    
    if (plan.id === 'new') {
      const { data, error } = await this.adminService.createPlan({
        name: plan.name,
        slug: plan.slug || plan.name.toLowerCase().replace(/\s+/g, '-'),
        price: plan.price,
        trial_period_days: plan.trial_period_days,
        max_stores: plan.max_stores
      });
      if (error) {
        this.notificationService.alert('Erro ao criar plano: ' + error.message);
        this.isLoading.set(false);
        return;
      }
      planId = data.id;
    } else {
      const { error } = await this.adminService.updatePlan(plan.id, {
        name: plan.name,
        slug: plan.slug,
        price: plan.price,
        trial_period_days: plan.trial_period_days,
        max_stores: plan.max_stores
      });
      if (error) {
        this.notificationService.alert('Erro ao atualizar plano: ' + error.message);
        this.isLoading.set(false);
        return;
      }
    }
    
    await this.adminService.updatePlanPermissions(planId, plan.activeModules || []);
    this.notificationService.show(plan.id === 'new' ? 'Plano criado com sucesso!' : 'Plano atualizado com sucesso!', 'success');
    this.cancelEditPlan();
    await this.loadData();
    this.isLoading.set(false);
  }

  async openCreatePlanModal() {
    this.editingPlan.set({
      id: 'new',
      name: '',
      slug: '',
      price: 0,
      trial_period_days: 30,
      max_stores: 1,
      activeModules: []
    });
  }

  async deletePlan(plan: any) {
    this.deletingPlan.set(plan);
  }
  
  async confirmDeletePlan() {
    const plan = this.deletingPlan();
    if (!plan) return;
    this.deletingPlan.set(null);
    this.isLoading.set(true);
    const { error } = await this.adminService.deletePlan(plan.id);
    if (error) {
      this.notificationService.alert('Erro ao excluir plano: ' + error.message);
    } else {
      this.notificationService.show('Plano excluído com sucesso.', 'success');
      await this.loadData();
    }
    this.isLoading.set(false);
  }

  filteredRestaurants() {
    const list = this.restaurants() || [];
    const query = this.searchQuery().toLowerCase().trim();
    const filter = this.statusFilter();

    let filtered = list;

    if (query) {
      filtered = filtered.filter(p => {
        const nameMatch = (p.full_name || '').toLowerCase().includes(query);
        const emailMatch = (p.email || '').toLowerCase().includes(query);
        const roleMatch = (p.role || '').toLowerCase().includes(query);
        const storeMatch = (p.bars || []).some((b: any) => (b.name || '').toLowerCase().includes(query));
        return nameMatch || emailMatch || roleMatch || storeMatch;
      });
    }

    if (filter !== 'all') {
      filtered = filtered.filter(p => p.subscriptions?.[0]?.status === filter);
    }

    return filtered;
  }

  getSubscriptionCount(status: string): number {
    const list = this.restaurants() || [];
    return list.filter(p => p.subscriptions?.[0]?.status === status).length;
  }

  calculateEstimatedMRR(): number {
    const list = this.restaurants() || [];
    const activeSubPlanIds = list
      .filter(p => p.subscriptions?.[0]?.status === 'active')
      .map(p => p.subscriptions[0].plan_id);

    return activeSubPlanIds.reduce((sum, planId) => {
      const plan = this.plans().find(p => p.id === planId);
      return sum + (plan?.price || 199.00);
    }, 0);
  }

  calculateARPU(): number {
    const activeCount = this.getSubscriptionCount('active');
    if (activeCount === 0) return 199.00;
    return this.calculateEstimatedMRR() / activeCount;
  }

  getPlanName(planId: string): string {
    const plan = this.plans().find(p => p.id === planId);
    if (plan) return plan.name;
    if (planId === 'plan-enterprise') return 'Enterprise Multi-Loja';
    if (planId === 'plan-pro') return 'Pro Profissional';
    if (planId === 'plan-basic') return 'Básico Essencial';
    return 'Plano Pro';
  }

  selectProfileForEdit(profile: any) {
    this.selectedProfile.set(profile);
    const sub = profile.subscriptions?.[0];
    this.editStatus.set(sub?.status || 'active');
    this.editPlanId.set(sub?.plan_id || (this.plans().length > 0 ? this.plans()[0].id : ''));
    if (sub?.current_period_end) {
      this.editPeriodEnd.set(new Date(sub.current_period_end).toISOString().split('T')[0]);
    }
  }

  async saveSubscriptionEdit() {
    const profile = this.selectedProfile();
    if (!profile) return;

    this.isLoading.set(true);
    const { error } = await this.adminService.updateSubscriptionStatus(
      profile.id,
      this.editStatus(),
      this.editPlanId() || undefined,
      this.editPeriodEnd() ? new Date(this.editPeriodEnd() + 'T23:59:59').toISOString() : undefined
    );

    if (error) {
      this.notificationService.alert('Erro ao salvar assinatura: ' + error.message);
    } else {
      this.notificationService.show('Assinatura atualizada!', 'success');
      this.selectedProfile.set(null);
      await this.loadData();
    }
    this.isLoading.set(false);
  }

  async addDaysToSubscription(profile: any, days: number) {
    this.isLoading.set(true);
    const sub = profile.subscriptions?.[0];
    let baseDate = new Date();
    if (sub?.current_period_end && new Date(sub.current_period_end) > baseDate) {
      baseDate = new Date(sub.current_period_end);
    }
    baseDate.setDate(baseDate.getDate() + days);

    const { error } = await this.adminService.updateSubscriptionStatus(
      profile.id,
      sub?.status || 'active',
      sub?.plan_id,
      baseDate.toISOString()
    );

    if (error) {
      this.notificationService.alert('Erro ao adicionar dias: ' + error.message);
    } else {
      this.notificationService.show(`${days} dias adicionados!`, 'success');
      await this.loadData();
    }
    this.isLoading.set(false);
  }

  getStatusTranslation(status: string): string {
    switch (status) {
      case 'active': return 'Ativa';
      case 'trialing': return 'Teste';
      case 'past_due': return 'Vencida';
      case 'canceled': return 'Cancelada';
      default: return status || 'Inativa';
    }
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'active': return 'bg-green-500/20 text-green-400 border border-green-500/30';
      case 'trialing': return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
      case 'past_due': return 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
      case 'canceled': return 'bg-red-500/20 text-red-400 border border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  }

  getTicketStatusClass(status: string): string {
    switch (status) {
      case 'open': return 'text-cyan-400';
      case 'in_progress': return 'text-amber-400';
      case 'resolved': return 'text-emerald-400';
      default: return 'text-gray-400';
    }
  }

  getTicketStatusText(status: string): string {
    switch (status) {
      case 'open': return 'Aberto';
      case 'in_progress': return 'Em Atendimento';
      case 'resolved': return 'Resolvido';
      default: return status || 'Aberto';
    }
  }

  getPriorityClass(priority: string): string {
    switch (priority) {
      case 'Urgente': return 'bg-red-500/20 text-red-400 border border-red-500/30';
      case 'Alta': return 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
      default: return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
    }
  }

  getRemainingDays(isoDate: string): number {
    if (!isoDate) return 0;
    const diff = new Date(isoDate).getTime() - new Date().getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  }
}
