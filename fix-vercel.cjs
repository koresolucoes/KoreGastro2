const fs = require('fs');
let vercel = fs.readFileSync('vercel.json', 'utf8');
const vercelObj = JSON.parse(vercel);
vercelObj.headers[0].headers = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Content-Security-Policy", value: "default-src 'self' wss: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:;" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" }
];
fs.writeFileSync('vercel.json', JSON.stringify(vercelObj, null, 2));
