const fs = require('fs');

// We also need to fix `regenerate_external_api_key` in the reparation migration
// Let's first check settings-data.service.ts
let content = fs.readFileSync('src/services/settings-data.service.ts', 'utf8');

// The auditor says: "settings-data.service.ts:480-500 tenta fazer upsert nessa tabela diretamente do navegador, ignora o erro da operação e retorna sucesso baseado apenas no update de company_profile"
// Let's replace the direct supabase call with a call to our proxy or an RPC.
// Wait, is there a server-side route for settings? There is api/utils/api-handler or similar?
// Let's just create an RPC in the DB via migration and call it.
// The RPC will be `update_store_credentials`.
// Let's rewrite the `updateIntegrationCredentials` or whatever it's called.

content = content.replace(
  /const \{ error: credError \} = await this\.supabase\n\s*\.from\('store_integration_credentials'\)\n\s*\.upsert\(\{\n\s*store_id: userId,\n\s*\.\.\.credentials\n\s*\}\);/g,
  `const { error: credError } = await this.supabase.rpc('update_store_credentials', { p_store_id: userId, p_credentials: credentials });`
);

// We also need to make sure it doesn't ignore the error.
content = content.replace(
  /if \(credError\) \{\n\s*this\.logger\.error\('Failed to update integration credentials', credError\);\n\s*\}/,
  `if (credError) {\n      this.logger.error('Failed to update integration credentials', credError);\n      throw credError;\n    }`
);

fs.writeFileSync('src/services/settings-data.service.ts', content);
