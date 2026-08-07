const fs = require('fs');

function replace(file, search, replaceStr) {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(search, replaceStr);
    fs.writeFileSync(file, content);
}

replace('api/v2/webhooks_providers/ifood.ts', /'\.\/ifood-webhook-lib/g, "'../../ifood-webhook-lib");
replace('api/v2/webhooks_providers/ifood.ts', /'\.\/utils/g, "'../../utils");

replace('api/v2/webhooks_providers/cielo.ts', /'\.\/utils/g, "'../../utils");
replace('api/v2/webhooks_providers/mercadopago-auth-url.ts', /'\.\/utils/g, "'../../utils");
replace('api/v2/webhooks_providers/mercadopago-oauth.ts', /'\.\/utils/g, "'../../utils");
replace('api/v2/webhooks_providers/mercadopago-preferences.ts', /'\.\/utils/g, "'../../utils");
replace('api/v2/webhooks_providers/mercadopago.ts', /'\.\/utils/g, "'../../utils");
