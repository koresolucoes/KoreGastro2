import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SystemAdminService } from '../../services/system-admin.service';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="animate-fade-in-up space-y-6">
      <!-- Title & Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 class="text-2xl font-black tracking-tight text-white mb-1">Gestão de Assinaturas & Painel Admin</h2>
          <p class="text-sm text-gray-400">Ative, cancele, gerencie planos e estenda períodos de teste dos restaurantes cadastrados.</p>
        </div>
        <button (click)="loadData()" [disabled]="isLoading()" class="bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 hover:border-gray-600 px-4 py-2 rounded-xl text-xs font-semibold tracking-wider uppercase transition-all flex items-center justify-center gap-2">
          <span translate="no" class="notranslate material-symbols-outlined text-[16px]" [class.animate-spin]="isLoading()">sync</span>
          Atualizar Dados
        </button>
      </div>
      
      <!-- Metrics overview -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <!-- Total Registries -->
        <div class="bg-gray-900/60 backdrop-blur border border-white/5 rounded-2xl p-5 shadow-lg">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">Total de Clientes</span>
            <div class="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <span translate="no" class="notranslate material-symbols-outlined text-lg">groups</span>
            </div>
          </div>
          <p class="text-2xl font-black text-white">
            @if(isLoading()) { <span class="animate-pulse">...</span> } @else { {{ restaurants().length }} }
          </p>
          <div class="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
            <span class="text-indigo-400 font-bold">●</span> Contas registradas na plataforma
          </div>
        </div>

        <!-- Active Subscriptions -->
        <div class="bg-gray-900/60 backdrop-blur border border-white/5 rounded-2xl p-5 shadow-lg">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">Assinaturas Ativas</span>
            <div class="w-8 h-8 rounded-lg bg-green-500/10 text-green-400 flex items-center justify-center">
              <span translate="no" class="notranslate material-symbols-outlined text-lg">check_circle</span>
            </div>
          </div>
          <p class="text-2xl font-black text-white">
            @if(isLoading()) { <span class="animate-pulse">...</span> } @else { {{ getSubscriptionCount('active') }} }
          </p>
          <div class="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
            <span class="text-green-400 font-bold">●</span> Assinantes com acesso irrestrito
          </div>
        </div>

        <!-- Trial / Past Due Counter -->
        <div class="bg-gray-900/60 backdrop-blur border border-white/5 rounded-2xl p-5 shadow-lg">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">Testes / Pendentes</span>
            <div class="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <span translate="no" class="notranslate material-symbols-outlined text-lg"> Hourglass_Top </span>
            </div>
          </div>
          <p class="text-2xl font-black text-white">
            @if(isLoading()) { <span class="animate-pulse">...</span> } @else { {{ getSubscriptionCount('trialing') + getSubscriptionCount('past_due') }} }
          </p>
          <div class="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
            <span class="text-amber-400 font-bold">●</span> {{ getSubscriptionCount('trialing') }} testando e {{ getSubscriptionCount('past_due') }} expirado/pendente
          </div>
        </div>

        <!-- MRR Estimado -->
        <div class="bg-gray-900/60 backdrop-blur border border-white/5 rounded-2xl p-5 shadow-lg">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">MRR Estimado</span>
            <div class="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <span translate="no" class="notranslate material-symbols-outlined text-lg">payments</span>
            </div>
          </div>
          <p class="text-2xl font-black text-white">
            @if(isLoading()) { <span class="animate-pulse">...</span> } @else { {{ calculateEstimatedMRR() | currency:'BRL':'symbol':'1.2-2' }} }
          </p>
          <div class="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
            <span class="text-emerald-400 font-bold">●</span> Com base no preço dos planos ativos
          </div>
        </div>
      </div>

      <!-- Search, Controls and List Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        <!-- Interactive List Panel -->
        <div class="lg:col-span-2 bg-gray-900/40 border border-white/5 rounded-2xl overflow-hidden shadow-2xl space-y-4 p-4 md:p-6">
          
          <!-- Filter elements -->
          <div class="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center">
            <div class="relative flex-1">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 translate-y-[-50%]">
                <span translate="no" class="notranslate material-symbols-outlined text-sm">search</span>
              </span>
              <input 
                type="text" 
                [(ngModel)]="searchQuery" 
                placeholder="Buscar proprietário, restaurante, cargo..." 
                class="w-full bg-gray-950/80 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white focus:border-brand/40 focus:ring-1 focus:ring-brand shadow-inner outline-none"
              >
            </div>
            
            <div class="flex flex-wrap gap-1">
              <button (click)="statusFilter.set('all')" [class]="statusFilter() === 'all' ? 'bg-white/10 text-white font-bold border-white/10' : 'text-gray-400 border-transparent hover:text-white'" class="px-3 py-1.5 border hover:bg-white/5 text-[11px] rounded-lg tracking-wider font-semibold uppercase transition-all">
                Todos
              </button>
              <button (click)="statusFilter.set('active')" [class]="statusFilter() === 'active' ? 'bg-green-500/10 text-green-400 border-green-500/20 font-bold' : 'text-gray-400 border-transparent hover:text-white'" class="px-3 py-1.5 border hover:bg-white/5 text-[11px] rounded-lg tracking-wider font-semibold uppercase transition-all">
                Ativos
              </button>
              <button (click)="statusFilter.set('trialing')" [class]="statusFilter() === 'trialing' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 font-bold' : 'text-gray-400 border-transparent hover:text-white'" class="px-3 py-1.5 border hover:bg-white/5 text-[11px] rounded-lg tracking-wider font-semibold uppercase transition-all">
                Testes
              </button>
              <button (click)="statusFilter.set('canceled')" [class]="statusFilter() === 'canceled' ? 'bg-red-500/10 text-red-400 border-red-500/20 font-bold' : 'text-gray-400 border-transparent hover:text-white'" class="px-3 py-1.5 border hover:bg-white/5 text-[11px] rounded-lg tracking-wider font-semibold uppercase transition-all">
                Cancelados
              </button>
              <button (click)="statusFilter.set('no_subscription')" [class]="statusFilter() === 'no_subscription' ? 'bg-gray-500/10 text-gray-400 border-gray-500/20 font-bold' : 'text-gray-400 border-transparent hover:text-white'" class="px-3 py-1.5 border hover:bg-white/5 text-[11px] rounded-lg tracking-wider font-semibold uppercase transition-all">
                Sem plano
              </button>
            </div>
          </div>

          <!-- Restaurants / profiles Table/List representation -->
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="border-b border-white/5 text-gray-500 text-[10px] tracking-wider font-black uppercase">
                  <th class="pb-3 text-left">Proprietário / Cargo</th>
                  <th class="pb-3 text-left">Lojas / Restaurantes</th>
                  <th class="pb-3 text-left">Plano / Status</th>
                  <th class="pb-3 text-left">Validade</th>
                  <th class="pb-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                @for(profile of filteredRestaurants(); track profile.id) {
                  <tr [class]="selectedProfile()?.id === profile.id ? 'bg-white/5' : ''" class="hover:bg-white/10 transition-colors">
                    
                    <!-- Owner identity -->
                    <td class="py-4 pr-3">
                      <div class="flex items-center gap-3">
                        <img [src]="profile.avatar_url || 'https://ui-avatars.com/api/?background=312e81&color=fff&name=' + (profile.full_name || 'Restaurante')" 
                             class="w-9 h-9 rounded-full border border-white/10 object-cover" referrerpolicy="no-referrer">
                        <div class="w-36 md:w-44 truncate">
                          <p class="text-sm font-semibold text-white truncate" [title]="profile.full_name || 'Sem nome'">{{ profile.full_name || 'Sem Nome' }}</p>
                          <p class="text-[11px] text-gray-500 truncate mt-0.5">{{ profile.role || 'Usuário' }}</p>
                        </div>
                      </div>
                    </td>

                    <!-- Store Names -->
                    <td class="py-4 px-2">
                      @if(profile.bars && profile.bars.length > 0) {
                        <div class="flex flex-col gap-0.5 max-w-[150px]">
                          @for(bar of profile.bars; track bar.id) {
                            <span class="text-xs text-gray-300 font-medium truncate" [title]="bar.name">
                              {{ bar.name }}
                            </span>
                          }
                        </div>
                      } @else {
                        <span class="text-xs text-gray-600 italic">Sem loja ativa</span>
                      }
                    </td>

                    <!-- Current Plan & Status Tag -->
                    <td class="py-4 px-2">
                      <div class="flex flex-col gap-1 items-start">
                        @if(profile.subscriptions && profile.subscriptions.length > 0) {
                          <span class="text-[10px] px-2 py-0.5 rounded-md font-bold text-gray-300 border border-white/10 bg-white/5 flex items-center gap-1">
                            <span translate="no" class="notranslate material-symbols-outlined text-[11px]">credit_card</span>
                            {{ getPlanName(profile.subscriptions[0].plan_id) | uppercase }}
                          </span>
                          
                          <!-- Status tag -->
                          <span [class]="getStatusClass(profile.subscriptions[0].status)" class="text-[9px] px-1.5 py-0.5 rounded uppercase font-black tracking-wider">
                            {{ getStatusTranslation(profile.subscriptions[0].status) }}
                          </span>
                        } @else {
                          <span class="text-[10px] text-gray-600 px-1.5 py-0.5 bg-gray-500/10 text-gray-400 rounded-md font-black italic">
                            Sem Assinatura
                          </span>
                        }
                      </div>
                    </td>

                    <!-- Expiration date with feedback -->
                    <td class="py-4 px-2">
                      @if(profile.subscriptions && profile.subscriptions.length > 0) {
                        <div class="flex flex-col">
                          <span class="text-xs text-gray-200 font-medium font-mono">
                            {{ profile.subscriptions[0].current_period_end | date:'dd/MM/yyyy' }}
                          </span>
                          @if(isExpired(profile.subscriptions[0].current_period_end)) {
                            <span class="text-[9px] text-red-400 font-semibold animate-pulse mt-0.5">Assinatura Expirada</span>
                          } @else {
                            <span class="text-[9px] text-gray-500 mt-0.5">
                              Restam {{ getRemainingDays(profile.subscriptions[0].current_period_end) }} dias
                            </span>
                          }
                        </div>
                      } @else {
                        <span class="text-xs text-gray-600 font-mono">-</span>
                      }
                    </td>

                    <!-- Compact Actions -->
                    <td class="py-4 pl-3 text-right">
                      <div class="flex items-center justify-end gap-1.5">
                        <button (click)="selectProfileForEdit(profile)" class="bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600 hover:text-white border border-indigo-500/20 p-2 rounded-xl transition-all" title="Gerenciar Plano / Dados">
                          <span translate="no" class="notranslate material-symbols-outlined text-[15px] leading-none">edit_calendar</span>
                        </button>
                        
                        @if(profile.subscriptions && profile.subscriptions.length > 0) {
                          <button (click)="addDaysToSubscription(profile, 30)" class="bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600 hover:text-white border border-emerald-500/20 px-2 py-1.5 rounded-xl text-[10px] font-bold tracking-wider transition-all" title="Adicionar +30 Dias">
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
                      <span translate="no" class="notranslate material-symbols-outlined text-4xl mb-2 text-gray-700">search_off</span>
                      <p class="text-gray-400 font-medium text-sm">Nenhum resultado corresponde aos filtros.</p>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- Lateral Manager & Editor Panel (Contextual Drawer) -->
        <div class="bg-gray-900 border border-white/5 rounded-2xl shadow-2xl p-5 md:p-6 space-y-6">
          @if(selectedProfile()) {
            <div class="space-y-4">
              <div class="flex justify-between items-start pb-4 border-b border-white/5">
                <div>
                  <h3 class="font-bold text-white text-base">Gerenciar Assinatura</h3>
                  <p class="text-[11px] text-gray-400 mt-0.5">Editar configurações de acesso do cliente.</p>
                </div>
                <button (click)="selectedProfile.set(null)" class="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-all">
                  <span translate="no" class="notranslate material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <!-- Owner quick summary card -->
              <div class="bg-white/5 border border-white/5 p-3 rounded-xl flex items-center gap-3">
                <img [src]="selectedProfile()?.avatar_url || 'https://ui-avatars.com/api/?background=312e81&color=fff&name=' + (selectedProfile()?.full_name || 'W')" 
                     class="w-10 h-10 rounded-full border border-white/10" referrerpolicy="no-referrer">
                <div>
                  <h4 class="text-xs font-extrabold text-white truncate max-w-[160px]">{{ selectedProfile()?.full_name || 'Sem nome' }}</h4>
                  <p class="text-[10px] text-gray-400 mt-0.5">{{ selectedProfile()?.role }}</p>
                  @if (selectedProfile()?.bars && selectedProfile()?.bars?.length > 0) {
                    <span class="text-[9px] px-1.5 py-0.5 bg-brand/10 text-brand rounded inline-block font-bold mt-1 uppercase">
                      {{ selectedProfile()?.bars?.[0]?.name }}
                    </span>
                  }
                </div>
              </div>

              <!-- Status configuration options -->
              <div class="space-y-1.5">
                <label class="text-[11px] font-black tracking-wider uppercase text-gray-400">Status de Acesso</label>
                <select 
                  [(ngModel)]="editStatus" 
                  class="w-full bg-gray-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                >
                  <option value="active">Ativo (Acesso Liberado)</option>
                  <option value="trialing">Testando (Período Crítico / Beta)</option>
                  <option value="past_due">Pendente / Vencido</option>
                  <option value="canceled">Cancelado (Sem Acesso)</option>
                  <option value="unpaid">Não Pago</option>
                </select>
              </div>

              <!-- Plan Configuration options -->
              <div class="space-y-1.5">
                <label class="text-[11px] font-black tracking-wider uppercase text-gray-400 font-semibold">Plano de Precificação</label>
                <select 
                  [(ngModel)]="editPlanId" 
                  class="w-full bg-gray-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                >
                  <option value="">Sem plano selecionado</option>
                  @for (plan of plans(); track plan.id) {
                    <option [value]="plan.id">
                      {{ plan.name }} - {{ plan.price | currency:'BRL':'symbol':'1.0-2' }}/mês (Até {{ plan.max_stores }} Stores)
                    </option>
                  }
                </select>
              </div>

              <!-- Expiry Date selector -->
              <div class="space-y-1.5">
                <div class="flex justify-between items-center">
                  <label class="text-[11px] font-black tracking-wider uppercase text-gray-400">Expira em</label>
                  <button (click)="addDaysToInput(30)" class="text-[10px] border border-white/10 hover:bg-white/5 hover:text-white text-gray-400 px-1.5 py-0.5 rounded font-bold transition-all">
                    +30 dias
                  </button>
                </div>
                <input 
                  type="date" 
                  [(ngModel)]="editPeriodEnd" 
                  class="w-full bg-gray-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                >
              </div>

              <!-- Quick shortcut extensions -->
              <div class="space-y-1.5 p-3.5 bg-white/5 border border-white/5 rounded-xl">
                <span class="text-[10px] font-extrabold uppercase text-gray-400 tracking-widest block mb-2">Comandos Rápidos de Extensão</span>
                <div class="grid grid-cols-3 gap-1.5">
                  <button (click)="quickAddDays(7)" class="bg-gray-800 hover:bg-gray-700 hover:text-white text-gray-200 border border-white/5 text-[10px] py-1.5 rounded-lg font-bold uppercase tracking-wider transition-all">
                    +7 dias
                  </button>
                  <button (click)="quickAddDays(15)" class="bg-gray-800 hover:bg-gray-700 hover:text-white text-gray-200 border border-white/5 text-[10px] py-1.5 rounded-lg font-bold uppercase tracking-wider transition-all">
                    +15 dias
                  </button>
                  <button (click)="quickAddDays(30)" class="bg-gray-800 hover:bg-gray-700 hover:text-white text-gray-200 border border-white/5 text-[10px] py-1.5 rounded-lg font-bold uppercase tracking-wider transition-all">
                    +30 dias
                  </button>
                </div>
              </div>

              <!-- Action buttons -->
              <div class="pt-4 border-t border-white/5 flex gap-2">
                <button 
                  (click)="saveSubscriptionEdit()"
                  [disabled]="isLoading()"
                  class="flex-1 bg-brand hover:bg-brand/90 text-white py-2 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <span translate="no" class="notranslate material-symbols-outlined text-[16px]">save</span>
                  Salvar Ajustes
                </button>
                <button 
                  (click)="selectedProfile.set(null)"
                  class="bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-white/5 px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all"
                >
                  Fechar
                </button>
              </div>
            </div>
          } @else {
            <!-- Empty state lateral panel -->
            <div class="h-64 flex flex-col items-center justify-center text-center p-6 text-gray-500 space-y-3">
              <span translate="no" class="notranslate material-symbols-outlined text-4xl text-gray-700">settings_suggest</span>
              <div class="space-y-1">
                <h4 class="text-xs font-black uppercase text-gray-300">Modo de Configuração</h4>
                <p class="text-[11px] text-gray-500 leading-normal max-w-[200px]">Selecione "Gerenciar" em qualquer restaurante na tabela para editar sua assinatura e alterar planos.</p>
              </div>
            </div>
          }

          <!-- Pricing Plans lister -->
          <div class="border-t border-white/5 pt-6 space-y-4">
            <h4 class="font-bold text-white text-sm flex items-center gap-1.5">
              <span translate="no" class="notranslate material-symbols-outlined text-[16px] text-indigo-400">payments</span>
              Planos Cadastrados no Banco
            </h4>

            <div class="space-y-2">
              @for(plan of plans(); track plan.id) {
                <div class="bg-white/5 border border-white/5 p-3 rounded-xl flex items-center justify-between text-xs">
                  <div>
                    <strong class="text-gray-200 truncate font-semibold block">{{ plan.name }}</strong>
                    <span class="text-[10px] text-gray-400">Slug: <span class="font-mono text-[9px]">{{ plan.slug }}</span></span>
                  </div>
                  <div class="text-right">
                    <strong class="text-emerald-400 font-bold font-mono">{{ plan.price | currency:'BRL':'symbol':'1.0-2' }}</strong>
                    <span class="text-[10px] text-gray-500 block">max. {{ plan.max_stores }} stores</span>
                  </div>
                </div>
              }
              @if(plans().length === 0 && !isLoading()) {
                <p class="text-[11px] text-gray-600 italic">Nenhum plano cadastrado ou carregado de momento.</p>
              }
            </div>
          </div>
        </div>

      </div>
    </div>
  `
})
export class AdminDashboardComponent implements OnInit {
  adminService = inject(SystemAdminService);
  notificationService = inject(NotificationService);
  
  stats = signal<any>(null);
  restaurants = signal<any[]>([]);
  plans = signal<any[]>([]);
  
  isLoading = signal(true);
  searchQuery = signal('');
  statusFilter = signal('all');

  // Selected for edits
  selectedProfile = signal<any | null>(null);
  editStatus = signal('active');
  editPlanId = signal('');
  editPeriodEnd = signal('');

  async ngOnInit() {
    await this.loadData();
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
      console.error('Error loading admin data:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  // Reactive filtered array mapping
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
      filtered = filtered.filter(p => {
        const sub = p.subscriptions?.[0];
        if (filter === 'no_subscription') {
          return !sub;
        }
        return sub?.status === filter;
      });
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

  getPlanName(planId: string): string {
    const plan = this.plans().find(p => p.id === planId);
    return plan ? plan.name : 'Plano Personalizado';
  }

  selectProfileForEdit(profile: any) {
    this.selectedProfile.set(profile);
    const sub = profile.subscriptions?.[0];
    this.editStatus.set(sub?.status || 'active');
    this.editPlanId.set(sub?.plan_id || (this.plans().length > 0 ? this.plans()[0].id : ''));
    
    if (sub?.current_period_end) {
      const d = new Date(sub.current_period_end);
      this.editPeriodEnd.set(d.toISOString().split('T')[0]);
    } else {
      const thirtyDays = new Date();
      thirtyDays.setDate(thirtyDays.getDate() + 30);
      this.editPeriodEnd.set(thirtyDays.toISOString().split('T')[0]);
    }
  }

  addDaysToInput(days: number) {
    let current = new Date();
    if (this.editPeriodEnd()) {
      current = new Date(this.editPeriodEnd() + 'T12:00:00');
    }
    current.setDate(current.getDate() + days);
    this.editPeriodEnd.set(current.toISOString().split('T')[0]);
  }

  quickAddDays(days: number) {
    this.addDaysToInput(days);
    this.notificationService.show(`${days} dias adicionados ao controle! Lembre de salvar para concluir.`, 'success');
  }

  async saveSubscriptionEdit() {
    const profile = this.selectedProfile();
    if (!profile) return;

    this.isLoading.set(true);
    const status = this.editStatus();
    const planId = this.editPlanId();
    
    let isoPeriodEnd = '';
    if (this.editPeriodEnd()) {
      isoPeriodEnd = new Date(this.editPeriodEnd() + 'T23:59:59').toISOString();
    }

    const { error } = await this.adminService.updateSubscriptionStatus(
      profile.id,
      status,
      planId || undefined,
      isoPeriodEnd || undefined
    );

    if (error) {
      this.notificationService.alert('Erro ao salvar ajustes de assinatura: ' + error.message);
    } else {
      this.notificationService.show('Parâmetros de assinatura atualizados com sucesso!', 'success');
      this.selectedProfile.set(null);
      await this.loadData();
    }
    this.isLoading.set(false);
  }

  async addDaysToSubscription(profile: any, days: number) {
    this.isLoading.set(true);
    const sub = profile.subscriptions?.[0];
    const status = sub?.status || 'active';
    const planId = sub?.plan_id || (this.plans().length > 0 ? this.plans()[0].id : undefined);

    let baseDate = new Date();
    if (sub?.current_period_end) {
      const expiry = new Date(sub.current_period_end);
      if (expiry > baseDate) {
        baseDate = expiry;
      }
    }
    baseDate.setDate(baseDate.getDate() + days);

    const { error } = await this.adminService.updateSubscriptionStatus(
      profile.id,
      status,
      planId,
      baseDate.toISOString()
    );

    if (error) {
      this.notificationService.alert('Erro ao estender dias de assinatura: ' + error.message);
    } else {
      this.notificationService.show(`${days} dias adicionais estendidos com sucesso!`, 'success');
      await this.loadData();
    }
    this.isLoading.set(false);
  }

  // UI Helpers
  getStatusTranslation(status: string): string {
    switch (status) {
      case 'active': return 'Ativa';
      case 'trialing': return 'Teste';
      case 'past_due': return 'Vencida';
      case 'canceled': return 'Cancelada';
      case 'unpaid': return 'Não Pago';
      default: return status || 'Inativa';
    }
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'active':
        return 'bg-green-500/15 text-green-400 border border-green-500/30';
      case 'trialing':
        return 'bg-blue-500/15 text-blue-400 border border-blue-500/30';
      case 'past_due':
        return 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
      case 'canceled':
        return 'bg-red-500/15 text-red-400 border border-red-500/30';
      default:
        return 'bg-gray-500/15 text-gray-400 border border-gray-500/20';
    }
  }

  isExpired(isoDate: string): boolean {
    if (!isoDate) return true;
    return new Date(isoDate) < new Date();
  }

  getRemainingDays(isoDate: string): number {
    if (!isoDate) return 0;
    const diff = new Date(isoDate).getTime() - new Date().getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  }
}
