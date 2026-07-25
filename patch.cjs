const fs = require('fs');
let code = fs.readFileSync('src/components/admin/admin-dashboard.component.ts', 'utf8');

const signalDeclarations = `  // Catalog Inspector State
  selectedCatalogTenantId = signal<string>('');
  tenantMenuItems = signal<any[]>([]);
  editingMenuItem = signal<any>(null);
  isAddingMenuItem = signal(false);`;
code = code.replace(/  \/\/ Catalog Inspector State\n  selectedCatalogTenantId = signal<string>\(''\);\n  tenantMenuItems = signal<any\[\]>\(\[\]\);/, signalDeclarations);

const methodReplacements = `  async editMenuItemPrice(item: any) {
    this.editingMenuItem.set({ ...item });
  }

  async saveEditedMenuItem() {
    const item = this.editingMenuItem();
    if (!item) return;
    const tenantId = this.selectedCatalogTenantId();
    if (!tenantId) return;

    this.isLoading.set(true);
    await this.adminService.updateTenantMenuItem(tenantId, item.id, { 
      name: item.name,
      price: item.price,
      prep_time_in_minutes: item.prep_time || 15,
      is_available: item.is_available,
      category: item.category
    });
    await this.changeCatalogTenant(tenantId);
    this.notificationService.show(\`Produto "\${item.name}" atualizado com sucesso\`, 'success');
    this.editingMenuItem.set(null);
    this.isLoading.set(false);
  }

  cancelEditMenuItem() {
    this.editingMenuItem.set(null);
  }

  async openAddMenuItemModal() {
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
      is_available: item.is_available,
      prep_time_in_minutes: item.prep_time || 15
    });
    await this.changeCatalogTenant(tenantId);
    this.notificationService.show('Produto adicionado com sucesso', 'success');
    this.isAddingMenuItem.set(false);
    this.editingMenuItem.set(null);
    this.isLoading.set(false);
  }

  cancelAddMenuItem() {
    this.isAddingMenuItem.set(false);
    this.editingMenuItem.set(null);
  }`;

code = code.replace(/  async editMenuItemPrice\(item: any\) \{[\s\S]*?async openAddMenuItemModal\(\) \{[\s\S]*?this\.changeCatalogTenant\(tenantId\);\n  \}/, methodReplacements);

fs.writeFileSync('src/components/admin/admin-dashboard.component.ts', code);
console.log('Patched component methods.');
