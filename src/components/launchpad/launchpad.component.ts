
import { Component, ChangeDetectionStrategy, inject, computed, signal } from '@angular/core';
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

interface LaunchpadCategory {
  id: string;
  title: string;
  icon: string;
  items: LaunchpadItem[];
}

@Component({
  selector: 'app-launchpad',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="h-full bg-app p-4 sm:p-6 md:p-8 flex flex-col relative overflow-hidden">
      <!-- Decorative background elements -->
      <div class="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-brand/5 blur-3xl pointer-events-none"></div>
      <div class="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-success/5 blur-3xl pointer-events-none"></div>

      <div class="max-w-7xl mx-auto w-full relative z-10 flex-none">
        <header class="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div class="inline-flex items-center gap-2 px-3 py-1 bg-surface-elevated border border-strong rounded-full mb-3 shadow-sm">
              <span class="w-2 h-2 rounded-full bg-success animate-pulse"></span>
              <span class="text-xs font-bold text-title uppercase tracking-wider">{{ unitContextService.activeUnitName() }}</span>
            </div>
            <h1 class="text-2xl sm:text-3xl font-extrabold text-title mb-1 tracking-tight">
              Bem-vindo ao <span class="bg-gradient-to-r from-brand to-indigo-500 bg-clip-text text-transparent drop-shadow-sm">ChefOS</span>
            </h1>
            <p class="text-muted text-sm font-medium flex items-center gap-2">
              <span class="material-symbols-outlined text-base">person</span>
              {{ activeEmployee()?.name }}
            </p>
          </div>
          
          <a routerLink="/admin" class="hidden sm:inline-flex items-center gap-2 text-xs font-black text-muted hover:text-white transition-all uppercase tracking-widest bg-surface px-5 py-3 rounded-full border border-strong shadow-sm hover:shadow-brand/20 hover:-translate-y-1 hover:bg-brand">
            <span class="material-symbols-outlined text-lg">admin_panel_settings</span>
            Painel Admin
          </a>
        </header>

        <!-- Category Tabs (Android Folder Style Navigation) -->
        <div class="flex gap-2 overflow-x-auto custom-scrollbar pb-3 mb-4 snap-x">
          <button 
            class="snap-start flex-none px-5 py-2.5 rounded-xl text-sm font-bold transition-all border shadow-sm outline-none whitespace-nowrap flex items-center gap-2"
            [class.bg-brand]="selectedCategory() === 'all'"
            [class.text-white]="selectedCategory() === 'all'"
            [class.border-brand]="selectedCategory() === 'all'"
            [class.bg-surface-elevated]="selectedCategory() !== 'all'"
            [class.text-muted]="selectedCategory() !== 'all'"
            [class.border-strong]="selectedCategory() !== 'all'"
            [class.hover:border-subtle]="selectedCategory() !== 'all'"
            (click)="selectedCategory.set('all')">
            <span class="material-symbols-outlined text-[18px]">apps</span>
            Todos os Apps
          </button>
          
          @for (category of visibleCategories(); track category.id) {
            <button 
              class="snap-start flex-none px-5 py-2.5 rounded-xl text-sm font-bold transition-all border shadow-sm outline-none whitespace-nowrap flex items-center gap-2"
              [class.bg-brand]="selectedCategory() === category.id"
              [class.text-white]="selectedCategory() === category.id"
              [class.border-brand]="selectedCategory() === category.id"
              [class.bg-surface-elevated]="selectedCategory() !== category.id"
              [class.text-muted]="selectedCategory() !== category.id"
              [class.border-strong]="selectedCategory() !== category.id"
              [class.hover:border-subtle]="selectedCategory() !== category.id"
              (click)="selectedCategory.set(category.id)">
              <span class="material-symbols-outlined text-[18px]">{{ category.icon }}</span>
              {{ category.title }}
            </button>
          }
        </div>
      </div>

      <div class="max-w-7xl mx-auto w-full relative z-10 flex-1 overflow-y-auto custom-scrollbar pb-10">
        @for (category of activeCategories(); track category.id) {
          <div class="mb-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
            @if (selectedCategory() === 'all') {
              <h2 class="text-sm font-black text-muted uppercase tracking-widest pl-2 mb-4 flex items-center gap-2">
                 <span class="material-symbols-outlined">{{ category.icon }}</span> {{ category.title }}
              </h2>
            }
            <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 sm:gap-4 md:gap-5">
              @for (item of category.items; track item.path) {
                <a [routerLink]="item.path" 
                   title="{{ item.description }}"
                   class="group relative bg-surface-elevated/60 backdrop-blur-md rounded-2xl p-4 sm:p-5 border border-strong hover:bg-surface-elevated hover:border-brand/40 shadow-sm transition-all duration-200 hover:-translate-y-1 flex flex-col items-center justify-start text-center overflow-hidden active:scale-95">
                  <div [class]="'w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center mb-3 transition-transform duration-300 group-hover:scale-110 shadow-inner relative z-10 shrink-0 ' + item.color">
                    <span class="material-symbols-outlined text-2xl sm:text-[28px] text-white drop-shadow-md">{{ item.icon }}</span>
                  </div>
                  <h3 class="text-[10px] sm:text-[11px] md:text-xs font-bold text-title group-hover:text-brand transition-colors leading-tight line-clamp-2">{{ item.name }}</h3>
                </a>
              }
            </div>
          </div>
        }

        @if (activeCategories().length === 0) {
          <div class="text-center py-20 bg-surface-elevated/80 backdrop-blur-md border border-subtle rounded-[2rem] shadow-inner">
            <span class="material-symbols-outlined text-6xl text-muted mb-4 opacity-50 drop-shadow-sm">lock</span>
            <p class="text-muted text-lg font-bold tracking-tight">Você não tem permissões para acessar nenhuma funcionalidade.</p>
          </div>
        }
      </div>
      
      <!-- Mobile Admin button -->
      <div class="sm:hidden absolute bottom-6 right-6 z-20">
         <a routerLink="/admin" class="flex items-center justify-center w-14 h-14 bg-surface border border-strong shadow-lg rounded-full text-muted hover:text-white hover:bg-brand transition-colors">
            <span class="material-symbols-outlined text-2xl">admin_panel_settings</span>
         </a>
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

  selectedCategory = signal<string>('all');

  private allCategories: LaunchpadCategory[] = [
    {
      id: 'vendas',
      title: 'Vendas & Atendimento',
      icon: 'point_of_sale',
      items: [
        { name: 'PDV', path: '/pos', icon: 'receipt_long', color: 'bg-emerald-500 shadow-emerald-500/20', description: 'Realize vendas, gerencie mesas e comandas.' },
        { name: 'Caixa', path: '/cashier', icon: 'point_of_sale', color: 'bg-blue-500 shadow-blue-500/20', description: 'Controle de fluxo de caixa e fechamentos.' },
        { name: 'Clientes', path: '/customers', icon: 'group', color: 'bg-indigo-500 shadow-indigo-500/20', description: 'Cadastros e histórico de clientes.' },
        { name: 'Reservas', path: '/reservations', icon: 'calendar_month', color: 'bg-teal-500 shadow-teal-500/20', description: 'Gerencie reservas de mesas e eventos.' },
      ]
    },
    {
      id: 'delivery',
      title: 'Delivery',
      icon: 'local_shipping',
      items: [
        { name: 'Entregas', path: '/delivery', icon: 'local_shipping', color: 'bg-rose-500 shadow-rose-500/20', description: 'Gerencie entregadores e status de delivery.' },
        { name: 'iFood Loja', path: '/ifood-store-manager', icon: 'storefront', color: 'bg-red-500 shadow-red-500/20', description: 'Gerencie o status da loja no iFood.' },
        { name: 'Gestor de Cardápio', path: '/ifood-menu', icon: 'menu_book', color: 'bg-red-600 shadow-red-600/20', description: 'Monte seu cardápio, combos e opcionais.' },
        { name: 'iFood KDS', path: '/ifood-kds', icon: 'fastfood', color: 'bg-red-400 shadow-red-400/20', description: 'Cozinha dedicada aos pedidos do iFood.' }
      ]
    },
    {
      id: 'producao',
      title: 'Produção & Estoque',
      icon: 'kitchen',
      items: [
        { name: 'Cozinha (KDS)', path: '/kds', icon: 'deck', color: 'bg-orange-500 shadow-orange-500/20', description: 'Gerencie o preparo dos pedidos em tempo real.' },
        { name: 'Produtos', path: '/menu', icon: 'restaurant_menu', color: 'bg-amber-600 shadow-amber-600/20', description: 'Gerencie categorias e produtos do cardápio.' },
        { name: 'Fichas Técnicas', path: '/technical-sheets', icon: 'blender', color: 'bg-lime-600 shadow-lime-600/20', description: 'Defina custos, receitas e métodos de preparo.' },
        { name: 'Estoque', path: '/inventory', icon: 'inventory_2', color: 'bg-purple-500 shadow-purple-500/20', description: 'Controle de insumos, lotes e validades.' },
        { name: 'Auditoria', path: '/inventory/audit', icon: 'fact_check', color: 'bg-fuchsia-600 shadow-fuchsia-600/20', description: 'Ajuste de estoque e contagem cega.' },
        { name: 'Porcionamento', path: '/inventory/portioning', icon: 'scale', color: 'bg-violet-600 shadow-violet-600/20', description: 'Preparos em lote e rendimento.' },
        { name: 'Mise en Place', path: '/mise-en-place', icon: 'checklist', color: 'bg-lime-500 shadow-lime-500/20', description: 'Organização e preparo prévio de ingredientes.' },
        { name: 'Compras', path: '/purchasing', icon: 'shopping_cart', color: 'bg-cyan-600 shadow-cyan-600/20', description: 'Ordem de compras e cotações.' },
        { name: 'Fornecedores', path: '/suppliers', icon: 'local_shipping', color: 'bg-slate-600 shadow-slate-600/20', description: 'Lista e contatos de fornecedores.' },
        { name: 'Requisições', path: '/requisitions', icon: 'move_to_inbox', color: 'bg-cyan-500 shadow-cyan-500/20', description: 'Solicite insumos para sua estação.' },
      ]
    },
    {
      id: 'qualidade',
      title: 'Rotina & Qualidade',
      icon: 'task_alt',
      items: [
        { name: 'Checklists', path: '/checklists', icon: 'checklist_rtl', color: 'bg-yellow-500 shadow-yellow-500/20', description: 'Verificações diárias de abertura e fechamento.' },
        { name: 'Temperaturas', path: '/temperatures', icon: 'thermostat', color: 'bg-blue-400 shadow-blue-400/20', description: 'Registro de temperaturas de equipamentos.' },
      ]
    },
    {
      id: 'gestao',
      title: 'Gestão & Equipe',
      icon: 'insights',
      items: [
        { name: 'Dashboard', path: '/dashboard', icon: 'dashboard', color: 'bg-indigo-600 shadow-indigo-600/20', description: 'Visão geral do desempenho do seu negócio.' },
        { name: 'Desempenho', path: '/performance', icon: 'trending_up', color: 'bg-emerald-600 shadow-emerald-600/20', description: 'Indicadores financeiros e crescimento.' },
        { name: 'Relatórios', path: '/reports', icon: 'analytics', color: 'bg-slate-500 shadow-slate-500/20', description: 'Análises detalhadas e exportação de dados.' },
        { name: 'Funcionários', path: '/employees', icon: 'badge', color: 'bg-amber-500 shadow-amber-500/20', description: 'Gestão de equipe, cargos e permissões.' },
        { name: 'Escalas', path: '/schedules', icon: 'calendar_view_week', color: 'bg-violet-500 shadow-violet-500/20', description: 'Visualize e gerencie as escalas da equipe.' },
        { name: 'Ponto', path: '/time-clock', icon: 'schedule', color: 'bg-pink-500 shadow-pink-500/20', description: 'Registro e gestão de jornada de trabalho.' },
        { name: 'Folgas', path: '/leave-management', icon: 'event_busy', color: 'bg-rose-400 shadow-rose-400/20', description: 'Aprovação de folgas e ausências.' },
        { name: 'Minhas Folgas', path: '/my-leave', icon: 'event_available', color: 'bg-teal-400 shadow-teal-400/20', description: 'Solicite suas folgas.' },
        { name: 'Holerites', path: '/payroll', icon: 'payments', color: 'bg-green-600 shadow-green-600/20', description: 'Folha de pagamento da equipe.' },
      ]
    },
    {
      id: 'outros',
      title: 'Sistema',
      icon: 'settings',
      items: [
        { name: 'Tutoriais', path: '/tutorials', icon: 'play_circle', color: 'bg-indigo-400 shadow-indigo-400/20', description: 'Aprenda a utilizar os recursos.' },
        { name: 'Configurações', path: '/settings', icon: 'settings', color: 'bg-gray-500 shadow-gray-500/20', description: 'Ajustes do sistema e perfil da empresa.' },
      ]
    }
  ];

  visibleCategories = computed(() => {
    const isDemo = this.demoService.isDemoMode();
    const demoAllowedPaths = ['/dashboard', '/pos', '/cashier', '/kds', '/inventory', '/requisitions', '/mise-en-place', '/checklists', '/temperatures', '/menu', '/customers', '/technical-sheets', '/purchasing', '/suppliers', '/employees', '/leave-management', '/my-leave', '/payroll'];

    return this.allCategories.map(cat => ({
      ...cat,
      items: cat.items.filter(item => {
        if (isDemo) return demoAllowedPaths.includes(item.path);
        return this.operationalAuthService.hasPermission(item.path);
      })
    })).filter(cat => cat.items.length > 0);
  });

  activeCategories = computed(() => {
    const cats = this.visibleCategories();
    return this.selectedCategory() === 'all' 
      ? cats 
      : cats.filter(c => c.id === this.selectedCategory());
  });
}

