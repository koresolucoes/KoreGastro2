import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

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
              <p class="text-2xl font-bold text-white">--</p>
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
              <p class="text-2xl font-bold text-white">R$ --</p>
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
              <p class="text-2xl font-bold text-white">--</p>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
        <span class="material-symbols-outlined text-6xl text-gray-700 mb-4">construction</span>
        <h3 class="text-xl font-medium text-gray-300 mb-2">Módulo em Construção</h3>
        <p class="text-gray-500 max-w-md mx-auto">Em breve, os dados reais de todos os tenants (restaurantes) aparecerão aqui através de funções RPC seguras.</p>
      </div>
    </div>
  `
})
export class AdminDashboardComponent {}
