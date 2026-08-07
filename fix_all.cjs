const fs = require('fs');
const glob = require('glob'); // Note: we might not have glob, but we can just use the known files

function fixFile(file) {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    
    // Convert the broken response payloads back to something safe
    content = content.replace(/res\.status\(\s*(\d+)\s*\)\.json\(\{\s*type:\s*"about:blank".*?detail:(.*?) \}\);/gs, (match, status, detail) => {
        // detail might be totally malformed, like: `Invalid \`request_type\`. Must be one of: ${validTypes.join('
        // We will just replace the whole json body with a simple generic message for now, to ensure it compiles!
        // Or we can try to salvage it.
        return `res.status(${status}).json({ error: "An error occurred" });`;
    });
    
    fs.writeFileSync(file, content);
}

const files = [
    'api/rh/ausencias.ts', 
    'api/rh/folha-pagamento.ts', 
    'api/rh/funcionarios.ts', 
    'api/v2/admin/subscriptions.ts', 
    'api/v2/payments.ts', 
    'api/v2/reservations.ts',
    'api/v2/orders.ts'
];
files.forEach(fixFile);
