const fs = require('fs');
let codeAdmin = fs.readFileSync('src/components/admin/admin-dashboard.component.ts', 'utf8');

const s1 = `  async openTicketForProfile(profile: any) {
    this.openNewTicketPrompt(profile);
  }`;
const r1 = `  async openTicketForProfile(profile: any) {
    this.newTicketProfile.set(profile);
    this.openNewTicketPrompt();
  }`;

codeAdmin = codeAdmin.replace(s1, r1);
fs.writeFileSync('src/components/admin/admin-dashboard.component.ts', codeAdmin);

let codeSvc = fs.readFileSync('src/services/system-admin.service.ts', 'utf8');

const s2 = `async addTenantMenuItem(tenantId: string, item: { name: string; category: string; price: number; is_available?: boolean }) {`;
const r2 = `async addTenantMenuItem(tenantId: string, item: { name: string; category: string; price: number; promotional_price?: number | null; sku?: string | null; is_available?: boolean; prep_time_in_minutes?: number }) {`;
codeSvc = codeSvc.replace(s2, r2);

fs.writeFileSync('src/services/system-admin.service.ts', codeSvc);
console.log('Fixed lint issues.');
