const fs = require('fs');
let file = 'src/components/purchasing/purchasing.component.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/case 'storage_conditions':/, "case 'version':\n                case 'last_updated_at':\n                case 'created_at':\n                case 'storage_conditions':");
fs.writeFileSync(file, content);
