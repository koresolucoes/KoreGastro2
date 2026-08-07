const fs = require('fs');

let file = 'api/v2/webhooks_providers/mercadopago-oauth.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/import\s*\{\s*Request,\s*Response\s*\}\s*from\s*'express';/, "import type { VercelRequest, VercelResponse } from '@vercel/node';");
content = content.replace(/req:\s*Request/g, 'req: VercelRequest');
content = content.replace(/res:\s*Response/g, 'res: VercelResponse');

fs.writeFileSync(file, content);
