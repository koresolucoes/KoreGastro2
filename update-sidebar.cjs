const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/components/sidebar/sidebar.component.ts');
let content = fs.readFileSync(filePath, 'utf8');

const newGroups = `  allNavGroups: NavGroup[] = [
    {
      name: 'Painel',
      id: 'painel',
      children: [
        { name: 'Visão Geral', path: '/dashboard', icon: 'dashboard' },
        { name: 'Tutoriais', path: '/tutorials', icon: 'school' },
      ]
    },
    {
      name: 'Atendimento & Vendas',
      id: 'vendas',
      children: [
        { name: 'PDV (Caixa)', path: '/pos', icon: 'point_of_sale' },
        { name: 'Salão & Mesas', path: '/reservations', icon: 'event_seat' },
        { name: 'Delivery', path: '/delivery', icon: 'local_shipping' },
        { name: 'WhatsApp', path: '/whatsapp-chats', icon: 'chat' },
        { name: 'Caixa & Fechamento', path: '/cashier', icon: 'payments' },
      ]
    },
    {
      name: 'Cozinha & Operação',
      id: 'cozinha',
      children: [
        { name: 'KDS Principal', path: '/kds', icon: 'soup_kitchen' },
        { name: 'KDS iFood', path: '/ifood-kds', icon: 'takeout_dining' },
        { name: 'Mise en Place', path: '/mise-en-place', icon: 'skillet' },
        { name: 'Checklists', path: '/checklists', icon: 'checklist' },
        { name: 'Temperaturas', path: '/temperatures', icon: 'thermostat' },
      ]
    },
    {
      name: 'Cardápios',
      id: 'cardapios',
      children: [
        { name: 'Menu & Produtos', path: '/menu', icon: 'restaurant_menu' },
        { name: 'Editor Visual', path: '/menu-builder', icon: 'edit_note' },
        { name: 'Cardápio iFood', path: '/ifood-menu', icon: 'app_shortcut' },
        { name: 'Fichas Técnicas', path: '/technical-sheets', icon: 'menu_book' },
      ]
    },
    {
      name: 'Estoque & Compras',
      id: 'estoque',
      children: [
        { name: 'Estoque Geral', path: '/inventory', icon: 'inventory_2' },
        { name: 'Auditoria', path: '/inventory/audit', icon: 'fact_check' },
        { name: 'Requisições', path: '/requisitions', icon: 'assignment_turned_in' },
        { name: 'Porcionamento', path: '/inventory/portioning', icon: 'content_cut' },
        { name: 'Compras', path: '/purchasing', icon: 'shopping_cart' },
        { name: 'Fornecedores', path: '/suppliers', icon: 'fire_truck' },
      ]
    },
    {
      name: 'Equipe & RH',
      id: 'rh',
      children: [
        { name: 'Funcionários', path: '/employees', icon: 'badge' },
        { name: 'Ponto Eletrônico', path: '/time-clock', icon: 'alarm_on' },
        { name: 'Escalas', path: '/schedules', icon: 'calendar_view_week' },
        { name: 'Ausências', path: '/leave-management', icon: 'event_busy' },
        { name: 'Folha de Pagamento', path: '/payroll', icon: 'receipt_long' },
        { name: 'Desempenho', path: '/performance', icon: 'trending_up' },
        { name: 'Meu RH', path: '/my-leave', icon: 'person' },
      ]
    },
    {
      name: 'Gestão & Relatórios',
      id: 'gestao',
      children: [
        { name: 'Relatórios', path: '/reports', icon: 'analytics' },
        { name: 'Clientes & CRM', path: '/customers', icon: 'group' },
        { name: 'Gestão iFood', path: '/ifood-store-manager', icon: 'storefront' },
      ]
    },
    {
      name: 'Sistema',
      id: 'sistema',
      children: [
        { name: 'Configurações', path: '/settings', icon: 'settings' },
        { name: 'Suporte', path: '/support', icon: 'help_center' },
      ]
    }
  ];`;

content = content.replace(/allNavGroups: NavGroup\[\] = \[.*}\s*\];/s, newGroups);

fs.writeFileSync(filePath, content);
console.log('Sidebar updated!');
