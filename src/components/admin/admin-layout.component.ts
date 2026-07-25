import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="min-h-screen bg-gray-950 text-gray-200 flex">
      <!-- Sidebar -->
      <aside class="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div class="p-6 border-b border-gray-800">
          <h1 class="text-xl font-bold text-white flex items-center gap-2">
            <span translate="no" class="notranslate material-symbols-outlined text-purple-500">admin_panel_settings</span>
            ChefOS Admin
          </h1>
        </div>
        <nav class="flex-1 p-4 space-y-1 overflow-y-auto">
          <a routerLink="/admin/dashboard" [queryParams]="{ tab: 'overview' }" routerLinkActive="bg-purple-600/20 text-purple-400 border-purple-500/50" [routerLinkActiveOptions]="{ exact: false }" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors border border-transparent">
            <span translate="no" class="notranslate material-symbols-outlined text-lg">dashboard</span>
            Visão Geral & MRR
          </a>

          <a routerLink="/admin/dashboard" [queryParams]="{ tab: 'support' }" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors border border-transparent">
            <span translate="no" class="notranslate material-symbols-outlined text-lg text-cyan-400">support_agent</span>
            Central de Atendimento
          </a>

          <a routerLink="/admin/dashboard" [queryParams]="{ tab: 'users' }" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors border border-transparent">
            <span translate="no" class="notranslate material-symbols-outlined text-lg text-blue-400">group</span>
            Usuários & Lojas
          </a>

          <a routerLink="/admin/dashboard" [queryParams]="{ tab: 'catalog' }" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors border border-transparent">
            <span translate="no" class="notranslate material-symbols-outlined text-lg text-orange-400">restaurant_menu</span>
            Inspector de Cardápios
          </a>

          <a routerLink="/admin/dashboard" [queryParams]="{ tab: 'health' }" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors border border-transparent">
            <span translate="no" class="notranslate material-symbols-outlined text-lg text-emerald-400">monitor_heart</span>
            Saúde & Observabilidade
          </a>

          <a routerLink="/admin/dashboard" [queryParams]="{ tab: 'provisioning' }" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors border border-transparent">
            <span translate="no" class="notranslate material-symbols-outlined text-lg text-amber-400">rocket_launch</span>
            Provisionamento
          </a>

          <a routerLink="/admin/dashboard" [queryParams]="{ tab: 'plans' }" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors border border-transparent">
            <span translate="no" class="notranslate material-symbols-outlined text-lg text-indigo-400">loyalty</span>
            Planos & Preços
          </a>

          <a routerLink="/admin/dashboard" [queryParams]="{ tab: 'financial' }" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors border border-transparent">
            <span translate="no" class="notranslate material-symbols-outlined text-lg text-teal-400">payments</span>
            Financeiro SaaS
          </a>

          <a routerLink="/admin/dashboard" [queryParams]="{ tab: 'logs' }" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors border border-transparent">
            <span translate="no" class="notranslate material-symbols-outlined text-lg text-rose-400">terminal</span>
            Logs & Telemetria
          </a>

          <a routerLink="/admin/manage" routerLinkActive="bg-purple-600/20 text-purple-400 border-purple-500/50" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors border border-transparent">
            <span translate="no" class="notranslate material-symbols-outlined text-lg text-purple-400">manage_accounts</span>
            Administradores
          </a>

          <div class="pt-6 border-t border-gray-800/80 mt-4">
            <a routerLink="/dashboard" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors border border-transparent">
              <span translate="no" class="notranslate material-symbols-outlined text-lg">exit_to_app</span>
              Sair do Admin
            </a>
          </div>
        </nav>
      </aside>
      <!-- Main Content -->
      <main class="flex-1 flex flex-col h-screen overflow-hidden">
        <header class="h-16 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-8">
          <h2 class="text-lg font-medium text-gray-300">Painel de Controle Global</h2>
          <div class="flex items-center gap-4">
            <span class="text-sm text-gray-400">{{ auth.currentUser()?.email }}</span>
          </div>
        </header>
        <div class="flex-1 overflow-y-auto p-8">
          <router-outlet></router-outlet>
        </div>
      </main>
    </div>
  `
})
export class AdminLayoutComponent {
  auth = inject(AuthService);
}
