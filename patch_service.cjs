const fs = require('fs');
let code = fs.readFileSync('src/services/system-admin.service.ts', 'utf8');

code = code.replace(/  async getPlans\(\) \{[\s\S]*?\.select\('\*'\)[\s\S]*?\.order\('price', \{ ascending: true \}\);/, `  async getPlans() {
    try {
      const { data, error } = await supabase
        .from('plans')
        .select('*, plan_permissions(*)')
        .order('price', { ascending: true });`);

const newMethods = `
  async updatePlanPermissions(planId: string, permissionKeys: string[]) {
    try {
      await supabase.from('plan_permissions').delete().eq('plan_id', planId);
      if (permissionKeys.length > 0) {
        const inserts = permissionKeys.map(key => ({ plan_id: planId, permission_key: key }));
        await supabase.from('plan_permissions').insert(inserts);
      }
      return { error: null };
    } catch (error: any) {
      return { error };
    }
  }

  async updatePlan(planId: string, plan: Partial<{ name: string; slug: string; price: number; trial_period_days: number; max_stores: number }>) {`;

code = code.replace(/  async updatePlan\(planId: string, plan: Partial<\{ name: string; slug: string; price: number; trial_period_days: number; max_stores: number \}>\) \{/, newMethods);

fs.writeFileSync('src/services/system-admin.service.ts', code);
console.log('Patched service!');
