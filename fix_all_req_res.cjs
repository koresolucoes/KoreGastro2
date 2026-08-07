const fs = require('fs');

function fix(file) {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    
    // Normalize parameter names for handler
    // Both standard and withAuth
    content = content.replace(/(handler\s*\(\s*)[a-zA-Z0-9_]+\s*:\s*[a-zA-Z0-9_]+,\s*[a-zA-Z0-9_]+\s*:\s*[a-zA-Z0-9_]+/g, '$1req: any, res: any');
    content = content.replace(/(handler\s*\(\s*)[a-zA-Z0-9_]+\s*,\s*[a-zA-Z0-9_]+/g, '$1req, res');
    
    // Some functions in api might be helpers that take req, res. We should probably be careful, 
    // but honestly just fixing `handler` and `handleGet`, `handlePost` etc might be easier if we just look for functions that take request, response
    content = content.replace(/\(request\s*:/g, '(req:');
    content = content.replace(/\bresponse\s*:/g, 'res:');
    content = content.replace(/\(request\s*,/g, '(req,');
    content = content.replace(/,\s*response\b/g, ', res');
    
    // Fix the method calls
    content = content.replace(/\bresponse\./g, 'res.');
    content = content.replace(/\brequest\./g, 'req.');
    content = content.replace(/\bresponse\b/g, 'res');
    content = content.replace(/\brequest\b/g, 'req');
    
    // Also `fetch` API might use Request/Response types.
    content = content.replace(/res: Vercelres/g, 'res: VercelResponse');
    content = content.replace(/req: Vercelreq/g, 'req: VercelRequest');
    
    // Fix imports
    content = content.replace(/Vercelres/g, 'VercelResponse');
    content = content.replace(/Vercelreq/g, 'VercelRequest');

    fs.writeFileSync(file, content);
}

function walkDir(dir) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = require('path').join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory) walkDir(dirPath);
        else if (dirPath.endsWith('.ts')) fix(dirPath);
    });
}
walkDir('api');
console.log("Done");
