const fs = require('fs');
let code = fs.readFileSync('src/components/admin/admin-dashboard.component.ts', 'utf8');

const s = `  async openAddMenuItemModal() {
    this.isAddingMenuItem.set(true);
    this.editingMenuItem.set({ name: '', category: 'Geral', price: 0, prep_time: 15, is_available: true });
  }`;

const r = `  async openAddMenuItemModal() {
    this.isAddingMenuItem.set(true);
    this.editingMenuItem.set({ name: '', category: 'Geral', price: 0, prep_time: 15, is_available: true });
  }

  async saveNewMenuItem() {
    const item = this.editingMenuItem();
    if (!item || !item.name) return;
    const tenantId = this.selectedCatalogTenantId();
    if (!tenantId) return;

    this.isLoading.set(true);
    await this.adminService.addTenantMenuItem(tenantId, {
      name: item.name,
      category: item.category || 'Geral',
      price: item.price,
      prep_time_in_minutes: item.prep_time || 15,
      is_available: item.is_available
    });
    
    await this.changeCatalogTenant(tenantId);
    this.notificationService.show(\`Item "\${item.name}" adicionado ao cardápio com sucesso!\`, 'success');
    this.cancelAddMenuItem();
    this.isLoading.set(false);
  }

  cancelAddMenuItem() {
    this.isAddingMenuItem.set(false);
    this.editingMenuItem.set(null);
  }`;

code = code.replace(s, r);
fs.writeFileSync('src/components/admin/admin-dashboard.component.ts', code);
console.log('Fixed new menu item method');
