const fs = require('fs');
let content = fs.readFileSync('src/components/top-nav/top-nav.component.ts', 'utf8');

const replacement = `
  searchQuery = signal('');
  searchResults = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return [];
    
    // Simple static search for now
    const allApps = [
      { name: 'Dashboard', path: '/dashboard', icon: 'dashboard', desc: 'Visão Geral' },
      { name: 'PDV', path: '/pos', icon: 'point_of_sale', desc: 'Frente de Caixa' },
      { name: 'Caixa', path: '/cashier', icon: 'payments', desc: 'Gestão de Caixa' },
      { name: 'Cozinha (KDS)', path: '/kds', icon: 'soup_kitchen', desc: 'Tela de Pedidos' },
      { name: 'Delivery', path: '/delivery', icon: 'local_shipping', desc: 'Gestão de Entregas' },
      { name: 'Reservas', path: '/reservations', icon: 'calendar_month', desc: 'Mesas e Eventos' },
      { name: 'Clientes', path: '/customers', icon: 'group', desc: 'Cadastro de Clientes' },
      { name: 'Estoque', path: '/inventory', icon: 'inventory_2', desc: 'Gestão de Estoque' },
      { name: 'Produtos', path: '/menu', icon: 'restaurant_menu', desc: 'Cardápio e Categorias' },
      { name: 'Compras', path: '/purchasing', icon: 'shopping_cart', desc: 'Fornecedores e Cotações' },
      { name: 'Relatórios', path: '/reports', icon: 'analytics', desc: 'Métricas e Resultados' },
      { name: 'Configurações', path: '/settings', icon: 'settings', desc: 'Ajustes do Sistema' },
      { name: 'Funcionários', path: '/employees', icon: 'badge', desc: 'Equipe e Permissões' },
    ];
    
    return allApps.filter(app => 
      app.name.toLowerCase().includes(query) || 
      app.desc.toLowerCase().includes(query)
    );
  });

  onSearchInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
    this.isSearchOpen.set(true);
  }

  closeSearch() {
    this.isSearchOpen.set(false);
    this.searchQuery.set('');
  }
`;

content = content.replace('  isSearchOpen = signal(false);', '  isSearchOpen = signal(false);' + replacement);

content = content.replace(`  @HostListener('document:click', ['$event'])
  closeDropdowns() {
    this.openDropdown.set(null);
  }`, `  @HostListener('document:click', ['$event'])
  closeDropdowns(event: Event) {
    this.openDropdown.set(null);
    const target = event.target as HTMLElement;
    if (!target.closest('.search-container')) {
      this.closeSearch();
    }
  }`);

content = content.replace(`import { Component, ChangeDetectionStrategy, inject, signal, HostListener } from '@angular/core';`, `import { Component, ChangeDetectionStrategy, inject, signal, computed, HostListener } from '@angular/core';`);

fs.writeFileSync('src/components/top-nav/top-nav.component.ts', content);
