import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SystemAdminService } from '../../services/system-admin.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="animate-fade-in-up">
      <h2 class="text-2xl font-bold text-white mb-6">Visão Geral do Sistema</h2>
      
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div class="flex items-center gap-4 mb-4">
            <div class="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
              <span class="material-symbols-outlined">storefront</span>
            </div>
            <div>
              <p class="text-sm text-gray-400">Restaurantes Ativos</p>
              <p class="text-2xl font-bold text-white">
                @if(isLoading()) {
                  <span class="animate-pulse">...</span>
                } @else {
                  {{ stats()?.total_restaurants || 0 }}
                }
              </p>
            </div>
          </div>
        </div>
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div class="flex items-center gap-4 mb-4">
            <div class="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center text-green-400">
              <span class="material-symbols-outlined">payments</span>
            </div>
            <div>
              <p class="text-sm text-gray-400">MRR Estimado</p>
              <p class="text-2xl font-bold text-white">
                @if(isLoading()) {
                  <span class="animate-pulse">...</span>
                } @else {
                  {{ (stats()?.total_mrr || 0) | currency:'BRL':'symbol':'1.2-2' }}
                }
              </p>
            </div>
          </div>
        </div>
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div class="flex items-center gap-4 mb-4">
            <div class="w-12 h-12 rounded-lg bg-red-500/20 flex items-center justify-center text-red-400">
              <span class="material-symbols-outlined">bug_report</span>
            </div>
            <div>
              <p class="text-sm text-gray-400">Erros Recentes</p>
              <p class="text-2xl font-bold text-white">
                @if(isLoading()) {
                  <span class="animate-pulse">...</span>
                } @else {
                  {{ stats()?.recent_errors || 0 }}
                }
              </p>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div class="p-6 border-b border-gray-800 flex justify-between items-center">
          <h3 class="text-lg font-bold text-white">Restaurantes e Proprietários</h3>
          <button (click)="loadData()" class="text-gray-400 hover:text-white transition-colors">
            <span class="material-symbols-outlined text-sm" [class.animate-spin]="isLoading()">sync</span>
          </button>
        </div>
        
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-gray-950 border-b border-gray-800 text-gray-400 text-sm">
                <th class="p-4 font-medium">Proprietário</th>
                <th class="p-4 font-medium">Restaurante</th>
                <th class="p-4 font-medium">Plano / Status</th>
                <th class="p-4 font-medium">Data Cadastro</th>
                <th class="p-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              @for(profile of restaurants(); track profile.id) {
                <tr class="border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors">
                  <td class="p-4">
                    <div class="flex items-center gap-3">
                      <img [src]="profile.avatar_url || 'https://ui-avatars.com/api/?name=' + profile.full_name" 
                           class="w-8 h-8 rounded-full border border-gray-700" referrerpolicy="no-referrer">
                      <div>
                        <p class="text-sm font-medium text-white">{{ profile.full_name || 'Sem nome' }}</p>
                        <p class="text-xs text-gray-500">{{ profile.role }}</p>
                      </div>
                    </div>
                  </td>
                  <td class="p-4">
                    @if(profile.bars && profile.bars.length > 0) {
                      <div class="flex flex-col gap-1">
                        @for(bar of profile.bars; track bar.id) {
                          <span class="text-sm text-gray-300">{{ bar.name }}</span>
                        }
                      </div>
                    } @else {
                      <span class="text-xs text-gray-600 italic">Nenhum restaurante</span>
                    }
                  </td>
                  <td class="p-4">
                    @if(profile.subscriptions && profile.subscriptions.length > 0) {
                      <div class="flex flex-col gap-1">
                        <span class="text-sm font-medium" 
                              [class.text-green-400]="profile.subscriptions[0].status === 'active' || profile.subscriptions[0].status === 'trialing'"
                              [class.text-red-400]="profile.subscriptions[0].status === 'canceled' || profile.subscriptions[0].status === 'past_due'">
                          {{ profile.subscriptions[0].status | uppercase }}
                        </span>
                        <span class="text-xs text-gray-500">
                          Vence: {{ profile.subscriptions[0].current_period_end | date:'dd/MM/yyyy' }}
                        </span>
                      </div>
                    } @else {
                      <span class="text-xs text-gray-600 italic">Sem assinatura</span>
                    }
                  </td>
                  <td class="p-4 text-sm text-gray-400">
                    {{ (profile.bars?.[0]?.created_at || profile.updated_at) | date:'dd/MM/yyyy' }}
                  </td>
                  <td class="p-4 text-right">
                    <div class="flex items-center justify-end gap-2">
                      @if(profile.subscriptions && profile.subscriptions.length > 0 && profile.subscriptions[0].status === 'active') {
                        <button (click)="toggleSubscription(profile.id, 'canceled')" class="text-red-400 hover:text-red-300 p-2 rounded-lg hover:bg-red-400/10 transition-colors" title="Cancelar Assinatura">
                          <span class="material-symbols-outlined text-sm">cancel</span>
                        </button>
                      } @else {
                        <button (click)="toggleSubscription(profile.id, 'active')" class="text-green-400 hover:text-green-300 p-2 rounded-lg hover:bg-green-400/10 transition-colors" title="Ativar Assinatura">
                          <span class="material-symbols-outlined text-sm">check_circle</span>
                        </button>
                      }
                      <button class="text-blue-400 hover:text-blue-300 p-2 rounded-lg hover:bg-blue-400/10 transition-colors" title="Ver detalhes">
                        <span class="material-symbols-outlined text-sm">visibility</span>
                      </button>
                    </div>
                  </td>
                </tr>
              }
              @if(restaurants().length === 0 && !isLoading()) {
                <tr>
                  <td colspan="5" class="p-12 text-center">
                    <span class="material-symbols-outlined text-4xl text-gray-700 mb-2">search_off</span>
                    <p class="text-gray-500">Nenhum restaurante encontrado.</p>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `
})
export class AdminDashboardComponent implements OnInit {
  adminService = inject(SystemAdminService);
  stats = signal<any>(null);
  restaurants = signal<any[]>([]);
  isLoading = signal(true);

  async ngOnInit() {
    await this.loadData();
  }

  async loadData() {
    this.isLoading.set(true);
    try {
      const [statsRes, restaurantsRes] = await Promise.all([
        this.adminService.getDashboardStats(),
        this.adminService.getAllRestaurants()
      ]);
      
      if (statsRes.data) this.stats.set(statsRes.data);
      if (restaurantsRes.data) this.restaurants.set(restaurantsRes.data);
    } catch (error) {
      console.error('Error loading admin data:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  async toggleSubscription(userId: string, newStatus: string) {
    if (!confirm(`Tem certeza que deseja alterar o status da assinatura para ${newStatus.toUpperCase()}?`)) {
      return;
    }

    this.isLoading.set(true);
    // Use a default plan ID if activating a new subscription (this should ideally be selected by the admin)
    const defaultPlanId = '00000000-0000-0000-0000-000000000000'; // Replace with a real plan ID if needed, or handle in backend
    
    const { error } = await this.adminService.updateSubscriptionStatus(userId, newStatus, defaultPlanId);
    
    if (error) {
      alert('Erro ao atualizar assinatura: ' + error.message);
    } else {
      await this.loadData(); // Reload to show updated status
    }
    this.isLoading.set(false);
  }
}
