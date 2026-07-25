const fs = require('fs');
let code = fs.readFileSync('src/services/system-admin.service.ts', 'utf8');

const replacements = [
  {
    from: /async updateSubscriptionStatus\\(userId: string, status: string, planId\\?: string, currentPeriodEnd\\?: string\\) \\{/,
    to: "async updateSubscriptionStatus(userId: string, status: string, planId?: string, currentPeriodEnd?: string) {\\n    this.auditService.logAction('UPDATE_SUBSCRIPTION', `Atualizado status da assinatura para ${status} (User: ${userId})`);"
  },
  {
    from: /async createPlan\\(plan: \\{ name: string; slug: string; price: number; trial_period_days: number; max_stores: number \\}\\) \\{/,
    to: "async createPlan(plan: { name: string; slug: string; price: number; trial_period_days: number; max_stores: number }) {\\n    this.auditService.logAction('CREATE_PLAN', `Criado plano de assinatura: ${plan.name}`);"
  },
  {
    from: /async updatePlan\\(planId: string, plan: Partial<\\{ name: string; slug: string; price: number; trial_period_days: number; max_stores: number \\}>\\) \\{/,
    to: "async updatePlan(planId: string, plan: Partial<{ name: string; slug: string; price: number; trial_period_days: number; max_stores: number }>) {\\n    this.auditService.logAction('UPDATE_PLAN', `Atualizado plano de assinatura: ${plan.name || planId}`);"
  },
  {
    from: /async updatePlanPermissions\\(planId: string, permissionKeys: string\\[\\]\\) \\{/,
    to: "async updatePlanPermissions(planId: string, permissionKeys: string[]) {\\n    this.auditService.logAction('UPDATE_PLAN_PERMISSIONS', `Atualizadas permissões do plano ${planId}`);"
  },
  {
    from: /async deletePlan\\(planId: string\\) \\{/,
    to: "async deletePlan(planId: string) {\\n    this.auditService.logAction('DELETE_PLAN', `Removido plano de assinatura: ${planId}`);"
  },
  {
    from: /async addSupportTicket\\(ticket: any\\) \\{/,
    to: "async addSupportTicket(ticket: any) {\\n    this.auditService.logAction('CREATE_TICKET', `Chamado criado: ${ticket.subject}`);"
  },
  {
    from: /async updateTenantMenuItem\\(tenantId: string, itemId: string, updates: Partial<\\{ name: string; price: number; is_available: boolean; category: string \\}>\\) \\{/,
    to: "async updateTenantMenuItem(tenantId: string, itemId: string, updates: Partial<{ name: string; price: number; is_available: boolean; category: string }>) {\\n    this.auditService.logAction('UPDATE_TENANT_MENU_ITEM', `Atualizado item do cardápio ${updates.name || itemId} do tenant ${tenantId}`);"
  },
  {
    from: /async addTenantMenuItem\\(tenantId: string, item: \\{ name: string; category: string; price: number; is_available\\?: boolean; prep_time_in_minutes\\?: number \\}\\) \\{/,
    to: "async addTenantMenuItem(tenantId: string, item: { name: string; category: string; price: number; is_available?: boolean; prep_time_in_minutes?: number }) {\\n    this.auditService.logAction('ADD_TENANT_MENU_ITEM', `Adicionado item do cardápio ${item.name} ao tenant ${tenantId}`);"
  }
];

replacements.forEach(r => {
  code = code.replace(r.from, r.to);
});

fs.writeFileSync('src/services/system-admin.service.ts', code);
console.log('Patched admin logs.');
