const fs = require('fs');

function replace(file, search, replaceStr) {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(search, replaceStr);
    fs.writeFileSync(file, content);
}

replace('api/v2/customers.ts', /DOMPurify\(window.*?\)/, 'DOMPurify(window as any)');
replace('api/v2/orders.ts', /DOMPurify\(window.*?\)/, 'DOMPurify(window as any)');
replace('api/ifood-webhook-lib/db-helpers.ts', /DOMPurify\(window.*?\)/, 'DOMPurify(window as any)');

