const fs = require('fs');
let file = 'src/components/purchasing/purchasing.component.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/\(error as any\)\?/g, 'error');
content = content.replace(/result\.error\?\.message/g, '(result.error as any)?.message');
fs.writeFileSync(file, content);
