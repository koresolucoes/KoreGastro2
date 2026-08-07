const fs = require('fs');

function replace(file, search, replaceStr) {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(search, replaceStr);
    fs.writeFileSync(file, content);
    console.log("Fixed " + file);
}

replace('api/ai/gemini-proxy.ts', /\bres\.status/g, 'response.status');
replace('api/delivery-location.ts', /\bres\.status/g, 'response.status');
replace('api/ifood-webhook.ts', /\bres\.status/g, 'response.status');
replace('api/rh/ausencias.ts', /\bres\.status/g, 'response.status');
replace('api/rh/cargos.ts', /\bres\.status/g, 'response.status');
replace('api/rh/escalas.ts', /\bres\.status/g, 'response.status');
replace('api/rh/folha-pagamento.ts', /\bres\.status/g, 'response.status');
replace('api/rh/funcionarios.ts', /\bres\.status/g, 'response.status');
replace('api/rh/permissoes-disponiveis.ts', /\bres\.status/g, 'response.status');
replace('api/rh/ponto.ts', /\bres\.status/g, 'response.status');
replace('api/rh/ponto/bater-ponto.ts', /\bres\.status/g, 'response.status');
replace('api/rh/verificar-pin.ts', /\bres\.status/g, 'response.status');
replace('api/v2/employees.ts', /\bres\.status/g, 'response.status');
replace('api/v2/halls.ts', /\bres\.status/g, 'response.status');
replace('api/v2/ingredients.ts', /\bres\.status/g, 'response.status');
replace('api/v2/loyalty.ts', /\bres\.status/g, 'response.status');
replace('api/v2/menu-items.ts', /\bres\.status/g, 'response.status');
replace('api/v2/payments.ts', /\bres\.status/g, 'response.status');
replace('api/v2/recipes.ts', /\bres\.status/g, 'response.status');
replace('api/v2/reports.ts', /\bres\.status/g, 'response.status');
replace('api/v2/reservations.ts', /\bres\.status/g, 'response.status');
replace('api/v2/tables.ts', /\bres\.status/g, 'response.status');
replace('api/v2/trigger-webhook.ts', /\bres\.status/g, 'response.status');
replace('api/v2/webhooks.ts', /\bres\.status/g, 'response.status');

// Fix `Window` error
replace('api/v2/orders.ts', /verifySignature\(signature,\s*rawBody,\s*ifoodSecret\)/g, 'verifySignature(signature, rawBody, ifoodSecret)');
// Fix db-helpers
replace('api/ifood-webhook-lib/db-helpers.ts', /from 'jsdom'/g, ''); // Wait, the window issue was not jsdom.

