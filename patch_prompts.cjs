const fs = require('fs');
let code = fs.readFileSync('src/components/admin/admin-dashboard.component.ts', 'utf8');

const s2 = `  async openAddMenuItemModal() {
    const tenantId = this.selectedCatalogTenantId();
    if (!tenantId) return;
    const name = prompt('Nome do Produto:');
    if (!name) return;
    const category = prompt('Categoria (ex: Pizzas, Bebidas):', 'Geral');
    const priceStr = prompt('Preço R$:', '25.00');
    const price = parseFloat(priceStr || '0');

    await this.adminService.addTenantMenuItem(tenantId, { name, category: category || 'Geral', price });
    await this.changeCatalogTenant(tenantId);
    this.notificationService.show(\`Item "\${name}" adicionado ao cardápio do cliente com sucesso!\`, 'success');
  }`;

const r2 = `  async openAddMenuItemModal() {
    this.isAddingMenuItem.set(true);
    this.editingMenuItem.set({ name: '', category: 'Geral', price: 0, prep_time: 15, is_available: true });
  }`;

code = code.replace(s2, r2);

const s3 = `  saveNewMenuItem() {
    // missing implementation? wait.
  }`;

fs.writeFileSync('src/components/admin/admin-dashboard.component.ts', code);
console.log('Fixed openAddMenuItemModal');
