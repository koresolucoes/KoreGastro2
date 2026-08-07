const fs = require('fs');

function fix(file) {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    
    // Rename fetch `const res = await fetch` to `const fetchRes = await fetch`
    content = content.replace(/const res = await fetch/g, 'const fetchRes = await fetch');
    content = content.replace(/let res = await fetch/g, 'let fetchRes = await fetch');
    
    // In those specific files, carefully replace `res.` with `fetchRes.` where appropriate
    if (file.includes('focusnfe-proxy.ts') || file.includes('proxy-cielo-lio.ts') || file.includes('public-order.ts') || file.includes('mercadopago-oauth.ts')) {
        // We know that after `await fetch`, we check `!res.ok` or `res.status` or `res.json()`
        content = content.replace(/res\.ok/g, 'fetchRes.ok');
        content = content.replace(/res\.status !==/g, 'fetchRes.status !==');
        content = content.replace(/res\.status ===/g, 'fetchRes.status ===');
        content = content.replace(/\(res\.status\)/g, '(fetchRes.status)');
        content = content.replace(/res\.text\(\)/g, 'fetchRes.text()');
        // This handles res.json() as fetchRes.json() but wait, we also have res.status().json() which is for VercelResponse.
        content = content.replace(/await res\.json\(\)/g, 'await fetchRes.json()');
        // focusnfe specific
        content = content.replace(/res\.caminho/g, 'fetchRes.caminho');
        content = content.replace(/res\.chave_nfe/g, 'fetchRes.chave_nfe');
        // `res` is redefined in proxy cielo? `const res = await fetch` -> `fetchRes`.
        
        // Let's also check for any `res.status` in string templates
        content = content.replace(/\$\{res\.status\}/g, '${fetchRes.status}');
    }

    fs.writeFileSync(file, content);
}

const files = [
    'api/focusnfe-proxy.ts',
    'api/proxy-cielo-lio.ts',
    'api/public-order.ts',
    'api/v2/webhooks_providers/mercadopago-oauth.ts'
];

files.forEach(fix);
console.log("Done");
