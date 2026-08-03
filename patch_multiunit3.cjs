const fs = require('fs');
let content = fs.readFileSync('src/components/settings/multi-unit-settings/multi-unit-settings.component.ts', 'utf8');

content = content.replace(
  "res.error?.message",
  "res.message"
);
content = content.replace(
  "res.error?.message",
  "res.message"
);

fs.writeFileSync('src/components/settings/multi-unit-settings/multi-unit-settings.component.ts', content);
