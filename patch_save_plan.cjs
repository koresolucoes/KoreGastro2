const fs = require('fs');
let code = fs.readFileSync('src/components/admin/admin-dashboard.component.ts', 'utf8');

const s = `  async saveEditedPlan() {
    const plan = this.editingPlan();
    if (!plan) return;
    
    this.isLoading.set(true);
    const { error } = await this.adminService.updatePlan(plan.id, {
      name: plan.name,
      slug: plan.slug,
      price: plan.price,
      trial_period_days: plan.trial_period_days,
      max_stores: plan.max_stores
    });
    
    if (error) {
      this.notificationService.alert('Erro ao atualizar plano: ' + error.message);
    } else {
      await this.adminService.updatePlanPermissions(plan.id, plan.activeModules);
      this.notificationService.show('Plano atualizado com sucesso!', 'success');
      this.cancelEditPlan();
      await this.loadData();
    }
    this.isLoading.set(false);
  }`;

const r = `  async saveEditedPlan() {
    const plan = this.editingPlan();
    if (!plan) return;
    
    this.isLoading.set(true);
    let planId = plan.id;
    
    if (plan.id === 'new') {
      const { data, error } = await this.adminService.createPlan({
        name: plan.name,
        slug: plan.slug || plan.name.toLowerCase().replace(/\\s+/g, '-'),
        price: plan.price,
        trial_period_days: plan.trial_period_days,
        max_stores: plan.max_stores
      });
      if (error) {
        this.notificationService.alert('Erro ao criar plano: ' + error.message);
        this.isLoading.set(false);
        return;
      }
      planId = data.id;
    } else {
      const { error } = await this.adminService.updatePlan(plan.id, {
        name: plan.name,
        slug: plan.slug,
        price: plan.price,
        trial_period_days: plan.trial_period_days,
        max_stores: plan.max_stores
      });
      if (error) {
        this.notificationService.alert('Erro ao atualizar plano: ' + error.message);
        this.isLoading.set(false);
        return;
      }
    }
    
    await this.adminService.updatePlanPermissions(planId, plan.activeModules || []);
    this.notificationService.show(plan.id === 'new' ? 'Plano criado com sucesso!' : 'Plano atualizado com sucesso!', 'success');
    this.cancelEditPlan();
    await this.loadData();
    this.isLoading.set(false);
  }`;

code = code.replace(s, r);

fs.writeFileSync('src/components/admin/admin-dashboard.component.ts', code);
console.log('Fixed saveEditedPlan');
