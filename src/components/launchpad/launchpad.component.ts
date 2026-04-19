
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
    <div class="min-h-full bg-app p-4 sm:p-6 md:p-10 relative overflow-hidden">
      <!-- Decorative background elements -->
      <div class="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-brand/5 blur-3xl pointer-events-none"></div>
      <div class="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-success/5 blur-3xl pointer-events-none"></div>

      <div class="max-w-7xl mx-auto relative z-10">
        <header class="mb-8 md:mb-12 text-center md:text-left flex flex-col items-center md:items-start">
          <div class="inline-flex items-center gap-2 px-3 py-1 bg-surface-elevated border border-strong rounded-full mb-4 shadow-sm">
            <span class="w-2 h-2 rounded-full bg-success animate-pulse"></span>
            <span class="text-xs font-bold text-title uppercase tracking-wider">{{ unitContextService.activeUnitName() }}</span>
          </div>
          <h1 class="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-title mb-2 tracking-tight">
            Bem-vindo ao <span class="bg-gradient-to-r from-brand to-indigo-500 bg-clip-text text-transparent drop-shadow-sm">ChefOS</span>
          </h1>
          <p class="text-muted text-base sm:text-lg font-medium flex items-center justify-center md:justify-start gap-2">
            <span class="material-symbols-outlined text-xl">person</span>
            {{ activeEmployee()?.name }}
          </p>
        </header>

        <div class="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          @for (item of visibleItems(); track item.path) {
            <a [routerLink]="item.path" 
               class="group relative bg-surface-elevated/80 backdrop-blur-md rounded-[2rem] p-5 sm:p-8 border border-strong hover:border-brand/40 shadow-sm hover:shadow-[0_20px_40px_rgba(0,0,0,0.1)] transition-all duration-300 hover:-translate-y-1 sm:hover:-translate-y-2 flex flex-col items-center text-center overflow-hidden">
              
              <!-- Hover Gradient Overlay -->
              <div class="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>

              <div [class]="'w-14 h-14 sm:w-20 sm:h-20 rounded-[1.25rem] sm:rounded-[1.5rem] flex items-center justify-center mb-4 sm:mb-6 transition-transform duration-300 group-hover:scale-110 shadow-inner relative z-10 ' + item.color">
                <span class="material-symbols-outlined text-3xl sm:text-4xl text-white drop-shadow-md">{{ item.icon }}</span>
              </div>
              <h3 class="text-base sm:text-xl font-black text-title mb-1 sm:mb-2 group-hover:text-brand transition-colors line-clamp-1 tracking-tight drop-shadow-sm relative z-10">{{ item.name }}</h3>
              <p class="hidden sm:block text-muted text-sm leading-relaxed line-clamp-2 relative z-10 font-medium">{{ item.description }}</p>
              
              <!-- Decorative background element -->
              <div class="absolute top-0 right-0 p-3 sm:p-5 opacity-0 group-hover:opacity-10 transition-opacity transform group-hover:scale-125 group-hover:-rotate-12 duration-500">
                 <span class="material-symbols-outlined text-6xl sm:text-8xl" [class]="'text-' + item.color.split('-')[1] + '-500'">{{ item.icon }}</span>
              </div>
            </a>
          }
        </div>

        @if (visibleItems().length === 0) {
          <div class="text-center py-20 bg-surface-elevated/80 backdrop-blur-md border border-subtle rounded-[2rem] mt-8 shadow-inner">
            <span class="material-symbols-outlined text-6xl text-muted mb-4 opacity-50 drop-shadow-sm">lock</span>
            <p class="text-muted text-lg font-bold tracking-tight">Você não tem permissões para acessar nenhuma funcionalidade.</p>
          </div>
        }

        <footer class="mt-12 sm:mt-16 pt-8 border-t border-subtle flex justify-center relative">
          <div class="absolute top-0 left-1/2 -translate-x-1/2 -ml-px w-64 h-px bg-gradient-to-r from-transparent via-brand to-transparent opacity-50"></div>
          <a routerLink="/admin" class="inline-flex items-center gap-2 text-xs font-black text-muted hover:text-white transition-all uppercase tracking-widest bg-surface px-5 py-3 rounded-full border border-strong shadow-sm hover:shadow-brand/20 hover:-translate-y-1 hover:bg-brand">
            <span class="material-symbols-outlined text-lg">admin_panel_settings</span>
            Painel de Controle
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
