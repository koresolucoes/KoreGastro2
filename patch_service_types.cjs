const fs = require('fs');
let code = fs.readFileSync('src/services/system-admin.service.ts', 'utf8');

const s1 = `async updateTenantMenuItem(tenantId: string, itemId: string, updates: Partial<{ name: string; price: number; is_available: boolean; category: string }>) {`;
const r1 = `async updateTenantMenuItem(tenantId: string, itemId: string, updates: Partial<{ name: string; price: number; promotional_price?: number; sku?: string; is_available: boolean; category: string; prep_time_in_minutes?: number }>) {`;
code = code.replace(s1, r1);

const s2 = `async addTenantMenuItem(tenantId: string, item: { name: string; category: string; price: number; is_available?: boolean; prep_time_in_minutes?: number }) {`;
const r2 = `async addTenantMenuItem(tenantId: string, item: { name: string; category: string; price: number; promotional_price?: number; sku?: string; is_available?: boolean; prep_time_in_minutes?: number }) {`;
code = code.replace(s2, r2);

fs.writeFileSync('src/services/system-admin.service.ts', code);
console.log('Fixed service types');
