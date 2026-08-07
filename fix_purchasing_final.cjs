const fs = require('fs');
let file = 'src/components/purchasing/purchasing.component.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/case 'version':[\s\S]*?case 'created_at':\s*/g, '');
fs.writeFileSync(file, content);
