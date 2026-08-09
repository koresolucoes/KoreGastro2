const fs = require('fs');

let health = fs.readFileSync('api/v2/health.ts', 'utf8');
health = health.replace(
  /export default async function handler\(req: any, res: any\) \{[\s\S]*\}\s*\} catch \(error: any\) \{/g,
  `export default async function handler(req: any, res: any) {
  try {
    return res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (error: any) {`
);
fs.writeFileSync('api/v2/health.ts', health);

let vercel = fs.readFileSync('vercel.json', 'utf8');
const vercelObj = JSON.parse(vercel);
if (vercelObj.headers) {
  vercelObj.headers.forEach(h => {
    if (h.source === "/(.*)") {
      h.headers.push({ key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;" });
      h.headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" });
      h.headers.push({ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" });
      h.headers.push({ key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" });
    }
  });
  fs.writeFileSync('vercel.json', JSON.stringify(vercelObj, null, 2));
}
