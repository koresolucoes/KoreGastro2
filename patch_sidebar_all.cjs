const fs = require('fs');
let content = fs.readFileSync('src/components/sidebar/sidebar.component.ts', 'utf8');

const newNavGroups = `  allNavGroups: NavGroup[] = [
    {
      name: 'Painel',
      id: 'painel',
      children: [
        { name: 'Visão Geral', path: '/dashboard', icon: 'dashboard' },
        { name: 'Desempenho', path: '/performance', icon: 'trending_up' },
        { name: 'Relatórios', path: '/reports', icon: 'analytics' },
      ]
    },
    {
      name: 'Operação',
      id: 'operacao',
      children: [
        { name: 'PDV', path: '/pos', icon: 'point_of_sale' },
        { name: 'Salão & Reservas', path: '/reservations', icon: 'calendar_month' },
        { name: 'Cozinha (KDS)', path: '/kds', icon: 'soup_kitchen' },
        { name: 'Delivery', path: '/delivery', icon: 'local_shipping' },
        { name: 'Caixa', path: '/cashier', icon: 'payments' },
        { name: 'WhatsApp IA', path: '/whatsapp-chats', icon: 'forum' },
        { name: 'Checklists', path: '/checklists', icon: 'checklist' },
        { name: 'Temperaturas', path: '/temperatures', icon: 'device_thermostat' },
      ]
    },
    {
      name: 'Produção & Estoque',
      id: 'producao',
      children: [
        { name: 'Cardápio Digital', path: '/menu', icon: 'restaurant_menu' },
        { name: 'Estoque Geral', path: '/inventory', icon: 'inventory_2' },
        { name: 'Requisições', path: '/requisitions', icon: 'move_to_inbox' },
        { name: 'Mise en Place', path: '/mise-en-place', icon: 'kitchen' },
        { name: 'Fichas Técnicas', path: '/technical-sheets', icon: 'menu_book' },
        { name: 'Compras', path: '/purchasing', icon: 'shopping_cart' },
        { name: 'Fornecedores', path: '/suppliers', icon: 'local_shipping' },
      ]
    },
    {
      name: 'Integrações',
      id: 'integracoes',
      children: [
        { name: 'iFood (KDS)', path: '/ifood-kds', icon: 'delivery_dining' },
        { name: 'Cardápio iFood', path: '/ifood-menu', icon: 'fastfood' },
        { name: 'Gestor iFood', path: '/ifood-store-manager', icon: 'storefront' },
      ]
    },
    {
      name: 'Gestão & Equipe',
      id: 'gestao',
      children: [
        { name: 'Clientes', path: '/customers', icon: 'group' },
        { name: 'Equipe', path: '/employees', icon: 'badge' },
        { name: 'Ponto Eletrônico', path: '/time-clock', icon: 'schedule' },
        { name: 'Escalas', path: '/schedules', icon: 'calendar_view_week' },
        { name: 'Gestão de Folgas', path: '/leave-management', icon: 'event_busy' },
        { name: 'Folha & Holerites', path: '/payroll', icon: 'payments' },
      ]
    },
    {
      name: 'Sistema',
      id: 'sistema',
      children: [
        { name: 'Configurações', path: '/settings', icon: 'settings' },
        { name: 'Auditoria', path: '/inventory/audit', icon: 'fact_check' },
        { name: 'Porcionamento', path: '/inventory/portioning', icon: 'straighten' },
        { name: 'Construtor Menu', path: '/menu-builder', icon: 'design_services' },
        { name: 'Tutoriais', path: '/tutorials', icon: 'play_circle' },
        { name: 'Suporte', path: '/support', icon: 'help_center' },
      ]
    }
  ];`;

content = content.replace(/allNavGroups: NavGroup\[\] = \[[\s\S]*?\];\n  navGroups/m, newNavGroups + '\n  navGroups');

const newDemoAllowed = `const demoAllowedPaths = ['/dashboard', '/performance', '/reports', '/pos', '/reservations', '/kds', '/delivery', '/cashier', '/whatsapp-chats', '/checklists', '/temperatures', '/menu', '/inventory', '/requisitions', '/mise-en-place', '/technical-sheets', '/purchasing', '/suppliers', '/ifood-kds', '/ifood-menu', '/ifood-store-manager', '/customers', '/employees', '/time-clock', '/schedules', '/leave-management', '/payroll', '/settings', '/inventory/audit', '/inventory/portioning', '/menu-builder', '/tutorials', '/support'];`;
content = content.replace(/const demoAllowedPaths = \[.*?\];/, newDemoAllowed);

fs.writeFileSync('src/components/sidebar/sidebar.component.ts', content);
