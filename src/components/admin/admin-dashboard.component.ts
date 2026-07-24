import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { SystemAdminService } from '../../services/system-admin.service';
import { NotificationService } from '../../services/notification.service';

export type AdminTab = 'overview' | 'health' | 'users' | 'provisioning' | 'plans' | 'financial' | 'logs';

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
            <h2 class="text-2xl font-black tracking-tight text-white">Painel de Controle Master SaaS</h2>
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase tracking-widest">
              v2.1 Enterprise
            </span>
          </div>
          <p class="text-xs text-gray-400 mt-1">
            Monitoramento de saúde, usuários, provisionamento automático, gestão financeira, planos e telemetria do sistema.
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
          (click)="activeTab.set('users')" 
          [class]="activeTab() === 'users' ? 'bg-purple-600 text-white font-bold shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'"
          class="px-4 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap"
        >
          <span translate="no" class="notranslate material-symbols-outlined text-sm text-blue-400">group</span>
          Usuários & Lojas ({{ restaurants().length }})
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

          <!-- Quick Shortcuts & System Status Summary -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 bg-gray-900/50 border border-white/5 rounded-2xl p-6 space-y-4">
              <h3 class="text-lg font-bold text-white flex items-center gap-2">
                <span translate="no" class="notranslate material-symbols-outlined text-purple-400">rocket_launch</span>
                Ações Rápidas de Administração
              </h3>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button (click)="activeTab.set('provisioning')" class="bg-purple-600/10 hover:bg-purple-600 text-purple-300 hover:text-white border border-purple-500/30 p-4 rounded-xl text-left transition-all group">
                  <span translate="no" class="notranslate material-symbols-outlined text-2xl mb-2 text-purple-400 group-hover:text-white">add_business</span>
                  <div class="font-bold text-sm">Provisionar Novo Tenant</div>
                  <div class="text-[11px] text-gray-400 group-hover:text-purple-100 mt-1">Criar loja com chaves de API, salão e trial em 1 clique</div>
                </button>

                <button (click)="activeTab.set('plans')" class="bg-indigo-600/10 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 p-4 rounded-xl text-left transition-all group">
                  <span translate="no" class="notranslate material-symbols-outlined text-2xl mb-2 text-indigo-400 group-hover:text-white">card_membership</span>
                  <div class="font-bold text-sm">Gerenciar Planos SaaS</div>
                  <div class="text-[11px] text-gray-400 group-hover:text-indigo-100 mt-1">Ajustar preços, recursos e limites de lojas por plano</div>
                </button>

                <button (click)="activeTab.set('logs')" class="bg-rose-600/10 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 p-4 rounded-xl text-left transition-all group">
                  <span translate="no" class="notranslate material-symbols-outlined text-2xl mb-2 text-rose-400 group-hover:text-white">terminal</span>
                  <div class="font-bold text-sm">Auditoria & Telemetria</div>
                  <div class="text-[11px] text-gray-400 group-hover:text-rose-100 mt-1">Inspecionar falhas, erros de API e logs em tempo real</div>
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

      <!-- TAB 2: SAÚDE & OBSERVABILIDADE -->
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

              <!-- Integration Key Status Checklist -->
              <div class="space-y-3 pt-2">
                <h4 class="text-sm font-bold text-white flex items-center gap-2">
                  <span translate="no" class="notranslate material-symbols-outlined text-indigo-400">extension</span>
                  Status das Integrações Externas
                </h4>

                <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <div class="bg-white/5 border border-white/5 p-3 rounded-xl">
                    <div class="text-[10px] uppercase font-bold text-gray-400">Mercado Pago</div>
                    <div [class]="healthData().checks?.integrations?.details?.mercadoPago ? 'text-green-400' : 'text-gray-500'" class="text-xs font-extrabold mt-1">
                      {{ healthData().checks?.integrations?.details?.mercadoPago ? '● Configurado' : '○ Não Configurado' }}
                    </div>
                  </div>

                  <div class="bg-white/5 border border-white/5 p-3 rounded-xl">
                    <div class="text-[10px] uppercase font-bold text-gray-400">Focus NFe (Fiscal)</div>
                    <div [class]="healthData().checks?.integrations?.details?.focusNFe ? 'text-green-400' : 'text-gray-500'" class="text-xs font-extrabold mt-1">
                      {{ healthData().checks?.integrations?.details?.focusNFe ? '● Configurado' : '○ Não Configurado' }}
                    </div>
                  </div>

                  <div class="bg-white/5 border border-white/5 p-3 rounded-xl">
                    <div class="text-[10px] uppercase font-bold text-gray-400">iFood Webhooks</div>
                    <div [class]="healthData().checks?.integrations?.details?.iFood ? 'text-green-400' : 'text-gray-500'" class="text-xs font-extrabold mt-1">
                      {{ healthData().checks?.integrations?.details?.iFood ? '● Configurado' : '○ Não Configurado' }}
                    </div>
                  </div>

                  <div class="bg-white/5 border border-white/5 p-3 rounded-xl">
                    <div class="text-[10px] uppercase font-bold text-gray-400">Cielo E-commerce/LIO</div>
                    <div [class]="healthData().checks?.integrations?.details?.cielo ? 'text-green-400' : 'text-gray-500'" class="text-xs font-extrabold mt-1">
                      {{ healthData().checks?.integrations?.details?.cielo ? '● Configurado' : '○ Não Configurado' }}
                    </div>
                  </div>

                  <div class="bg-white/5 border border-white/5 p-3 rounded-xl">
                    <div class="text-[10px] uppercase font-bold text-gray-400">WhatsApp API</div>
                    <div [class]="healthData().checks?.integrations?.details?.whatsApp ? 'text-green-400' : 'text-gray-500'" class="text-xs font-extrabold mt-1">
                      {{ healthData().checks?.integrations?.details?.whatsApp ? '● Configurado' : '○ Não Configurado' }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- Process & Runtime stats -->
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-white/5 pt-4">
                <div class="p-3 bg-white/5 rounded-xl">
                  <span class="text-[10px] text-gray-400 uppercase font-bold block">Uptime do Servidor</span>
                  <span class="text-sm font-mono font-bold text-white">{{ (healthData().system?.uptimeSeconds / 60) | number:'1.0-1' }} minutos</span>
                </div>

                <div class="p-3 bg-white/5 rounded-xl">
                  <span class="text-[10px] text-gray-400 uppercase font-bold block">Uso de Memória RAM (RSS)</span>
                  <span class="text-sm font-mono font-bold text-white">{{ healthData().system?.memoryUsageMB }} MB</span>
                </div>

                <div class="p-3 bg-white/5 rounded-xl">
                  <span class="text-[10px] text-gray-400 uppercase font-bold block">Conformidade SLO</span>
                  <span class="text-sm font-mono font-bold text-emerald-400">{{ healthData().sloStatus }}</span>
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

      <!-- TAB 3: GESTÃO DE USUÁRIOS & LOJAS -->
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
                    <th class="pb-3 text-right">Ações</th>
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
                            <p class="text-[11px] text-gray-500 truncate">{{ profile.role || 'Proprietário' }}</p>
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

      <!-- TAB 4: PROVISIONAMENTO AUTOMÁTICO -->
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
                placeholder="ex: Bisto Gourmet - Unidade Matriz" 
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

      <!-- TAB 5: PLANOS & PREÇOS (SaaS) -->
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

                  <div class="pt-4 border-t border-white/5 flex gap-2">
                    <button (click)="deletePlan(plan)" class="text-red-400 hover:text-red-300 text-xs p-2 rounded-xl hover:bg-red-500/10 transition-all">
                      Remover
                    </button>
                  </div>
                </div>
              }
            </div>
          </div>
        </div>
      }

      <!-- TAB 6: FINANCEIRO SAAS -->
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

      <!-- TAB 7: LOGS & TELEMETRIA DO SISTEMA -->
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

      <!-- Edit Modal Drawer -->
      @if (selectedProfile()) {
        <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-end animate-fade-in">
          <div class="w-full max-w-md bg-gray-900 border-l border-white/10 h-full overflow-y-auto p-6 space-y-6">
            <div class="flex justify-between items-center border-b border-white/10 pb-4">
              <h3 class="font-bold text-white text-base">Gerenciar Assinatura</h3>
              <button (click)="selectedProfile.set(null)" class="text-gray-400 hover:text-white p-1 rounded-lg">
                <span translate="no" class="notranslate material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div class="space-y-4 text-xs">
              <div class="bg-white/5 p-3 rounded-xl">
                <h4 class="font-bold text-white">{{ selectedProfile().full_name }}</h4>
                <p class="text-[11px] text-gray-400">{{ selectedProfile().role }}</p>
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

              <button (click)="saveSubscriptionEdit()" [disabled]="isLoading()" class="w-full bg-brand hover:bg-brand/90 text-white font-bold py-3 rounded-xl transition-all">
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

  // Selected Profile for edits
  selectedProfile = signal<any | null>(null);
  editStatus = signal('active');
  editPlanId = signal('');
  editPeriodEnd = signal('');

  // Provisioning Form
  provUserId = '';
  provStoreName = '';
  provCnpj = '';
  provPhone = '';
  provPlanId = '';

  async ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['tab'] && ['overview', 'health', 'users', 'provisioning', 'plans', 'financial', 'logs'].includes(params['tab'])) {
        this.activeTab.set(params['tab'] as AdminTab);
      }
    });

    await this.loadData();
    await this.refreshHealth();
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
      if (restaurantsRes.data) this.restaurants.set(restaurantsRes.data);
      if (plansRes.data) this.plans.set(plansRes.data);
    } catch (error) {
      console.error('Error loading admin dashboard data:', error);
    } finally {
      this.isLoading.set(false);
    }
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

  async openCreatePlanModal() {
    const name = prompt('Nome do Plano (ex: Pro Mensal):');
    if (!name) return;
    const slug = prompt('Slug do Plano (ex: pro-mensal):', name.toLowerCase().replace(/\s+/g, '-'));
    const price = parseFloat(prompt('Preço Mensal R$:', '199.00') || '0');

    const { error } = await this.adminService.createPlan({
      name,
      slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
      price,
      trial_period_days: 30,
      max_stores: 3
    });

    if (error) {
      this.notificationService.alert('Erro ao criar plano: ' + error.message);
    } else {
      this.notificationService.show('Novo plano cadastrado!', 'success');
      await this.loadData();
    }
  }

  async deletePlan(plan: any) {
    if (confirm(`Remover o plano ${plan.name}?`)) {
      const { error } = await this.adminService.deletePlan(plan.id);
      if (error) {
        this.notificationService.alert('Erro ao excluir plano: ' + error.message);
      } else {
        this.notificationService.show('Plano excluído com sucesso.', 'success');
        await this.loadData();
      }
    }
  }

  filteredRestaurants() {
    const list = this.restaurants() || [];
    const query = this.searchQuery().toLowerCase().trim();
    const filter = this.statusFilter();

    let filtered = list;

    if (query) {
      filtered = filtered.filter(p => {
        const nameMatch = (p.full_name || '').toLowerCase().includes(query);
        const roleMatch = (p.role || '').toLowerCase().includes(query);
        const storeMatch = (p.bars || []).some((b: any) => (b.name || '').toLowerCase().includes(query));
        return nameMatch || roleMatch || storeMatch;
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
      return sum + (plan?.price || 0);
    }, 0);
  }

  calculateARPU(): number {
    const activeCount = this.getSubscriptionCount('active');
    if (activeCount === 0) return 0;
    return this.calculateEstimatedMRR() / activeCount;
  }

  getPlanName(planId: string): string {
    const plan = this.plans().find(p => p.id === planId);
    return plan ? plan.name : 'Personalizado';
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

  getRemainingDays(isoDate: string): number {
    if (!isoDate) return 0;
    const diff = new Date(isoDate).getTime() - new Date().getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  }
}
