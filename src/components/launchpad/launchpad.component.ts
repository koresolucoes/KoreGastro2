
import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { OperationalAuthService } from '../../services/operational-auth.service';
import { DemoService } from '../../services/demo.service';
import { UnitContextService } from '../../services/unit-context.service';

interface LaunchpadItem {
  name: string;
  path: string;
  icon: string;
  color: string;
  description: string;
}

@Component({
  selector: 'app-launchpad',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="min-h-full bg-gray-900 p-6 md:p-10">
      <div class="max-w-7xl mx-auto">
        <header class="mb-12 text-center md:text-left">
          <h1 class="text-4xl font-extrabold text-white mb-2">
            Bem-vindo ao <span class="text-blue-500">ChefOS</span>
          </h1>
          <p class="text-gray-400 text-lg">
            {{ unitContextService.activeUnitName() }} • {{ activeEmployee()?.name }}
          </p>
        </header>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          @for (item of visibleItems(); track item.path) {
            <a [routerLink]="item.path" 
               class="group relative bg-gray-800 rounded-2xl p-8 border border-gray-700 hover:border-blue-500/50 hover:bg-gray-700/50 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-2xl flex flex-col items-center text-center">
              <div [class]="'w-20 h-20 rounded-2xl flex items-center justify-center mb-6 transition-transform duration-300 group-hover:scale-110 ' + item.color">
                <span class="material-symbols-outlined text-4xl text-white">{{ item.icon }}</span>
              </div>
              <h3 class="text-xl font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">{{ item.name }}</h3>
              <p class="text-gray-400 text-sm leading-relaxed">{{ item.description }}</p>
              
              <!-- Decorative background element -->
              <div class="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-10 transition-opacity">
                 <span class="material-symbols-outlined text-6xl">{{ item.icon }}</span>
              </div>
            </a>
          }
        </div>

        @if (visibleItems().length === 0) {
          <div class="text-center py-20">
            <span class="material-symbols-outlined text-6xl text-gray-600 mb-4">lock</span>
            <p class="text-gray-400">Você não tem permissões para acessar nenhuma funcionalidade.</p>
          </div>
        }

        <footer class="mt-16 pt-8 border-t border-gray-800 flex justify-center">
          <a routerLink="/admin" class="inline-flex items-center gap-2 text-xs font-semibold text-gray-500 hover:text-blue-400 transition-colors uppercase tracking-widest">
            <span class="material-symbols-outlined text-sm">admin_panel_settings</span>
            Painel de Controle do Sistema
          </a>
        </footer>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LaunchpadComponent {
  operationalAuthService = inject(OperationalAuthService);
  demoService = inject(DemoService);
  unitContextService = inject(UnitContextService);
  activeEmployee = this.operationalAuthService.activeEmployee;

  private allItems: LaunchpadItem[] = [
    { name: 'PDV', path: '/pos', icon: 'receipt_long', color: 'bg-emerald-500 shadow-emerald-500/20', description: 'Realize vendas, gerencie mesas e comandas.' },
    { name: 'Cozinha (KDS)', path: '/kds', icon: 'deck', color: 'bg-orange-500 shadow-orange-500/20', description: 'Gerencie o preparo dos pedidos em tempo real.' },
    { name: 'Caixa', path: '/cashier', icon: 'point_of_sale', color: 'bg-blue-500 shadow-blue-500/20', description: 'Controle de fluxo de caixa e fechamentos.' },
    { name: 'Dashboard', path: '/dashboard', icon: 'dashboard', color: 'bg-indigo-500 shadow-indigo-500/20', description: 'Visão geral do desempenho do seu negócio.' },
    { name: 'Estoque', path: '/inventory', icon: 'inventory_2', color: 'bg-purple-500 shadow-purple-500/20', description: 'Controle de insumos, lotes e validades.' },
    { name: 'Requisições', path: '/requisitions', icon: 'move_to_inbox', color: 'bg-cyan-500 shadow-cyan-500/20', description: 'Solicite insumos para sua estação.' },
    { name: 'Mise en Place', path: '/mise-en-place', icon: 'checklist', color: 'bg-lime-500 shadow-lime-500/20', description: 'Organização e preparo prévio de ingredientes.' },
    { name: 'Checklists', path: '/checklists', icon: 'checklist_rtl', color: 'bg-yellow-500 shadow-yellow-500/20', description: 'Verificações diárias de abertura e fechamento.' },
    { name: 'Temperaturas', path: '/temperatures', icon: 'thermostat', color: 'bg-blue-400 shadow-blue-400/20', description: 'Registro de temperaturas de equipamentos.' },
    { name: 'Entregas', path: '/delivery', icon: 'local_shipping', color: 'bg-rose-500 shadow-rose-500/20', description: 'Gerencie entregadores e status de delivery.' },
    { name: 'Reservas', path: '/reservations', icon: 'calendar_month', color: 'bg-teal-500 shadow-teal-500/20', description: 'Gerencie reservas de mesas e eventos.' },
    { name: 'Cardápio iFood', path: '/ifood-menu', icon: 'menu_book', color: 'bg-red-500 shadow-red-500/20', description: 'Sincronize e gerencie seu cardápio iFood.' },
    { name: 'Funcionários', path: '/employees', icon: 'badge', color: 'bg-amber-500 shadow-amber-500/20', description: 'Gestão de equipe, cargos e permissões.' },
    { name: 'Escalas', path: '/schedules', icon: 'calendar_view_week', color: 'bg-violet-500 shadow-violet-500/20', description: 'Visualize e gerencie as escalas da equipe.' },
    { name: 'Controle de Ponto', path: '/time-clock', icon: 'schedule', color: 'bg-pink-500 shadow-pink-500/20', description: 'Registro e gestão de jornada de trabalho.' },
    { name: 'Relatórios', path: '/reports', icon: 'analytics', color: 'bg-slate-500 shadow-slate-500/20', description: 'Análises detalhadas e exportação de dados.' },
    { name: 'Configurações', path: '/settings', icon: 'settings', color: 'bg-gray-500 shadow-gray-500/20', description: 'Ajustes do sistema e perfil da empresa.' },
  ];

  visibleItems = computed(() => {
    const isDemo = this.demoService.isDemoMode();
    const demoAllowedPaths = ['/dashboard', '/pos', '/cashier', '/kds', '/inventory', '/requisitions', '/mise-en-place', '/checklists', '/temperatures'];

    return this.allItems.filter(item => {
      if (isDemo) {
        return demoAllowedPaths.includes(item.path);
      }
      return this.operationalAuthService.hasPermission(item.path);
    });
  });
}
