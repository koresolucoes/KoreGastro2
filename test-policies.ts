import fs from 'fs';

const sql = fs.readFileSync('database.sql', 'utf8');

const tablePolicies = new Map<string, string[]>();

const regex = /CREATE POLICY "([^"]+)" ON "public"\."([^"]+)"/g;
let match;

while ((match = regex.exec(sql)) !== null) {
  const policyName = match[1];
  const tableName = match[2];
  if (!tablePolicies.has(tableName)) {
    tablePolicies.set(tableName, []);
  }
  tablePolicies.get(tableName)!.push(policyName);
}

let dropStatements = '';
let createStatements = '';

const exceptions = ['unit_permissions', 'stores'];

for (const [tableName, policies] of tablePolicies.entries()) {
  for (const policy of policies) {
    dropStatements += `DROP POLICY IF EXISTS "${policy}" ON "public"."${tableName}";\n`;
  }
  
  if (exceptions.includes(tableName)) continue;
  
  // Base multi-tenant policy
  if (tableName === 'requisitions') {
    createStatements += `CREATE POLICY "Enable multi-tenant access" ON "public"."${tableName}" USING (has_access_to_store(user_id) OR (target_unit_id IS NOT NULL AND has_access_to_store(target_unit_id))) WITH CHECK (has_access_to_store(user_id) OR (target_unit_id IS NOT NULL AND has_access_to_store(target_unit_id)));\n`;
  } else if (tableName === 'requisition_items') {
    createStatements += `CREATE POLICY "Enable multi-tenant access" ON "public"."${tableName}" USING (has_access_to_store(user_id) OR EXISTS (SELECT 1 FROM requisitions r WHERE r.id = requisition_id AND r.target_unit_id IS NOT NULL AND has_access_to_store(r.target_unit_id))) WITH CHECK (has_access_to_store(user_id) OR EXISTS (SELECT 1 FROM requisitions r WHERE r.id = requisition_id AND r.target_unit_id IS NOT NULL AND has_access_to_store(r.target_unit_id)));\n`;
  } else {
    // Need to check if user_id exists in this table. If not, it might not use user_id.
    // For now, let's assume all other tables use user_id.
    // We will verify this.
  }
}

fs.writeFileSync('fix-policies.sql', dropStatements + '\n' + createStatements);
console.log('Found tables:', Array.from(tablePolicies.keys()));
