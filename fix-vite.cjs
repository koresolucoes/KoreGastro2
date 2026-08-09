const fs = require('fs');
let content = fs.readFileSync('vite.config.ts', 'utf8');

const prodCheck = `
  if (mode === 'production') {
    if (!supabaseUrl) {
      console.error('ERRO CRÍTICO: SUPABASE_URL é obrigatório para o build de produção.');
      throw new Error('MISSING_SUPABASE_URL');
    }
`;

content = content.replace(
  /if \(mode === 'production'\) \{/,
  prodCheck
);

fs.writeFileSync('vite.config.ts', content);
