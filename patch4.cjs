const fs = require('fs');

// Patch environment.ts
let envCode = fs.readFileSync('src/config/environment.ts', 'utf8');
envCode = envCode.replace(/typeof SUPABASE_URL !== 'undefined' \? SUPABASE_URL : ''/g, "''");
envCode = envCode.replace(/typeof SUPABASE_ANON_KEY !== 'undefined' \? SUPABASE_ANON_KEY : ''/g, "''");
envCode = envCode.replace(/import\.meta\.env\['VITE_SUPABASE_URL'\] as string/g, "''");
envCode = envCode.replace(/import\.meta\.env\['VITE_SUPABASE_ANON_KEY'\] as string/g, "''");
fs.writeFileSync('src/config/environment.ts', envCode);

// Patch demo.service.ts
let demoCode = fs.readFileSync('src/services/demo.service.ts', 'utf8');
demoCode = demoCode.replace(/import\.meta\.env\.VITE_IS_DEMO/g, "''");
fs.writeFileSync('src/services/demo.service.ts', demoCode);

