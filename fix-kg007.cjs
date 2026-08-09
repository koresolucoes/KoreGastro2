const fs = require('fs');

let gemini = fs.readFileSync('api/ai/gemini-proxy.ts', 'utf8');
gemini = gemini.replace(
  /export default async function handler\(req: any, res: any\) {/,
  'export default async function handler(req: any, res: any) {\n  return res.status(403).json({ error: "Endpoint temporariamente desabilitado por segurança" });'
);
fs.writeFileSync('api/ai/gemini-proxy.ts', gemini);

let waSend = fs.readFileSync('api/whatsapp/send-message.ts', 'utf8');
waSend = waSend.replace(
  /export default async function handler\(req: any, res: any\) {/,
  'export default async function handler(req: any, res: any) {\n  return res.status(403).json({ error: "Endpoint temporariamente desabilitado por segurança" });'
);
fs.writeFileSync('api/whatsapp/send-message.ts', waSend);

let waNotify = fs.readFileSync('api/whatsapp/notify-status.ts', 'utf8');
waNotify = waNotify.replace(
  /export default async function handler\(req: any, res: any\) {/,
  'export default async function handler(req: any, res: any) {\n  return res.status(403).json({ error: "Endpoint temporariamente desabilitado por segurança" });'
);
fs.writeFileSync('api/whatsapp/notify-status.ts', waNotify);
