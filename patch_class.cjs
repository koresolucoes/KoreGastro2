const fs = require('fs');
let content = fs.readFileSync('src/components/dashboard/dashboard.component.ts', 'utf8');

const target = `  private inventoryState = inject(InventoryStateService);
  private unitContextService = inject(UnitContextService);
  private router = inject(Router);
  
  // UI State`;

const replacement = `  private inventoryState = inject(InventoryStateService);
  private unitContextService = inject(UnitContextService);
  private operationalAuthService = inject(OperationalAuthService);
  private demoService = inject(DemoService);
  private router = inject(Router);
  
  private allCategories: LaunchpadCategory[] = [
    {
      id: 'vendas',
      title: 'Vendas & Atendimento',
      icon: 'point_of_sale',
      items: [
        { name: 'PDV', path: '/pos', icon: 'receipt_long', color: 'bg-emerald-500 shadow-emerald-500/20', description: 'Realize vendas, gerencie mesas e comandas.' },
        { name: 'Delivery', path: '/delivery', icon: 'local_shipping', color: 'bg-rose-500 shadow-rose-500/20', description: 'Gerencie entregadores e status de delivery.' },
        { name: 'Reservas', path: '/reservations', icon: 'calendar_month', color: 'bg-teal-500 shadow-teal-500/20', description: 'Gerencie reservas de mesas e eventos.' },
        { name: 'Clientes', path: '/customers', icon: 'group', color: 'bg-indigo-500 shadow-indigo-500/20', description: 'Cadastros e histórico de clientes.' },
        { name: 'Caixa', path: '/cashier', icon: 'point_of_sale', color: 'bg-blue-500 shadow-blue-500/20', description: 'Controle de fluxo de caixa e fechamentos.' },
      ]
    },
    {
      id: 'producao',
      title: 'Produção & Estoque',
      icon: 'kitchen',
      items: [
        { name: 'Cozinha (KDS)', path: '/kds', icon: 'soup_kitchen', color: 'bg-orange-500 shadow-orange-500/20', description: 'Gerencie o preparo dos pedidos.' },
        { name: 'Produtos', path: '/menu', icon: 'restaurant_menu', color: 'bg-amber-600 shadow-amber-600/20', description: 'Gerencie categorias e cardápio.' },
        { name: 'Estoque', path: '/inventory', icon: 'inventory_2', color: 'bg-purple-500 shadow-purple-500/20', description: 'Controle de insumos e lotes.' },
        { name: 'Mise en Place', path: '/mise-en-place', icon: 'checklist', color: 'bg-lime-500 shadow-lime-500/20', description: 'Organização de ingredientes.' },
        { name: 'Compras', path: '/purchasing', icon: 'shopping_cart', color: 'bg-cyan-600 shadow-cyan-600/20', description: 'Ordem de compras e cotações.' },
      ]
    },
    {
      id: 'gestao',
      title: 'Gestão & Equipe',
      icon: 'insights',
      items: [
        { name: 'Desempenho', path: '/performance', icon: 'trending_up', color: 'bg-emerald-600 shadow-emerald-600/20', description: 'Indicadores financeiros e crescimento.' },
        { name: 'Relatórios', path: '/reports', icon: 'analytics', color: 'bg-slate-500 shadow-slate-500/20', description: 'Análises detalhadas e exportação de dados.' },
        { name: 'Funcionários', path: '/employees', icon: 'badge', color: 'bg-amber-500 shadow-amber-500/20', description: 'Gestão de equipe e permissões.' },
        { name: 'Escalas', path: '/schedules', icon: 'calendar_view_week', color: 'bg-violet-500 shadow-violet-500/20', description: 'Visualize e gerencie as escalas.' },
        { name: 'Ponto', path: '/time-clock', icon: 'schedule', color: 'bg-pink-500 shadow-pink-500/20', description: 'Registro e gestão de jornada.' },
      ]
    },
    {
      id: 'sistema',
      title: 'Sistema',
      icon: 'settings',
      items: [
        { name: 'Configurações', path: '/settings', icon: 'settings', color: 'bg-gray-500 shadow-gray-500/20', description: 'Ajustes do sistema.' },
        { name: 'Tutoriais', path: '/tutorials', icon: 'play_circle', color: 'bg-indigo-400 shadow-indigo-400/20', description: 'Aprenda a utilizar os recursos.' },
      ]
    }
  ];

  visibleCategories = computed(() => {
    const isDemo = this.demoService.isDemoMode();
    const demoAllowedPaths = ['/dashboard', '/pos', '/cashier', '/kds', '/inventory', '/requisitions', '/mise-en-place', '/checklists', '/temperatures', '/menu', '/customers', '/technical-sheets', '/purchasing', '/suppliers', '/employees', '/leave-management', '/my-leave', '/payroll', '/whatsapp-chats'];
    
    return this.allCategories.map(cat => ({
      ...cat,
      items: cat.items.filter(item => {
        if (isDemo) return demoAllowedPaths.includes(item.path);
        return this.operationalAuthService.hasPermission(item.path);
      })
    })).filter(cat => cat.items.length > 0);
  });
  
  viewMode = signal<'grid' | 'list'>('grid');
  sortMode = signal<'name' | 'default'>('default');
  
  activeCategories = computed(() => {
    let cats = this.visibleCategories();
    
    if (this.sortMode() === 'name') {
       cats = cats.map(cat => ({
           ...cat,
           items: [...cat.items].sort((a,b) => a.name.localeCompare(b.name))
       }));
    }
    
    return cats;
  });

  // UI State`;

content = content.replace(target, replacement);
fs.writeFileSync('src/components/dashboard/dashboard.component.ts', content);
