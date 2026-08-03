const fs = require('fs');
let content = fs.readFileSync('src/components/settings/multi-unit-settings/multi-unit-settings.component.ts', 'utf8');

content = content.replace(
  "this.notificationService.show(`Erro ao criar unidade: ${res.error?.message || 'Falha na criação'}`, 'error');",
  "this.notificationService.show(`Erro ao criar unidade: ${res.message || 'Falha na criação'}`, 'error');"
);

fs.writeFileSync('src/components/settings/multi-unit-settings/multi-unit-settings.component.ts', content);
