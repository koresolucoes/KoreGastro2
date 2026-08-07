const fs = require('fs');
let content = fs.readFileSync('api/ifood-webhook-lib/db-helpers.ts', 'utf8');
content = content.replace(/import\s*\{\s*JSDOM\s*\}\s*;/g, "import { JSDOM } from 'jsdom';");
fs.writeFileSync('api/ifood-webhook-lib/db-helpers.ts', content);
