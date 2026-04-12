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
            <span class="material-symbols-outlined text-purple-500">admin_panel_settings</span>
            ChefOS Admin
          </h1>
        </div>
        <nav class="flex-1 p-4 space-y-2">
          <a routerLink="/admin/dashboard" routerLinkActive="bg-purple-600/20 text-purple-400 border-purple-500/50" class="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors border border-transparent">
            <span class="material-symbols-outlined">dashboard</span>
            Visão Geral
          </a>
          <a routerLink="/admin/manage" routerLinkActive="bg-purple-600/20 text-purple-400 border-purple-500/50" class="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors border border-transparent">
            <span class="material-symbols-outlined">manage_accounts</span>
            Administradores
          </a>
          <a routerLink="/dashboard" class="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors border border-transparent mt-8">
            <span class="material-symbols-outlined">exit_to_app</span>
            Sair do Admin
          </a>
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
