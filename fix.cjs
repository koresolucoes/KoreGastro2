const fs = require('fs');
let code = fs.readFileSync('src/components/admin/admin-dashboard.component.ts', 'utf8');

const s1 = `  async openTicketForProfile(profile: any) {
    const subject = prompt(\`Abrir chamado para \${profile.full_name}:\\nAssunto do Chamado:\`);
    if (!subject) return;
    
    const newTicket = {
      client_id: profile.id,
      store_name: profile.stores?.[0]?.name || 'Unidade Principal',
      subject: subject || 'Atendimento Ativo (Suporte)',
      priority: 'Média',
      messages: [
        { sender_type: 'system', text: 'Chamado aberto ativamente pelo Suporte KOR.' }
      ]
    };
    
    await this.adminService.addSupportTicket(newTicket);
    await this.loadSupportTickets();
    this.notificationService.show('Chamado aberto com sucesso!', 'success');
    this.activeTab.set('support');
  }`;

const r1 = `  async openTicketForProfile(profile: any) {
    this.newTicketProfile.set(profile);
    this.newTicketSubject = 'Atendimento Ativo (Suporte)';
    this.isCreatingTicket.set(true);
  }

  cancelCreateTicket() {
    this.isCreatingTicket.set(false);
    this.newTicketProfile.set(null);
    this.newTicketSubject = '';
  }

  async saveNewTicket() {
    const profile = this.newTicketProfile();
    if (!profile) return;
    const subject = this.newTicketSubject.trim();
    if (!subject) {
      this.notificationService.show('O assunto é obrigatório', 'error');
      return;
    }

    this.isLoading.set(true);
    const newTicket = {
      client_id: profile.id,
      store_name: profile.stores?.[0]?.name || 'Unidade Principal',
      subject: subject,
      priority: 'Média',
      messages: [
        { sender_type: 'system', text: 'Chamado aberto ativamente pelo Suporte KOR.' }
      ]
    };
    
    await this.adminService.addSupportTicket(newTicket);
    await this.loadSupportTickets();
    this.notificationService.show('Chamado aberto com sucesso', 'success');
    this.cancelCreateTicket();
    this.activeTab.set('support');
    this.isLoading.set(false);
  }`;

code = code.replace(s1, r1);

const s2 = `  async editMenuItemPrice(item: any) {
    const currentPrice = item.price;
    const input = prompt(\`Novo preço para "\${item.name}" (R$):\`, currentPrice.toFixed(2));
    if (input !== null) {
      const newPrice = parseFloat(input);
      if (!isNaN(newPrice) && newPrice >= 0) {
        const tenantId = this.selectedCatalogTenantId();
        await this.adminService.updateTenantMenuItem(tenantId, item.id, { price: newPrice });
        await this.changeCatalogTenant(tenantId);
        this.notificationService.show(\`Preço de "\${item.name}" atualizado para R$ \${newPrice.toFixed(2)}\`, 'success');
      }
    }
  }`;

const r2 = `  async editMenuItemPrice(item: any) {
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
  }`;

code = code.replace(s2, r2);


const s3 = `  async openAddMenuItemModal() {
    const tenantId = this.selectedCatalogTenantId();
    if (!tenantId) return;

    const name = prompt('Nome do Produto:');
    if (!name) return;
    const category = prompt('Categoria (ex: Pizzas, Bebidas):', 'Geral');
    const priceStr = prompt('Preço R$:', '25.00');
    const price = parseFloat(priceStr || '0');

    await this.adminService.addTenantMenuItem(tenantId, { name, category: category || 'Geral', price });
    await this.changeCatalogTenant(tenantId);
  }`;

const r3 = `  async openAddMenuItemModal() {
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

code = code.replace(s3, r3);

fs.writeFileSync('src/components/admin/admin-dashboard.component.ts', code);
console.log('Fixed prompts!');
