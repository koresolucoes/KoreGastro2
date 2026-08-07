const fs = require('fs');

function fixFile(file) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Replace broken literals
    content = content.replace(/detail:\s*['"`](.*?)['"`]?\s*\}\)/g, (match, p1) => {
        // Just wrap it in string if it's broken
        return `detail: "${p1.replace(/"/g, '\\"')}" })`;
    });
    
    // Fix instances where it's cut off, like:
    // detail: '`employeeId` });
    // detail: `Invalid \`request_type\`. Must be one of: ${validTypes.join(' });
    content = content.replace(/detail:\s*'([^']*) \}\);/g, 'detail: "$1" });');
    content = content.replace(/detail:\s*`([^`]*) \}\);/g, 'detail: "$1" });');
    
    fs.writeFileSync(file, content);
    console.log("Fixed " + file);
}

['api/rh/ausencias.ts', 'api/rh/folha-pagamento.ts', 'api/rh/funcionarios.ts', 'api/v2/admin/subscriptions.ts', 'api/v2/payments.ts', 'api/v2/reservations.ts'].forEach(fixFile);
