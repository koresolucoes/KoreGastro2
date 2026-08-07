const fs = require('fs');

let file = 'api/focusnfe-proxy.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/const res = await callFocusNFeApi/g, 'const fetchRes = await callFocusNFeApi');
content = content.replace(/res\.caminho/g, 'fetchRes.caminho');
content = content.replace(/res\.chave_nfe/g, 'fetchRes.chave_nfe');

fs.writeFileSync(file, content);
